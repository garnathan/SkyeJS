import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger.js';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const HISTORY_FILE = join(DATA_DIR, 'network-history.json');

// Configuration
const SAMPLE_INTERVAL_MS = 10000; // Sample every 10 seconds
const MAX_HISTORY_DAYS = 7; // Keep 7 days of history
const MAX_SAMPLES = (MAX_HISTORY_DAYS * 24 * 60 * 6); // ~60,480 samples for a week at 6/min
const PING_HOST = '8.8.4.4'; // Google DNS as requested
const PING_COUNT = 1; // Single ping for faster sampling

// In-memory history buffer
let historyData = {
  samples: [],
  lastSample: null,
  samplingActive: false
};

let samplingInterval = null;

// Detect VPN connection
const detectVPN = async () => {
  try {
    const isMac = process.platform === 'darwin';

    if (isMac) {
      // Primary method: Check scutil for active VPN connections
      // This is the most reliable way to detect actual VPN state
      const { stdout: scutil } = await execAsync('scutil --nc list 2>/dev/null || true');
      const hasActiveVpn = /Connected/.test(scutil);

      // Try to get VPN name from scutil
      let vpnName = null;
      if (hasActiveVpn) {
        const nameMatch = scutil.match(/"([^"]+)".*Connected/);
        if (nameMatch) vpnName = nameMatch[1];
      }

      // Secondary method: Check for Cisco AnyConnect specifically
      // AnyConnect keeps daemons running but we need to check actual connection state
      let ciscoConnected = false;
      try {
        // Check if AnyConnect reports as connected via its status
        const { stdout: vpnStatus } = await execAsync('/opt/cisco/secureclient/bin/vpn state 2>/dev/null || true');
        ciscoConnected = /state: Connected/i.test(vpnStatus);
        if (ciscoConnected && !vpnName) {
          vpnName = 'Cisco AnyConnect';
        }
      } catch {
        // AnyConnect not installed or command failed
      }

      // Tertiary method: Check for Oracle Unified Login VPN
      let oracleConnected = false;
      try {
        // Check if Oracle VPN helper reports connected
        const { stdout: oracleStatus } = await execAsync('defaults read /Users/$USER/Library/Preferences/com.oracle.oul 2>/dev/null | grep -i connected || true');
        oracleConnected = /true/i.test(oracleStatus);
        if (oracleConnected && !vpnName) {
          vpnName = 'Oracle VPN';
        }
      } catch {
        // Oracle VPN not installed or command failed
      }

      // Check for ppp interfaces (PPTP/L2TP VPNs) - these only exist when connected
      const { stdout: ifconfig } = await execAsync('/sbin/ifconfig 2>/dev/null || true');
      const hasPpp = /ppp\d+/.test(ifconfig);

      const vpnDetected = hasActiveVpn || ciscoConnected || oracleConnected || hasPpp;

      return {
        connected: vpnDetected,
        name: vpnName,
        method: hasActiveVpn ? 'scutil' : ciscoConnected ? 'cisco' : oracleConnected ? 'oracle' : hasPpp ? 'ppp' : null
      };
    } else {
      // Linux VPN detection
      const { stdout: ifconfig } = await execAsync('ip link 2>/dev/null || ifconfig 2>/dev/null || true');
      const hasTun = /tun\d+|tap\d+|wg\d+/.test(ifconfig);

      return {
        connected: hasTun,
        name: null,
        method: hasTun ? 'tun' : null
      };
    }
  } catch (error) {
    logger.debug('VPN detection error:', error.message);
    return { connected: false, name: null, method: null };
  }
};

// Get Wi-Fi signal strength
const getWifiSignal = async () => {
  try {
    const isMac = process.platform === 'darwin';

    if (isMac) {
      // Use system_profiler to get Wi-Fi info on macOS
      const { stdout } = await execAsync('/usr/sbin/system_profiler SPAirPortDataType 2>/dev/null | grep -A 10 "Current Network Information"', {
        timeout: 5000
      });

      // Parse signal strength (e.g., "Signal / Noise: -48 dBm / -94 dBm")
      const signalMatch = stdout.match(/Signal\s*\/\s*Noise:\s*(-?\d+)\s*dBm\s*\/\s*(-?\d+)\s*dBm/i);
      if (signalMatch) {
        const signal = parseInt(signalMatch[1]);
        const noise = parseInt(signalMatch[2]);
        const snr = signal - noise; // Signal-to-noise ratio

        // Convert dBm to percentage (rough approximation)
        // -30 dBm = excellent (100%), -90 dBm = unusable (0%)
        const quality = Math.max(0, Math.min(100, Math.round((signal + 90) * (100 / 60))));

        return {
          signal,
          noise,
          snr,
          quality,
          connected: true
        };
      }

      return { signal: null, noise: null, snr: null, quality: null, connected: false };
    } else {
      // Linux Wi-Fi signal detection
      const { stdout } = await execAsync('iwconfig 2>/dev/null | grep -i "signal level" || true');
      const match = stdout.match(/Signal level[=:]?\s*(-?\d+)/i);
      if (match) {
        const signal = parseInt(match[1]);
        const quality = Math.max(0, Math.min(100, Math.round((signal + 90) * (100 / 60))));
        return { signal, noise: null, snr: null, quality, connected: true };
      }
      return { signal: null, noise: null, snr: null, quality: null, connected: false };
    }
  } catch (error) {
    logger.debug('Wi-Fi signal detection error:', error.message);
    return { signal: null, noise: null, snr: null, quality: null, connected: false };
  }
};

// Quick ping for sampling (faster than full diagnostics)
const quickPing = async () => {
  const startTime = Date.now();

  try {
    const isMac = process.platform === 'darwin';
    const timeoutFlag = isMac ? '-W 1000' : '-W 1';
    // Use absolute path for ping since PATH may not include /sbin in some environments
    const pingCmd = isMac ? '/sbin/ping' : 'ping';
    const cmd = `${pingCmd} -c ${PING_COUNT} ${timeoutFlag} ${PING_HOST}`;
    logger.debug(`Running ping command: ${cmd}`);
    const { stdout, stderr } = await execAsync(cmd, {
      timeout: 10000
    });
    logger.debug(`Ping stdout length: ${stdout.length}, stderr: ${stderr || 'none'}`);

    // Parse results
    const times = [];
    const timeMatches = stdout.matchAll(/time[=<](\d+\.?\d*)\s*ms/gi);
    for (const match of timeMatches) {
      times.push(parseFloat(match[1]));
    }

    const packetMatch = stdout.match(/(\d+)\s+packets?\s+transmitted,\s+(\d+)\s+(?:packets?\s+)?received/i);
    const sent = packetMatch ? parseInt(packetMatch[1]) : PING_COUNT;
    const received = packetMatch ? parseInt(packetMatch[2]) : 0;
    const lossPercent = sent > 0 ? ((sent - received) / sent) * 100 : 100;

    const avgLatency = times.length > 0
      ? times.reduce((a, b) => a + b, 0) / times.length
      : null;

    return {
      success: received > 0,
      latency: avgLatency ? Math.round(avgLatency * 100) / 100 : null,
      packetLoss: Math.round(lossPercent * 100) / 100,
      duration: Date.now() - startTime
    };
  } catch (error) {
    return {
      success: false,
      latency: null,
      packetLoss: 100,
      error: error.message,
      duration: Date.now() - startTime
    };
  }
};

// Load history from disk
const loadHistory = async () => {
  try {
    if (existsSync(HISTORY_FILE)) {
      const data = await readFile(HISTORY_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      historyData.samples = parsed.samples || [];
      historyData.lastSample = parsed.lastSample || null;
      logger.info(`Loaded ${historyData.samples.length} network history samples`);
    }
  } catch (error) {
    logger.error('Failed to load network history:', error);
    historyData.samples = [];
  }
};

// Save history to disk
const saveHistory = async () => {
  try {
    if (!existsSync(DATA_DIR)) {
      await mkdir(DATA_DIR, { recursive: true });
    }
    await writeFile(HISTORY_FILE, JSON.stringify({
      samples: historyData.samples,
      lastSample: historyData.lastSample,
      savedAt: new Date().toISOString()
    }, null, 2));
  } catch (error) {
    logger.error('Failed to save network history:', error);
  }
};

// Prune old samples
const pruneHistory = () => {
  const cutoff = Date.now() - (MAX_HISTORY_DAYS * 24 * 60 * 60 * 1000);
  const before = historyData.samples.length;
  historyData.samples = historyData.samples.filter(s => s.timestamp > cutoff);

  // Also limit by count
  if (historyData.samples.length > MAX_SAMPLES) {
    historyData.samples = historyData.samples.slice(-MAX_SAMPLES);
  }

  const pruned = before - historyData.samples.length;
  if (pruned > 0) {
    logger.debug(`Pruned ${pruned} old network samples`);
  }
};

// Take a sample
const takeSample = async () => {
  try {
    const [pingResult, vpnStatus, wifiSignal] = await Promise.all([
      quickPing(),
      detectVPN(),
      getWifiSignal()
    ]);

    const sample = {
      timestamp: Date.now(),
      latency: pingResult.latency,
      packetLoss: pingResult.packetLoss,
      success: pingResult.success,
      vpn: vpnStatus.connected,
      vpnName: vpnStatus.name,
      wifi: {
        signal: wifiSignal.signal,
        noise: wifiSignal.noise,
        snr: wifiSignal.snr,
        quality: wifiSignal.quality,
        connected: wifiSignal.connected
      }
    };

    historyData.samples.push(sample);
    historyData.lastSample = sample;

    // Prune and save periodically (every 10 samples)
    if (historyData.samples.length % 10 === 0) {
      pruneHistory();
      await saveHistory();
    }

    logger.debug(`Network sample: latency=${sample.latency}ms, loss=${sample.packetLoss}%, vpn=${sample.vpn}, wifi=${sample.wifi.signal}dBm`);

    return sample;
  } catch (error) {
    logger.error('Failed to take network sample:', error);
    return null;
  }
};

// Start background sampling
const startSampling = async () => {
  if (historyData.samplingActive) {
    logger.debug('Network sampling already active');
    return;
  }

  await loadHistory();

  // Take immediate sample
  await takeSample();

  // Start interval
  samplingInterval = setInterval(takeSample, SAMPLE_INTERVAL_MS);
  historyData.samplingActive = true;

  logger.info(`Network sampling started (every ${SAMPLE_INTERVAL_MS / 1000}s to ${PING_HOST})`);
};

// Stop background sampling
const stopSampling = async () => {
  if (samplingInterval) {
    clearInterval(samplingInterval);
    samplingInterval = null;
  }
  historyData.samplingActive = false;
  await saveHistory();
  logger.info('Network sampling stopped');
};

// Get history for a time period
const getHistory = (periodMs) => {
  const cutoff = Date.now() - periodMs;
  return historyData.samples.filter(s => s.timestamp > cutoff);
};

// Get aggregated history (for longer periods, aggregate to reduce data points)
const getAggregatedHistory = (periodMs, bucketSizeMs) => {
  const samples = getHistory(periodMs);
  if (samples.length === 0) return [];

  const buckets = new Map();

  for (const sample of samples) {
    const bucketTime = Math.floor(sample.timestamp / bucketSizeMs) * bucketSizeMs;

    if (!buckets.has(bucketTime)) {
      buckets.set(bucketTime, {
        timestamp: bucketTime,
        latencies: [],
        packetLosses: [],
        vpnSamples: [],
        wifiSignals: [],
        wifiQualities: [],
        count: 0
      });
    }

    const bucket = buckets.get(bucketTime);
    if (sample.latency !== null) bucket.latencies.push(sample.latency);
    bucket.packetLosses.push(sample.packetLoss);
    bucket.vpnSamples.push(sample.vpn);
    if (sample.wifi?.signal !== null) bucket.wifiSignals.push(sample.wifi.signal);
    if (sample.wifi?.quality !== null) bucket.wifiQualities.push(sample.wifi.quality);
    bucket.count++;
  }

  // Convert buckets to aggregated samples
  const result = [];
  for (const [time, bucket] of buckets) {
    const avgLatency = bucket.latencies.length > 0
      ? bucket.latencies.reduce((a, b) => a + b, 0) / bucket.latencies.length
      : null;
    const avgPacketLoss = bucket.packetLosses.reduce((a, b) => a + b, 0) / bucket.packetLosses.length;
    const vpnRatio = bucket.vpnSamples.filter(v => v).length / bucket.vpnSamples.length;
    const avgWifiSignal = bucket.wifiSignals.length > 0
      ? bucket.wifiSignals.reduce((a, b) => a + b, 0) / bucket.wifiSignals.length
      : null;
    const avgWifiQuality = bucket.wifiQualities.length > 0
      ? bucket.wifiQualities.reduce((a, b) => a + b, 0) / bucket.wifiQualities.length
      : null;

    result.push({
      timestamp: time,
      latency: avgLatency ? Math.round(avgLatency * 100) / 100 : null,
      packetLoss: Math.round(avgPacketLoss * 100) / 100,
      vpn: vpnRatio > 0.5, // VPN if majority of samples had VPN
      wifi: {
        signal: avgWifiSignal ? Math.round(avgWifiSignal) : null,
        quality: avgWifiQuality ? Math.round(avgWifiQuality) : null
      },
      sampleCount: bucket.count
    });
  }

  return result.sort((a, b) => a.timestamp - b.timestamp);
};

// Detect gaps in data (laptop sleep/off)
const detectGaps = (samples, expectedIntervalMs = SAMPLE_INTERVAL_MS, gapThresholdMultiplier = 3) => {
  const gaps = [];
  const threshold = expectedIntervalMs * gapThresholdMultiplier;

  for (let i = 1; i < samples.length; i++) {
    const timeDiff = samples[i].timestamp - samples[i - 1].timestamp;
    if (timeDiff > threshold) {
      gaps.push({
        start: samples[i - 1].timestamp,
        end: samples[i].timestamp,
        duration: timeDiff
      });
    }
  }

  return gaps;
};

// Get statistics for a period
const getStatistics = (periodMs) => {
  const samples = getHistory(periodMs);

  if (samples.length === 0) {
    return {
      sampleCount: 0,
      period: periodMs,
      latency: { avg: null, min: null, max: null, p95: null },
      packetLoss: { avg: null, min: null, max: null },
      wifi: { avgSignal: null, minSignal: null, maxSignal: null, avgQuality: null },
      vpnTime: 0,
      uptime: 0,
      gaps: []
    };
  }

  const latencies = samples.filter(s => s.latency !== null).map(s => s.latency);
  const losses = samples.map(s => s.packetLoss);
  const wifiSignals = samples.filter(s => s.wifi?.signal !== null).map(s => s.wifi.signal);
  const wifiQualities = samples.filter(s => s.wifi?.quality !== null).map(s => s.wifi.quality);
  const vpnSamples = samples.filter(s => s.vpn).length;
  const successSamples = samples.filter(s => s.success).length;

  // Calculate p95 latency
  const sortedLatencies = [...latencies].sort((a, b) => a - b);
  const p95Index = Math.floor(sortedLatencies.length * 0.95);
  const p95Latency = sortedLatencies[p95Index] || null;

  const gaps = detectGaps(samples);

  return {
    sampleCount: samples.length,
    period: periodMs,
    latency: {
      avg: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length * 100) / 100 : null,
      min: latencies.length > 0 ? Math.min(...latencies) : null,
      max: latencies.length > 0 ? Math.max(...latencies) : null,
      p95: p95Latency ? Math.round(p95Latency * 100) / 100 : null
    },
    packetLoss: {
      avg: Math.round(losses.reduce((a, b) => a + b, 0) / losses.length * 100) / 100,
      min: Math.min(...losses),
      max: Math.max(...losses)
    },
    wifi: {
      avgSignal: wifiSignals.length > 0 ? Math.round(wifiSignals.reduce((a, b) => a + b, 0) / wifiSignals.length) : null,
      minSignal: wifiSignals.length > 0 ? Math.min(...wifiSignals) : null,
      maxSignal: wifiSignals.length > 0 ? Math.max(...wifiSignals) : null,
      avgQuality: wifiQualities.length > 0 ? Math.round(wifiQualities.reduce((a, b) => a + b, 0) / wifiQualities.length) : null
    },
    vpnTime: Math.round(vpnSamples / samples.length * 100),
    uptime: Math.round(successSamples / samples.length * 100),
    gaps,
    firstSample: samples[0]?.timestamp,
    lastSample: samples[samples.length - 1]?.timestamp
  };
};

// Export functions
export {
  startSampling,
  stopSampling,
  takeSample,
  getHistory,
  getAggregatedHistory,
  getStatistics,
  detectGaps,
  detectVPN,
  quickPing,
  getWifiSignal,
  SAMPLE_INTERVAL_MS
};

export default {
  startSampling,
  stopSampling,
  takeSample,
  getHistory,
  getAggregatedHistory,
  getStatistics,
  detectGaps,
  detectVPN,
  quickPing,
  getWifiSignal
};
