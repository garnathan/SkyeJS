import logger from '../utils/logger.js';
import config from '../config/index.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createSession } from './tapoKlap.js';
import { networkInterfaces } from 'os';
import http from 'http';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const DEVICES_FILE = join(DATA_DIR, 'tapo-devices.json');

// Cache of logged-in device sessions
const deviceSessions = new Map();

// Configured devices (IP addresses and names)
let configuredDevices = [];

// Load configured devices from file
const loadDevices = async () => {
  try {
    if (existsSync(DEVICES_FILE)) {
      const data = await readFile(DEVICES_FILE, 'utf-8');
      configuredDevices = JSON.parse(data);
      logger.info(`Loaded ${configuredDevices.length} Tapo devices from config`);
    }
  } catch (error) {
    logger.error('Failed to load Tapo devices config:', error);
    configuredDevices = [];
  }
  return configuredDevices;
};

// Save configured devices to file
const saveDevices = async () => {
  try {
    if (!existsSync(DATA_DIR)) {
      await mkdir(DATA_DIR, { recursive: true });
    }
    await writeFile(DEVICES_FILE, JSON.stringify(configuredDevices, null, 2));
    logger.info('Saved Tapo devices config');
  } catch (error) {
    logger.error('Failed to save Tapo devices config:', error);
  }
};

// Get Tapo credentials from config
const getCredentials = () => {
  const email = config.tapo?.email || process.env.TAPO_EMAIL;
  const password = config.tapo?.password || process.env.TAPO_PASSWORD;

  if (!email || !password) {
    throw new Error('Tapo credentials not configured. Set TAPO_EMAIL and TAPO_PASSWORD in settings.');
  }

  return { email, password };
};

// Get or create a device session (using KLAP protocol)
const getDeviceSession = async (deviceIp, forceNew = false) => {
  // Check cache first (unless forcing new session)
  if (!forceNew) {
    const cached = deviceSessions.get(deviceIp);
    if (cached && cached.expiry > Date.now()) {
      return cached.session;
    }
  }

  // Clear any existing expired/stale session
  deviceSessions.delete(deviceIp);

  const { email, password } = getCredentials();

  try {
    logger.debug(`Creating KLAP session for Tapo device at ${deviceIp}`);
    const session = createSession(deviceIp, email, password);

    // Perform handshake to establish connection
    await session.handshake();

    // Cache for 5 minutes (reduced to get fresher state more often)
    deviceSessions.set(deviceIp, {
      session,
      expiry: Date.now() + 5 * 60 * 1000,
    });

    return session;
  } catch (error) {
    // Clear failed session from cache
    deviceSessions.delete(deviceIp);
    logger.error(`Failed to create KLAP session for ${deviceIp}:`, error);
    throw new Error(`Failed to connect to Tapo device: ${error.message}`);
  }
};

// Decode base64 nickname (Tapo API returns nicknames as base64)
const decodeNickname = (nickname) => {
  if (!nickname) return 'Unnamed Device';
  try {
    return Buffer.from(nickname, 'base64').toString('utf-8');
  } catch {
    return nickname; // Return as-is if not valid base64
  }
};

// Get device info
const getDeviceInfo = async (deviceIp) => {
  const session = await getDeviceSession(deviceIp);
  const info = await session.getDeviceInfo();

  return {
    deviceId: info.device_id,
    nickname: decodeNickname(info.nickname),
    model: info.model,
    type: info.type,
    isOn: info.device_on,
    brightness: info.brightness,
    colorTemp: info.color_temp,
    hue: info.hue,
    saturation: info.saturation,
    signalLevel: info.signal_level,
    overheated: info.overheated,
  };
};

// Get device info with retry on failure (clear session and try once more)
const getDeviceInfoWithRetry = async (deviceIp) => {
  try {
    return await getDeviceInfo(deviceIp);
  } catch (firstError) {
    // Clear session and retry once
    deviceSessions.delete(deviceIp);
    logger.debug(`Tapo ${deviceIp}: First attempt failed, retrying with fresh session`);
    return await getDeviceInfo(deviceIp);
  }
};

// Cached device state (updated when we successfully connect)
const cachedDeviceState = new Map();

// Get all configured devices WITHOUT connecting (fast, uses cached state)
const getDevices = async () => {
  await loadDevices();

  // Return configured devices with cached state (no network calls)
  return configuredDevices.map((device) => {
    const cached = cachedDeviceState.get(device.ip);
    return {
      id: device.ip,
      ip: device.ip,
      name: device.name || cached?.name || 'Unknown',
      model: device.model || cached?.model || 'Unknown',
      type: 'tapo',
      deviceType: cached?.deviceType,
      capabilities: device.capabilities || cached?.capabilities || ['on_off'],
      state: cached?.state || { isOn: false },
      online: cached?.online ?? false,
      lastSeen: cached?.lastSeen,
    };
  });
};

// Refresh all devices by actually connecting (slower, use for explicit refresh)
const refreshDevices = async () => {
  await loadDevices();

  // Fetch all devices in parallel for better performance
  const devicePromises = configuredDevices.map(async (device) => {
    try {
      const info = await getDeviceInfoWithRetry(device.ip);
      const deviceData = {
        id: device.ip,
        ip: device.ip,
        name: device.name || info.nickname,
        model: info.model,
        type: 'tapo',
        deviceType: info.type,
        capabilities: getCapabilities(info.model),
        state: {
          isOn: info.isOn,
          brightness: info.brightness,
          colorTemp: info.colorTemp,
          hue: info.hue,
          saturation: info.saturation,
        },
        online: true,
        lastSeen: Date.now(),
      };
      // Cache the successful state
      cachedDeviceState.set(device.ip, deviceData);
      return deviceData;
    } catch (error) {
      logger.warn(`Tapo device ${device.ip} offline or unreachable: ${error.message}`);
      const cached = cachedDeviceState.get(device.ip);
      const deviceData = {
        id: device.ip,
        ip: device.ip,
        name: device.name || cached?.name || 'Unknown',
        model: device.model || cached?.model || 'Unknown',
        type: 'tapo',
        capabilities: device.capabilities || cached?.capabilities || ['on_off'],
        state: cached?.state || { isOn: false },
        online: false,
        error: error.message,
      };
      // Update cache to mark offline
      cachedDeviceState.set(device.ip, { ...deviceData, online: false });
      return deviceData;
    }
  });

  return Promise.all(devicePromises);
};

// Determine capabilities based on model
const getCapabilities = (model) => {
  const modelUpper = (model || '').toUpperCase();

  // Smart plugs - just on/off
  if (modelUpper.startsWith('P1') || modelUpper.includes('PLUG')) {
    if (modelUpper === 'P110' || modelUpper === 'P115') {
      return ['on_off', 'energy_monitoring'];
    }
    return ['on_off'];
  }

  // Smart bulbs
  if (modelUpper.startsWith('L5')) {
    if (modelUpper === 'L530' || modelUpper === 'L535') {
      return ['on_off', 'brightness', 'color', 'color_temp'];
    }
    return ['on_off', 'brightness'];
  }

  // Light strips
  if (modelUpper.startsWith('L9')) {
    return ['on_off', 'brightness', 'color'];
  }

  return ['on_off'];
};

// Add a new device
const addDevice = async (ip, name, model) => {
  await loadDevices();

  // Check if already exists
  const existing = configuredDevices.find(d => d.ip === ip);
  if (existing) {
    throw new Error(`Device with IP ${ip} already configured`);
  }

  // Try to get device info to validate and get real nickname
  let deviceInfo;
  try {
    deviceInfo = await getDeviceInfo(ip);
  } catch {
    // Device might be offline, still allow adding
    logger.warn(`Could not connect to device at ${ip}, adding anyway`);
  }

  // Prefer device's actual nickname from API, unless user explicitly provided a custom name
  // Skip generic/placeholder names that indicate no real name was provided
  const isGenericName = !name || !name.trim() ||
    name.toLowerCase().includes('new tapo') ||
    name.toLowerCase().includes('unknown') ||
    name === 'Tapo Device';
  const deviceName = isGenericName ? (deviceInfo?.nickname || name || 'Tapo Device') : name;

  const newDevice = {
    ip,
    name: deviceName,
    model: model || deviceInfo?.model || 'Unknown',
    capabilities: getCapabilities(deviceInfo?.model || model),
    addedAt: new Date().toISOString(),
  };

  configuredDevices.push(newDevice);
  await saveDevices();

  logger.info(`Added Tapo device: ${newDevice.name} (${ip})`);
  return newDevice;
};

// Remove a device
const removeDevice = async (ip) => {
  await loadDevices();

  const index = configuredDevices.findIndex(d => d.ip === ip);
  if (index === -1) {
    throw new Error(`Device with IP ${ip} not found`);
  }

  configuredDevices.splice(index, 1);
  deviceSessions.delete(ip);
  await saveDevices();

  logger.info(`Removed Tapo device: ${ip}`);
  return { success: true };
};

// Turn device on
const turnOn = async (deviceIp) => {
  const session = await getDeviceSession(deviceIp);
  await session.turnOn();
  logger.info(`Tapo device ${deviceIp} turned ON`);
  // Update cached state
  const cached = cachedDeviceState.get(deviceIp);
  if (cached) {
    cached.state = { ...cached.state, isOn: true };
    cached.online = true;
    cached.lastSeen = Date.now();
    cachedDeviceState.set(deviceIp, cached);
  }
  return { success: true };
};

// Turn device off
const turnOff = async (deviceIp) => {
  const session = await getDeviceSession(deviceIp);
  await session.turnOff();
  logger.info(`Tapo device ${deviceIp} turned OFF`);
  // Update cached state
  const cached = cachedDeviceState.get(deviceIp);
  if (cached) {
    cached.state = { ...cached.state, isOn: false };
    cached.online = true;
    cached.lastSeen = Date.now();
    cachedDeviceState.set(deviceIp, cached);
  }
  return { success: true };
};

// Set brightness (for bulbs)
const setBrightness = async (deviceIp, brightness) => {
  const session = await getDeviceSession(deviceIp);
  const value = Math.max(1, Math.min(100, brightness));
  await session.setBrightness(value);
  logger.info(`Tapo device ${deviceIp} brightness set to ${value}%`);
  return { success: true };
};

// Set color (for color bulbs)
const setColor = async (deviceIp, color) => {
  const session = await getDeviceSession(deviceIp);

  if (typeof color === 'string') {
    // Hex color - convert to HSV
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    let hue = 0;
    if (delta !== 0) {
      if (max === r) hue = 60 * (((g - b) / delta) % 6);
      else if (max === g) hue = 60 * ((b - r) / delta + 2);
      else hue = 60 * ((r - g) / delta + 4);
    }
    if (hue < 0) hue += 360;

    const saturation = max === 0 ? 0 : Math.round((delta / max) * 100);

    await session.setColor(Math.round(hue), saturation);
  } else if (color.hue !== undefined) {
    // HSV format
    await session.setColor(color.hue, color.saturation || 100);
  }

  logger.info(`Tapo device ${deviceIp} color set`);
  return { success: true };
};

// Set color temperature (for bulbs that support it)
const setColorTemp = async (deviceIp, temp) => {
  const session = await getDeviceSession(deviceIp);
  await session.setColorTemp(temp);
  logger.info(`Tapo device ${deviceIp} color temp set to ${temp}K`);
  return { success: true };
};

// ============ DEVICE DISCOVERY ============

// Get all local network subnets from network interfaces
const getLocalSubnets = () => {
  const subnets = new Set();
  const interfaces = networkInterfaces();

  for (const [name, addrs] of Object.entries(interfaces)) {
    // Skip loopback and virtual interfaces
    if (name.startsWith('lo') || name.startsWith('docker') || name.startsWith('br-')) {
      continue;
    }

    for (const addr of addrs) {
      // Only IPv4 addresses
      if (addr.family === 'IPv4' && !addr.internal) {
        // Calculate subnet base from IP and netmask
        const ipParts = addr.address.split('.').map(Number);
        const maskParts = addr.netmask.split('.').map(Number);

        // Calculate network address
        const networkParts = ipParts.map((ip, i) => ip & maskParts[i]);
        const subnet = networkParts.join('.');

        // Only add if it's a /24 or smaller (we'll scan as /24)
        if (maskParts[3] === 0) {
          subnets.add(subnet);
          logger.debug(`Found subnet: ${subnet} on interface ${name}`);
        }
      }
    }
  }

  return Array.from(subnets);
};

// Check if an IP responds to Tapo KLAP handshake
const checkTapoDevice = (ip, timeout = 2000) => {
  return new Promise((resolve) => {
    const localSeed = crypto.randomBytes(16);

    const req = http.request({
      hostname: ip,
      port: 80,
      path: '/app/handshake1',
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': 16,
      },
      timeout,
    }, (res) => {
      if (res.statusCode === 200) {
        // It's a Tapo device! Try to get more info
        resolve({ ip, isTapo: true });
      } else {
        resolve({ ip, isTapo: false });
      }
      res.resume(); // Consume response data
    });

    req.on('error', () => resolve({ ip, isTapo: false }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ip, isTapo: false });
    });

    req.write(localSeed);
    req.end();
  });
};

// Scan a subnet for Tapo devices
const scanSubnet = async (subnet, onProgress) => {
  const found = [];
  const baseParts = subnet.split('.');
  const baseIp = baseParts.slice(0, 3).join('.');

  logger.info(`Scanning subnet ${baseIp}.0/24 for Tapo devices...`);

  // Scan in batches to avoid overwhelming the network
  const batchSize = 50;
  const total = 254;

  for (let batch = 0; batch < Math.ceil(total / batchSize); batch++) {
    const start = batch * batchSize + 1;
    const end = Math.min(start + batchSize - 1, 254);

    const promises = [];
    for (let i = start; i <= end; i++) {
      const ip = `${baseIp}.${i}`;
      promises.push(checkTapoDevice(ip));
    }

    const results = await Promise.all(promises);

    for (const result of results) {
      if (result.isTapo) {
        found.push(result.ip);
        logger.info(`Found Tapo device at ${result.ip}`);
      }
    }

    // Report progress
    if (onProgress) {
      onProgress({
        subnet: `${baseIp}.0/24`,
        scanned: end,
        total,
        found: found.length,
      });
    }
  }

  return found;
};

// Discover all Tapo devices on the network
// additionalSubnets: array of subnet bases to also scan (e.g., ['192.168.5.0'])
const discoverDevices = async (onProgress, additionalSubnets = []) => {
  await loadDevices();
  const existingIps = new Set(configuredDevices.map(d => d.ip));

  // Get subnets from network interfaces
  const detectedSubnets = getLocalSubnets();

  // Also infer subnets from existing configured devices
  const configuredSubnets = new Set();
  for (const device of configuredDevices) {
    const parts = device.ip.split('.');
    if (parts.length === 4) {
      configuredSubnets.add(`${parts[0]}.${parts[1]}.${parts[2]}.0`);
    }
  }

  // Combine all subnets
  const allSubnets = new Set([
    ...detectedSubnets,
    ...configuredSubnets,
    ...additionalSubnets.filter(s => /^\d+\.\d+\.\d+\.\d+$/.test(s)),
  ]);

  const subnets = Array.from(allSubnets);
  logger.info(`Will scan ${subnets.length} subnet(s): ${subnets.join(', ')}`);

  if (subnets.length === 0) {
    throw new Error('No local network subnets found');
  }

  const allFound = [];
  let totalScanned = 0;

  for (const subnet of subnets) {
    const found = await scanSubnet(subnet, (progress) => {
      if (onProgress) {
        onProgress({
          ...progress,
          currentSubnet: subnets.indexOf(subnet) + 1,
          totalSubnets: subnets.length,
        });
      }
    });

    allFound.push(...found);
    totalScanned += 254;
  }

  // Get device info for discovered devices
  const discoveredDevices = [];
  const { email, password } = getCredentials();

  for (const ip of allFound) {
    const isExisting = existingIps.has(ip);

    try {
      const session = createSession(ip, email, password);
      await session.handshake();
      const info = await session.getDeviceInfo();

      discoveredDevices.push({
        ip,
        name: decodeNickname(info.nickname),
        model: info.model || 'Unknown',
        type: info.type,
        isOn: info.device_on,
        alreadyAdded: isExisting,
      });
    } catch (error) {
      // Device found but couldn't authenticate - might be registered to different account
      discoveredDevices.push({
        ip,
        name: 'Unknown Device',
        model: 'Unknown',
        alreadyAdded: isExisting,
        error: 'Could not authenticate - check credentials',
      });
    }
  }

  return {
    subnetsScanned: subnets,
    totalIpsScanned: totalScanned,
    devicesFound: discoveredDevices,
    newDevices: discoveredDevices.filter(d => !d.alreadyAdded && !d.error),
  };
};

export default {
  loadDevices,
  getDevices,
  refreshDevices,
  getDeviceInfo,
  addDevice,
  removeDevice,
  turnOn,
  turnOff,
  setBrightness,
  setColor,
  setColorTemp,
  discoverDevices,
  getLocalSubnets,
};

export {
  loadDevices,
  getDevices,
  refreshDevices,
  getDeviceInfo,
  addDevice,
  removeDevice,
  turnOn,
  turnOff,
  setBrightness,
  setColor,
  setColorTemp,
  discoverDevices,
  getLocalSubnets,
};
