/**
 * Govee LAN Protocol Implementation
 *
 * Based on the official Govee LAN API:
 * - Discovery: UDP multicast to 239.255.255.250:4001
 * - Listen for responses on UDP port 4002
 * - Control commands sent to device IP on port 4003
 *
 * Reference: https://app-h5.govee.com/user-manual/wlan-guide
 */

import dgram from 'dgram';
import { networkInterfaces } from 'os';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';
import config from '../config/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const NAMES_FILE = join(DATA_DIR, 'govee-names.json');
const DEVICES_FILE = join(DATA_DIR, 'govee-devices.json');

// Known subnets to scan (will be populated from network interfaces and Tapo devices)
const knownSubnets = new Set();

// Custom device names (persisted to file)
let customNames = {};

// Persisted device data (survives restarts)
let persistedDevices = {};

// Cloud API device names cache
let cloudDeviceNames = {};
let cloudNamesFetchedAt = 0;
const CLOUD_NAMES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch device names from Govee Cloud API
 * API docs: https://developer.govee.com/reference/get-you-devices
 */
const fetchCloudDeviceNames = async () => {
  const apiKey = config.govee?.apiKey;
  if (!apiKey) {
    logger.debug('Govee: No API key configured, skipping cloud name fetch');
    return {};
  }

  // Use cache if still valid
  if (Date.now() - cloudNamesFetchedAt < CLOUD_NAMES_CACHE_TTL && Object.keys(cloudDeviceNames).length > 0) {
    return cloudDeviceNames;
  }

  try {
    logger.info('Govee: Fetching device names from Cloud API...');
    const response = await fetch('https://openapi.api.govee.com/router/api/v1/user/devices', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Govee-API-Key': apiKey,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        logger.error('Govee Cloud API: Invalid API key');
      } else if (response.status === 429) {
        logger.warn('Govee Cloud API: Rate limit exceeded');
      } else {
        logger.error(`Govee Cloud API error: ${response.status} ${response.statusText}`);
      }
      return cloudDeviceNames; // Return cached data on error
    }

    const data = await response.json();
    if (data.code === 200 && Array.isArray(data.data)) {
      cloudDeviceNames = {};
      for (const device of data.data) {
        if (device.device && device.deviceName) {
          // Normalize device ID (remove colons, uppercase)
          const normalizedId = device.device.replace(/:/g, '').toUpperCase();
          cloudDeviceNames[normalizedId] = device.deviceName;
          // Also store with original format
          cloudDeviceNames[device.device] = device.deviceName;
        }
      }
      cloudNamesFetchedAt = Date.now();
      logger.info(`Govee: Loaded ${Object.keys(cloudDeviceNames).length / 2} device names from Cloud API`);
    }

    return cloudDeviceNames;
  } catch (error) {
    logger.error('Govee Cloud API fetch failed:', error.message);
    return cloudDeviceNames; // Return cached data on error
  }
};

const MULTICAST_ADDRESS = '239.255.255.250';
const SCAN_PORT = 4001;
const LISTEN_PORT = 4002;
const CONTROL_PORT = 4003;

// Discovered devices
const devices = new Map();

/**
 * Load custom device names from file
 */
const loadCustomNames = async () => {
  try {
    if (existsSync(NAMES_FILE)) {
      const data = await readFile(NAMES_FILE, 'utf-8');
      customNames = JSON.parse(data);
      logger.info(`Loaded ${Object.keys(customNames).length} custom Govee device names`);
    }
  } catch (error) {
    logger.error('Failed to load Govee custom names:', error);
    customNames = {};
  }
};

/**
 * Load persisted devices from file (survives server restarts)
 */
const loadPersistedDevices = async () => {
  try {
    if (existsSync(DEVICES_FILE)) {
      const data = await readFile(DEVICES_FILE, 'utf-8');
      persistedDevices = JSON.parse(data);
      logger.info(`Loaded ${Object.keys(persistedDevices).length} persisted Govee devices`);

      // Restore devices to in-memory map (marked as potentially offline until discovered)
      for (const [id, deviceData] of Object.entries(persistedDevices)) {
        devices.set(id, {
          ...deviceData,
          online: false, // Mark offline until re-discovered
          lastSeen: deviceData.lastSeen || 0,
          // Reset isOn to false - don't trust persisted state, wait for device to report actual state
          state: {
            ...deviceData.state,
            isOn: false,
          },
        });
      }
    }
  } catch (error) {
    logger.error('Failed to load persisted Govee devices:', error);
    persistedDevices = {};
  }
};

/**
 * Save devices to file for persistence
 */
const savePersistedDevices = async () => {
  try {
    if (!existsSync(DATA_DIR)) {
      await mkdir(DATA_DIR, { recursive: true });
    }

    // Save all discovered devices
    const toSave = {};
    for (const [id, device] of devices.entries()) {
      toSave[id] = {
        id: device.id,
        ip: device.ip,
        sku: device.sku,
        model: device.model,
        name: device.name,
        type: device.type,
        provider: device.provider,
        capabilities: device.capabilities,
        state: device.state,
        lastSeen: device.lastSeen,
      };
    }

    await writeFile(DEVICES_FILE, JSON.stringify(toSave, null, 2));
    logger.debug(`Saved ${Object.keys(toSave).length} Govee devices to persistence`);
  } catch (error) {
    logger.error('Failed to save Govee devices:', error);
  }
};

/**
 * Save custom device names to file
 */
const saveCustomNames = async () => {
  try {
    if (!existsSync(DATA_DIR)) {
      await mkdir(DATA_DIR, { recursive: true });
    }
    await writeFile(NAMES_FILE, JSON.stringify(customNames, null, 2));
    logger.info('Saved Govee custom names');
  } catch (error) {
    logger.error('Failed to save Govee custom names:', error);
  }
};

/**
 * Set a custom name for a device
 */
const setDeviceName = async (deviceId, name) => {
  customNames[deviceId] = name;
  await saveCustomNames();

  // Update the device in memory if it exists
  const device = devices.get(deviceId);
  if (device) {
    device.name = name;
  }

  return { success: true, deviceId, name };
};

// UDP socket for listening
let listenSocket = null;
let isInitialized = false;

/**
 * Initialize the Govee LAN listener
 */
const initialize = () => {
  return new Promise(async (resolve) => {
    if (isInitialized) {
      resolve(true);
      return;
    }

    // Load persisted devices, custom names and fetch cloud names
    await loadPersistedDevices();
    await loadCustomNames();
    await fetchCloudDeviceNames();

    try {
      listenSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      listenSocket.on('error', (err) => {
        logger.error('Govee UDP socket error:', err.message);
        // Don't fail completely, just log the error
      });

      listenSocket.on('message', (msg, rinfo) => {
        try {
          const data = JSON.parse(msg.toString());
          handleMessage(data, rinfo);
        } catch (e) {
          logger.debug(`Govee: Failed to parse message from ${rinfo.address}: ${e.message}`);
        }
      });

      listenSocket.on('listening', () => {
        const address = listenSocket.address();
        logger.info(`Govee LAN listener started on port ${address.port}`);

        // Join multicast group to receive responses
        try {
          listenSocket.addMembership(MULTICAST_ADDRESS);
          logger.debug(`Govee: Joined multicast group ${MULTICAST_ADDRESS}`);
        } catch (e) {
          logger.warn(`Govee: Could not join multicast group: ${e.message}`);
        }

        isInitialized = true;

        // Start initial discovery
        discover();

        resolve(true);
      });

      listenSocket.bind(LISTEN_PORT);
    } catch (error) {
      logger.error('Failed to initialize Govee LAN:', error.message);
      isInitialized = true; // Mark as initialized to prevent retries
      resolve(false);
    }
  });
};

/**
 * Handle incoming messages from Govee devices
 */
const handleMessage = (data, rinfo) => {
  const { msg } = data;

  if (msg?.cmd === 'scan') {
    // Device scan response
    const deviceData = msg.data;
    if (deviceData?.ip && deviceData?.device) {
      const existing = devices.get(deviceData.device);
      // Priority: custom name > cloud name > existing name > model/sku
      // Try both raw device ID and normalized (no colons, uppercase) for cloud lookup
      const normalizedId = deviceData.device.replace(/:/g, '').toUpperCase();
      const cloudName = cloudDeviceNames[deviceData.device] || cloudDeviceNames[normalizedId];
      const deviceName = customNames[deviceData.device] || cloudName || existing?.name || deviceData.sku || 'Govee Light';

      devices.set(deviceData.device, {
        id: deviceData.device,
        ip: deviceData.ip,
        sku: deviceData.sku || 'Unknown',
        model: deviceData.sku || 'Unknown',
        name: deviceName,
        bleVersionHard: deviceData.bleVersionHard,
        bleVersionSoft: deviceData.bleVersionSoft,
        wifiVersionHard: deviceData.wifiVersionHard,
        wifiVersionSoft: deviceData.wifiVersionSoft,
        type: 'govee',
        provider: 'govee',
        capabilities: ['on_off', 'brightness', 'color'],
        state: existing?.state || {
          isOn: false,
          brightness: 100,
          color: { r: 255, g: 255, b: 255 },
          colorTemp: 0,
        },
        online: true,
        lastSeen: Date.now(),
      });

      logger.info(`Govee device discovered: ${deviceName} (${deviceData.sku}) at ${deviceData.ip}`);

      // Persist the device so it survives restarts
      savePersistedDevices();

      // Request current state
      requestDeviceState(deviceData.ip);
    }
  } else if (msg?.cmd === 'devStatus') {
    // Device status response
    const statusData = msg.data;
    // Find device by IP from rinfo
    for (const [id, device] of devices.entries()) {
      if (device.ip === rinfo.address) {
        device.state = {
          isOn: statusData.onOff === 1,
          brightness: statusData.brightness || 100,
          color: statusData.color || { r: 255, g: 255, b: 255 },
          colorTemp: statusData.colorTemInKelvin || 0,
        };
        device.online = true;
        device.lastSeen = Date.now();
        logger.debug(`Govee device ${id} state updated: on=${device.state.isOn}, brightness=${device.state.brightness}`);

        // Persist updated state
        savePersistedDevices();
        break;
      }
    }
  }
};

/**
 * Get all local subnets from network interfaces
 */
const getLocalSubnets = () => {
  const subnets = new Set();
  const interfaces = networkInterfaces();

  for (const [name, addrs] of Object.entries(interfaces)) {
    // Skip loopback and virtual interfaces
    if (name.startsWith('lo') || name.startsWith('docker') || name.startsWith('br-')) {
      continue;
    }

    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        const ipParts = addr.address.split('.').map(Number);
        const maskParts = addr.netmask.split('.').map(Number);
        const networkParts = ipParts.map((ip, i) => ip & maskParts[i]);
        const subnet = networkParts.slice(0, 3).join('.');
        subnets.add(subnet);
      }
    }
  }

  return Array.from(subnets);
};

/**
 * Add a subnet to the known subnets list
 */
const addKnownSubnet = (subnet) => {
  // Extract base subnet (e.g., "192.168.4" from "192.168.4.0" or "192.168.4.25")
  const parts = subnet.split('.');
  if (parts.length >= 3) {
    const base = parts.slice(0, 3).join('.');
    if (!knownSubnets.has(base)) {
      knownSubnets.add(base);
      logger.debug(`Govee: Added known subnet ${base}`);
    }
  }
};

/**
 * Send discovery scan request
 */
const discover = () => {
  const scanMessage = JSON.stringify({
    msg: {
      cmd: 'scan',
      data: {
        account_topic: 'reserve',
      },
    },
  });

  // Gather all subnets to scan
  const subnetsToScan = new Set([
    ...getLocalSubnets(),
    ...knownSubnets,
  ]);

  // Also add hardcoded common home subnets (192.168.4.x and 192.168.5.x are common)
  // These will be scanned in case devices are on a different subnet
  subnetsToScan.add('192.168.4');
  subnetsToScan.add('192.168.5');

  logger.info(`Govee: Scanning subnets: ${Array.from(subnetsToScan).join(', ')}`);

  const socket = dgram.createSocket('udp4');

  socket.on('error', (err) => {
    logger.debug(`Govee scan socket error: ${err.message}`);
    socket.close();
  });

  socket.bind(() => {
    socket.setBroadcast(true);

    // Send to multicast address
    socket.send(scanMessage, SCAN_PORT, MULTICAST_ADDRESS, (err) => {
      if (err) {
        logger.debug(`Govee multicast scan failed: ${err.message}`);
      } else {
        logger.debug('Govee: Sent multicast scan request');
      }
    });

    // Send broadcast to global broadcast
    socket.send(scanMessage, SCAN_PORT, '255.255.255.255', (err) => {
      if (err) {
        logger.debug(`Govee broadcast scan failed: ${err.message}`);
      } else {
        logger.debug('Govee: Sent global broadcast scan request');
      }
    });

    // Send to each subnet's broadcast address
    for (const subnet of subnetsToScan) {
      const broadcastAddr = `${subnet}.255`;
      socket.send(scanMessage, SCAN_PORT, broadcastAddr, (err) => {
        if (err) {
          logger.debug(`Govee subnet ${broadcastAddr} scan failed: ${err.message}`);
        } else {
          logger.debug(`Govee: Sent scan to ${broadcastAddr}`);
        }
      });
    }

    // Close after a short delay
    setTimeout(() => socket.close(), 1000);
  });
};

/**
 * Request device state
 */
const requestDeviceState = (deviceIp) => {
  const stateMessage = JSON.stringify({
    msg: {
      cmd: 'devStatus',
      data: {},
    },
  });

  sendToDevice(deviceIp, stateMessage);
};

/**
 * Send command to a specific device
 */
const sendToDevice = (deviceIp, message) => {
  const socket = dgram.createSocket('udp4');

  socket.send(message, CONTROL_PORT, deviceIp, (err) => {
    if (err) {
      logger.error(`Govee: Failed to send to ${deviceIp}: ${err.message}`);
    } else {
      logger.debug(`Govee: Sent command to ${deviceIp}`);
    }
    socket.close();
  });
};

/**
 * Get all discovered devices
 */
const getDevices = async () => {
  if (!isInitialized) {
    await initialize();
  }

  // Clean up stale devices (not seen in 5 minutes)
  const now = Date.now();
  for (const [id, device] of devices.entries()) {
    if (now - device.lastSeen > 5 * 60 * 1000) {
      device.online = false;
    }
  }

  return Array.from(devices.values()).map(d => ({
    id: d.id,
    ip: d.ip,
    model: d.model,
    name: d.name,
    type: d.type,
    provider: d.provider,
    capabilities: d.capabilities,
    state: d.state,
    online: d.online,
  }));
};

/**
 * Get a single device
 */
const getDevice = async (deviceId) => {
  if (!isInitialized) {
    await initialize();
  }

  const device = devices.get(deviceId);
  if (!device) {
    throw new Error(`Govee device not found: ${deviceId}`);
  }

  return {
    id: device.id,
    ip: device.ip,
    model: device.model,
    name: device.name,
    type: device.type,
    provider: device.provider,
    capabilities: device.capabilities,
    state: device.state,
    online: device.online,
  };
};

/**
 * Turn device on
 */
const turnOn = async (deviceId) => {
  const device = devices.get(deviceId);
  if (!device) {
    throw new Error(`Govee device not found: ${deviceId}`);
  }

  const message = JSON.stringify({
    msg: {
      cmd: 'turn',
      data: {
        value: 1,
      },
    },
  });

  sendToDevice(device.ip, message);
  device.state.isOn = true;
  logger.info(`Govee device ${deviceId} turned ON`);

  return { success: true, state: device.state };
};

/**
 * Turn device off
 */
const turnOff = async (deviceId) => {
  const device = devices.get(deviceId);
  if (!device) {
    throw new Error(`Govee device not found: ${deviceId}`);
  }

  const message = JSON.stringify({
    msg: {
      cmd: 'turn',
      data: {
        value: 0,
      },
    },
  });

  sendToDevice(device.ip, message);
  device.state.isOn = false;
  logger.info(`Govee device ${deviceId} turned OFF`);

  return { success: true, state: device.state };
};

/**
 * Set brightness (1-100)
 */
const setBrightness = async (deviceId, brightness) => {
  const device = devices.get(deviceId);
  if (!device) {
    throw new Error(`Govee device not found: ${deviceId}`);
  }

  const value = Math.max(1, Math.min(100, brightness));

  const message = JSON.stringify({
    msg: {
      cmd: 'brightness',
      data: {
        value,
      },
    },
  });

  sendToDevice(device.ip, message);
  device.state.brightness = value;
  logger.info(`Govee device ${deviceId} brightness set to ${value}%`);

  return { success: true, state: device.state };
};

/**
 * Set color (RGB or hex)
 */
const setColor = async (deviceId, color) => {
  const device = devices.get(deviceId);
  if (!device) {
    throw new Error(`Govee device not found: ${deviceId}`);
  }

  let rgb;
  if (typeof color === 'string') {
    // Convert hex to RGB
    const hex = color.replace('#', '');
    rgb = {
      r: parseInt(hex.substring(0, 2), 16),
      g: parseInt(hex.substring(2, 4), 16),
      b: parseInt(hex.substring(4, 6), 16),
    };
  } else {
    rgb = color;
  }

  const message = JSON.stringify({
    msg: {
      cmd: 'colorwc',
      data: {
        color: rgb,
        colorTemInKelvin: 0,
      },
    },
  });

  sendToDevice(device.ip, message);
  device.state.color = rgb;
  device.state.colorTemp = 0;
  logger.info(`Govee device ${deviceId} color set to RGB(${rgb.r},${rgb.g},${rgb.b})`);

  return { success: true, state: device.state };
};

/**
 * Set color temperature (in Kelvin, typically 2000-9000)
 */
const setColorTemp = async (deviceId, tempKelvin) => {
  const device = devices.get(deviceId);
  if (!device) {
    throw new Error(`Govee device not found: ${deviceId}`);
  }

  const value = Math.max(2000, Math.min(9000, tempKelvin));

  const message = JSON.stringify({
    msg: {
      cmd: 'colorwc',
      data: {
        color: { r: 0, g: 0, b: 0 },
        colorTemInKelvin: value,
      },
    },
  });

  sendToDevice(device.ip, message);
  device.state.colorTemp = value;
  logger.info(`Govee device ${deviceId} color temp set to ${value}K`);

  return { success: true, state: device.state };
};

/**
 * Refresh state of existing devices (does NOT discover new devices)
 */
const refresh = async () => {
  if (!isInitialized) {
    await initialize();
  }

  logger.info('Refreshing Govee device states...');

  // Request state from all known devices
  for (const [id, device] of devices.entries()) {
    if (device.ip) {
      requestDeviceState(device.ip);
    }
  }

  // Wait briefly for state responses
  await new Promise(resolve => setTimeout(resolve, 1000));

  return getDevices();
};

/**
 * Check if Govee LAN is available
 */
const isAvailable = () => {
  return isInitialized;
};

export default {
  initialize,
  getDevices,
  getDevice,
  turnOn,
  turnOff,
  setBrightness,
  setColor,
  setColorTemp,
  refresh,
  discover,
  isAvailable,
  addKnownSubnet,
  getLocalSubnets,
  setDeviceName,
};

export {
  initialize,
  getDevices,
  getDevice,
  turnOn,
  turnOff,
  setBrightness,
  setColor,
  setColorTemp,
  refresh,
  discover,
  isAvailable,
  addKnownSubnet,
  getLocalSubnets,
  setDeviceName,
};
