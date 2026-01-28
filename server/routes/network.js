import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import dns from 'dns';
import https from 'https';
import http from 'http';
import logger from '../utils/logger.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { heavyLimiter } from '../middleware/rateLimiter.js';
import {
  startSampling,
  getHistory,
  getAggregatedHistory,
  getStatistics,
  detectVPN,
  quickPing,
  getWifiSignal,
  SAMPLE_INTERVAL_MS
} from '../services/networkHistory.js';

const router = Router();
const execAsync = promisify(exec);
const dnsResolve = promisify(dns.resolve);

// Strict IP address validation (prevents command injection)
const isValidIPv4 = (ip) => {
  if (typeof ip !== 'string') return false;
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every(part => {
    const num = parseInt(part, 10);
    return !isNaN(num) && num >= 0 && num <= 255 && String(num) === part;
  });
};

// Whitelist of allowed ping targets (hostnames)
const ALLOWED_HOSTNAMES = ['gateway'];

// Start background sampling when routes are loaded
startSampling().catch(err => logger.error('Failed to start network sampling:', err));

// Test targets for different metrics
const PING_TARGETS = [
  { name: 'Google DNS', host: '8.8.4.4', critical: false },
  { name: 'Cloudflare DNS', host: '1.1.1.1', critical: false },
  { name: 'Default Gateway', host: 'gateway', critical: true },
];

const DNS_TARGETS = [
  { name: 'google.com', type: 'A' },
  { name: 'cloudflare.com', type: 'A' },
  { name: 'amazon.com', type: 'A' },
];

const HTTP_TARGETS = [
  { name: 'Google', url: 'https://www.google.com', critical: false },
  { name: 'Cloudflare', url: 'https://www.cloudflare.com', critical: false },
  { name: 'Amazon', url: 'https://www.amazon.com', critical: false },
];

// Time period presets (in milliseconds)
const PERIODS = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000
};

// Bucket sizes for aggregation (to reduce data points for longer periods)
const BUCKET_SIZES = {
  '1h': SAMPLE_INTERVAL_MS,           // No aggregation for 1h (1 min samples)
  '6h': 5 * 60 * 1000,                // 5 min buckets for 6h
  '12h': 10 * 60 * 1000,              // 10 min buckets for 12h
  '24h': 15 * 60 * 1000,              // 15 min buckets for 24h
  '7d': 60 * 60 * 1000                // 1 hour buckets for 7d
};

// Parse ping output (works on macOS and Linux)
const parsePingOutput = (output) => {
  const result = {
    sent: 0,
    received: 0,
    lost: 0,
    lossPercent: 100,
    min: null,
    avg: null,
    max: null,
    times: []
  };

  try {
    // Extract individual ping times
    const timeMatches = output.matchAll(/time[=<](\d+\.?\d*)\s*ms/gi);
    for (const match of timeMatches) {
      result.times.push(parseFloat(match[1]));
    }

    // Extract packet statistics
    const packetMatch = output.match(/(\d+)\s+packets?\s+transmitted,\s+(\d+)\s+(?:packets?\s+)?received/i);
    if (packetMatch) {
      result.sent = parseInt(packetMatch[1]);
      result.received = parseInt(packetMatch[2]);
      result.lost = result.sent - result.received;
      result.lossPercent = result.sent > 0 ? ((result.lost / result.sent) * 100) : 100;
    }

    // Extract RTT statistics
    const rttMatch = output.match(/(?:rtt|round-trip)\s+min\/avg\/max\/(?:mdev|stddev)\s+=\s+([\d.]+)\/([\d.]+)\/([\d.]+)/i);
    if (rttMatch) {
      result.min = parseFloat(rttMatch[1]);
      result.avg = parseFloat(rttMatch[2]);
      result.max = parseFloat(rttMatch[3]);
    } else if (result.times.length > 0) {
      result.min = Math.min(...result.times);
      result.max = Math.max(...result.times);
      result.avg = result.times.reduce((a, b) => a + b, 0) / result.times.length;
    }
  } catch (e) {
    logger.error('Failed to parse ping output:', e);
  }

  return result;
};

// Get default gateway IP
const getDefaultGateway = async () => {
  try {
    // Use absolute path since PATH may not include /usr/sbin in some environments
    // Filter for actual IP addresses (not link# entries from VPN tunnels)
    const { stdout } = await execAsync('/usr/sbin/netstat -rn | grep default | grep -E "^default\\s+[0-9]" | head -1 | awk \'{print $2}\'');
    const gateway = stdout.trim();
    // Validate it looks like an IP address
    if (gateway && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(gateway)) {
      return gateway;
    }
    return '192.168.1.1';
  } catch {
    return '192.168.1.1';
  }
};

// Perform ping test
const pingHost = async (host, count = 10) => {
  // Security: Validate host is either a whitelisted hostname or valid IP
  let actualHost;
  if (ALLOWED_HOSTNAMES.includes(host)) {
    actualHost = host === 'gateway' ? await getDefaultGateway() : host;
  } else if (isValidIPv4(host)) {
    actualHost = host;
  } else {
    return {
      host,
      success: false,
      error: 'Invalid host: must be a valid IPv4 address',
      sent: 0,
      received: 0,
      lost: 0,
      lossPercent: 100,
      min: null,
      avg: null,
      max: null,
      times: [],
      duration: 0
    };
  }

  const startTime = Date.now();

  try {
    const isMac = process.platform === 'darwin';
    const timeoutFlag = isMac ? '-W 1000' : '-W 1';
    // Use absolute path for ping since PATH may not include /sbin in some environments
    const pingCmd = isMac ? '/sbin/ping' : 'ping';
    // Security: count is validated as integer, actualHost is validated above
    const safeCount = Math.max(1, Math.min(parseInt(count, 10) || 10, 20));
    const { stdout } = await execAsync(`${pingCmd} -c ${safeCount} ${timeoutFlag} ${actualHost}`, {
      timeout: 15000
    });

    const parsed = parsePingOutput(stdout);
    return {
      host: actualHost,
      success: parsed.received > 0,
      ...parsed,
      duration: Date.now() - startTime
    };
  } catch (error) {
    return {
      host: actualHost,
      success: false,
      sent: count,
      received: 0,
      lost: count,
      lossPercent: 100,
      min: null,
      avg: null,
      max: null,
      times: [],
      error: error.message,
      duration: Date.now() - startTime
    };
  }
};

// Perform DNS lookup
const dnsLookup = async (hostname, type = 'A') => {
  const startTime = Date.now();
  try {
    const addresses = await dnsResolve(hostname, type);
    return {
      hostname,
      success: true,
      addresses: Array.isArray(addresses) ? addresses : [addresses],
      latency: Date.now() - startTime
    };
  } catch (error) {
    return {
      hostname,
      success: false,
      error: error.message,
      latency: Date.now() - startTime
    };
  }
};

// Perform HTTP request timing
const httpTiming = async (url) => {
  const startTime = Date.now();
  const urlObj = new URL(url);
  const client = urlObj.protocol === 'https:' ? https : http;

  return new Promise((resolve) => {
    const timings = {
      dns: 0,
      connect: 0,
      ttfb: 0,
      total: 0
    };

    let dnsStart = startTime;
    let connectStart = 0;

    const req = client.request(url, {
      method: 'HEAD',
      timeout: 10000,
      headers: {
        'User-Agent': 'SkyeJS-Network-Monitor/1.0'
      }
    }, (res) => {
      timings.ttfb = Date.now() - startTime;

      res.on('data', () => {});
      res.on('end', () => {
        timings.total = Date.now() - startTime;
        resolve({
          url,
          success: true,
          statusCode: res.statusCode,
          timings
        });
      });
    });

    req.on('socket', (socket) => {
      socket.on('lookup', () => {
        timings.dns = Date.now() - dnsStart;
        connectStart = Date.now();
      });
      socket.on('connect', () => {
        timings.connect = Date.now() - connectStart;
      });
    });

    req.on('error', (error) => {
      resolve({
        url,
        success: false,
        error: error.message,
        timings: { total: Date.now() - startTime }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        url,
        success: false,
        error: 'Request timed out',
        timings: { total: Date.now() - startTime }
      });
    });

    req.end();
  });
};

// Calculate jitter from ping times
const calculateJitter = (times) => {
  if (times.length < 2) return 0;
  let jitterSum = 0;
  for (let i = 1; i < times.length; i++) {
    jitterSum += Math.abs(times[i] - times[i - 1]);
  }
  return jitterSum / (times.length - 1);
};

// Determine health status
const getHealthStatus = (metrics) => {
  const { latency, packetLoss, jitter } = metrics;

  if (packetLoss >= 10 || latency >= 200 || jitter >= 50) {
    return 'critical';
  }
  if (packetLoss >= 2 || latency >= 100 || jitter >= 20) {
    return 'warning';
  }
  return 'healthy';
};

// ============ CURRENT STATUS ENDPOINTS ============

// Quick current status (for top of page)
router.get('/current', asyncHandler(async (req, res) => {
  const startTime = Date.now();

  const [pingResult, vpnStatus, wifiSignal] = await Promise.all([
    quickPing(),
    detectVPN(),
    getWifiSignal()
  ]);

  const health = getHealthStatus({
    latency: pingResult.latency,
    packetLoss: pingResult.packetLoss,
    jitter: 0
  });

  res.json({
    timestamp: new Date().toISOString(),
    health,
    latency: pingResult.latency,
    packetLoss: pingResult.packetLoss,
    success: pingResult.success,
    vpn: {
      connected: vpnStatus.connected,
      name: vpnStatus.name
    },
    wifi: {
      signal: wifiSignal.signal,
      noise: wifiSignal.noise,
      snr: wifiSignal.snr,
      quality: wifiSignal.quality,
      connected: wifiSignal.connected
    },
    target: '8.8.4.4',
    duration: Date.now() - startTime
  });
}));

// Full network diagnostics (rate limited - runs many shell commands)
router.get('/diagnostics', heavyLimiter, asyncHandler(async (req, res) => {
  logger.info('Starting network diagnostics');
  const startTime = Date.now();

  const [pingResults, dnsResults, httpResults, vpnStatus] = await Promise.all([
    Promise.all(PING_TARGETS.map(async (target) => {
      const result = await pingHost(target.host, 10);
      return {
        name: target.name,
        critical: target.critical,
        ...result,
        jitter: calculateJitter(result.times)
      };
    })),
    Promise.all(DNS_TARGETS.map(async (target) => {
      return await dnsLookup(target.name, target.type);
    })),
    Promise.all(HTTP_TARGETS.map(async (target) => {
      const result = await httpTiming(target.url);
      return {
        name: target.name,
        ...result
      };
    })),
    detectVPN()
  ]);

  const successfulPings = pingResults.filter(p => p.success);
  const avgLatency = successfulPings.length > 0
    ? successfulPings.reduce((sum, p) => sum + (p.avg || 0), 0) / successfulPings.length
    : null;
  const avgPacketLoss = pingResults.reduce((sum, p) => sum + p.lossPercent, 0) / pingResults.length;
  const avgJitter = successfulPings.length > 0
    ? successfulPings.reduce((sum, p) => sum + p.jitter, 0) / successfulPings.length
    : null;

  const dnsSuccessRate = (dnsResults.filter(d => d.success).length / dnsResults.length) * 100;
  const httpSuccessRate = (httpResults.filter(h => h.success).length / httpResults.length) * 100;

  const overallHealth = getHealthStatus({
    latency: avgLatency,
    packetLoss: avgPacketLoss,
    jitter: avgJitter
  });

  const diagnostics = {
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime,
    health: overallHealth,
    vpn: {
      connected: vpnStatus.connected,
      name: vpnStatus.name
    },
    summary: {
      latency: avgLatency ? Math.round(avgLatency * 100) / 100 : null,
      packetLoss: Math.round(avgPacketLoss * 100) / 100,
      jitter: avgJitter ? Math.round(avgJitter * 100) / 100 : null,
      dnsSuccessRate: Math.round(dnsSuccessRate),
      httpSuccessRate: Math.round(httpSuccessRate)
    },
    ping: pingResults,
    dns: dnsResults,
    http: httpResults
  };

  logger.info(`Network diagnostics completed: health=${overallHealth}, latency=${avgLatency?.toFixed(1)}ms, loss=${avgPacketLoss.toFixed(1)}%`);
  res.json(diagnostics);
}));

// ============ HISTORY ENDPOINTS ============

// Get history for a specific period
router.get('/history/:period', asyncHandler(async (req, res) => {
  const { period } = req.params;

  if (!PERIODS[period]) {
    return res.status(400).json({
      error: 'Invalid period',
      validPeriods: Object.keys(PERIODS)
    });
  }

  const periodMs = PERIODS[period];
  const bucketSize = BUCKET_SIZES[period];

  // Use aggregation for longer periods
  const samples = period === '1h'
    ? getHistory(periodMs)
    : getAggregatedHistory(periodMs, bucketSize);

  res.json({
    period,
    periodMs,
    bucketSize,
    sampleCount: samples.length,
    samples,
    target: '8.8.4.4'
  });
}));

// Get statistics for a specific period
router.get('/stats/:period', asyncHandler(async (req, res) => {
  const { period } = req.params;

  if (!PERIODS[period]) {
    return res.status(400).json({
      error: 'Invalid period',
      validPeriods: Object.keys(PERIODS)
    });
  }

  const stats = getStatistics(PERIODS[period]);

  res.json({
    period,
    ...stats,
    target: '8.8.4.4'
  });
}));

// Get all available periods and their stats summary
router.get('/history', asyncHandler(async (req, res) => {
  const summary = {};

  for (const [period, ms] of Object.entries(PERIODS)) {
    const stats = getStatistics(ms);
    summary[period] = {
      sampleCount: stats.sampleCount,
      latencyAvg: stats.latency.avg,
      packetLossAvg: stats.packetLoss.avg,
      uptime: stats.uptime,
      vpnTime: stats.vpnTime,
      gapCount: stats.gaps.length
    };
  }

  res.json({
    periods: Object.keys(PERIODS),
    summary,
    target: '8.8.4.4',
    sampleInterval: SAMPLE_INTERVAL_MS
  });
}));

// ============ LEGACY ENDPOINTS ============

// Quick ping test (single target)
router.get('/ping', asyncHandler(async (req, res) => {
  const { host = '8.8.4.4', count = 5 } = req.query;
  const result = await pingHost(host, Math.min(parseInt(count) || 5, 20));
  result.jitter = calculateJitter(result.times);
  res.json(result);
}));

// Quick connectivity check
router.get('/status', asyncHandler(async (req, res) => {
  const startTime = Date.now();

  const [gateway, dnsResult, httpResult] = await Promise.all([
    pingHost('gateway', 3),
    dnsLookup('google.com'),
    httpTiming('https://www.google.com')
  ]);

  const isConnected = gateway.success || dnsResult.success || httpResult.success;
  const health = gateway.lossPercent > 0 || !dnsResult.success ? 'degraded' : 'healthy';

  res.json({
    connected: isConnected,
    health,
    latency: gateway.avg,
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime
  });
}));

export default router;
