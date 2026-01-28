import { Router } from 'express';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import logger from '../utils/logger.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import goveeService from '../services/goveeService.js';
import tapoService from '../services/tapoService.js';
import ephService from '../services/ephService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const groupsFilePath = join(__dirname, '..', '..', 'data', 'device-groups.json');

const router = Router();

// ============ DEVICE GROUPS STORAGE ============

// Load groups from file
async function loadGroups() {
  try {
    const data = await fs.readFile(groupsFilePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

// Save groups to file
async function saveGroups(groups) {
  await fs.writeFile(groupsFilePath, JSON.stringify(groups, null, 2), 'utf-8');
}

// Strict IPv4 validation (each octet must be 0-255)
const isValidIPv4 = (ip) => {
  if (typeof ip !== 'string') return false;
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every(part => {
    const num = parseInt(part, 10);
    return !isNaN(num) && num >= 0 && num <= 255 && String(num) === part;
  });
};

// Initialize Govee controller on startup
goveeService.initialize().catch(err => {
  logger.warn('Govee initialization failed (may not have devices):', err.message);
});

// ============ GET ALL DEVICES ============

// GET /api/home/devices - Get all devices from all providers
router.get('/devices', asyncHandler(async (req, res) => {
  // Use refreshDevices for Tapo to get actual current state from devices
  // (getDevices only returns cached state which may be stale/wrong)
  const [goveeDevices, tapoDevices] = await Promise.all([
    goveeService.getDevices().catch(err => {
      logger.warn('Failed to get Govee devices:', err.message);
      return [];
    }),
    tapoService.refreshDevices().catch(err => {
      logger.warn('Failed to refresh Tapo devices:', err.message);
      return [];
    }),
  ]);

  const allDevices = [
    ...goveeDevices.map(d => ({ ...d, provider: 'govee' })),
    ...tapoDevices.map(d => ({ ...d, provider: 'tapo' })),
  ];

  res.json({
    devices: allDevices,
    summary: {
      total: allDevices.length,
      govee: goveeDevices.length,
      tapo: tapoDevices.length,
      online: allDevices.filter(d => d.online !== false).length,
    },
  });
}));

// ============ DEVICE CONTROL ============

// POST /api/home/devices/:provider/:deviceId/power
router.post('/devices/:provider/:deviceId/power', asyncHandler(async (req, res) => {
  const { provider, deviceId } = req.params;
  const { state } = req.body; // true = on, false = off

  if (typeof state !== 'boolean') {
    return res.status(400).json({ error: 'state must be a boolean (true/false)' });
  }

  let result;
  if (provider === 'govee') {
    result = state
      ? await goveeService.turnOn(deviceId)
      : await goveeService.turnOff(deviceId);
  } else if (provider === 'tapo') {
    result = state
      ? await tapoService.turnOn(deviceId)
      : await tapoService.turnOff(deviceId);
  } else {
    return res.status(400).json({ error: 'Unknown provider' });
  }

  res.json({ success: true, ...result });
}));

// POST /api/home/devices/:provider/:deviceId/brightness
router.post('/devices/:provider/:deviceId/brightness', asyncHandler(async (req, res) => {
  const { provider, deviceId } = req.params;
  const { brightness } = req.body; // 0-100

  if (typeof brightness !== 'number' || brightness < 0 || brightness > 100) {
    return res.status(400).json({ error: 'brightness must be a number between 0 and 100' });
  }

  let result;
  if (provider === 'govee') {
    result = await goveeService.setBrightness(deviceId, brightness);
  } else if (provider === 'tapo') {
    result = await tapoService.setBrightness(deviceId, brightness);
  } else {
    return res.status(400).json({ error: 'Unknown provider' });
  }

  res.json({ success: true, ...result });
}));

// POST /api/home/devices/:provider/:deviceId/color
router.post('/devices/:provider/:deviceId/color', asyncHandler(async (req, res) => {
  const { provider, deviceId } = req.params;
  const { color } = req.body; // hex string or { r, g, b } or { hue, saturation }

  if (!color) {
    return res.status(400).json({ error: 'color is required' });
  }

  let result;
  if (provider === 'govee') {
    result = await goveeService.setColor(deviceId, color);
  } else if (provider === 'tapo') {
    result = await tapoService.setColor(deviceId, color);
  } else {
    return res.status(400).json({ error: 'Unknown provider' });
  }

  res.json({ success: true, ...result });
}));

// ============ GOVEE DEVICE MANAGEMENT ============

// PUT /api/home/govee/devices/:deviceId/name - Rename a Govee device
router.put('/govee/devices/:deviceId/name', asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const { name } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required and must be a non-empty string' });
  }

  const result = await goveeService.setDeviceName(deviceId, name.trim());
  res.json(result);
}));

// ============ TAPO DEVICE MANAGEMENT ============

// POST /api/home/tapo/devices - Add a new Tapo device
router.post('/tapo/devices', asyncHandler(async (req, res) => {
  const { ip, name, model } = req.body;

  if (!ip) {
    return res.status(400).json({ error: 'IP address is required' });
  }

  // Validate IP format (strict validation - each octet 0-255)
  if (!isValidIPv4(ip)) {
    return res.status(400).json({ error: 'Invalid IP address format' });
  }

  const device = await tapoService.addDevice(ip, name, model);
  res.json({ success: true, device });
}));

// DELETE /api/home/tapo/devices/:deviceId - Remove a Tapo device
router.delete('/tapo/devices/:deviceId', asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  await tapoService.removeDevice(deviceId);
  res.json({ success: true });
}));

// ============ DEVICE DISCOVERY ============

// GET /api/home/tapo/subnets - Get detected local subnets
router.get('/tapo/subnets', asyncHandler(async (req, res) => {
  const subnets = tapoService.getLocalSubnets();
  res.json({ subnets });
}));

// POST /api/home/tapo/discover - Scan network for Tapo devices
router.post('/tapo/discover', asyncHandler(async (req, res) => {
  const { additionalSubnets } = req.body || {};

  logger.info('Starting Tapo device discovery...');

  const result = await tapoService.discoverDevices(null, additionalSubnets || []);

  logger.info(`Discovery complete: found ${result.devicesFound.length} device(s)`);

  res.json({
    success: true,
    ...result,
  });
}));

// POST /api/home/tapo/discover/add - Add discovered devices
router.post('/tapo/discover/add', asyncHandler(async (req, res) => {
  const { devices } = req.body; // Array of { ip, name? }

  if (!Array.isArray(devices) || devices.length === 0) {
    return res.status(400).json({ error: 'devices array is required' });
  }

  const results = [];
  for (const device of devices) {
    if (!device.ip || !isValidIPv4(device.ip)) {
      results.push({ ip: device.ip, success: false, error: 'Invalid IP' });
      continue;
    }

    try {
      const added = await tapoService.addDevice(device.ip, device.name);
      results.push({ ip: device.ip, success: true, device: added });
    } catch (error) {
      results.push({ ip: device.ip, success: false, error: error.message });
    }
  }

  res.json({
    success: true,
    added: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  });
}));

// ============ GOVEE DISCOVERY ============

// POST /api/home/govee/discover - Scan network for Govee devices
router.post('/govee/discover', asyncHandler(async (req, res) => {
  logger.info('Starting Govee device discovery...');

  // Trigger discovery and wait for responses
  goveeService.discover();

  // Wait for discovery responses
  await new Promise(resolve => setTimeout(resolve, 3000));

  const devices = await goveeService.getDevices();

  logger.info(`Govee discovery complete: found ${devices.length} device(s)`);

  res.json({
    success: true,
    devicesFound: devices.length,
    devices,
  });
}));

// ============ REFRESH ============

// POST /api/home/refresh - Refresh all devices (actually connects to get fresh state)
router.post('/refresh', asyncHandler(async (req, res) => {
  const [goveeDevices, tapoDevices] = await Promise.all([
    goveeService.refresh().catch(() => []),
    tapoService.refreshDevices().catch(() => []),
  ]);

  res.json({
    success: true,
    devices: {
      govee: goveeDevices.length,
      tapo: tapoDevices.length,
    },
  });
}));

// ============ DEVICE GROUPS ============

// GET /api/home/groups - Get all device groups
router.get('/groups', asyncHandler(async (req, res) => {
  const groups = await loadGroups();
  res.json({ groups });
}));

// POST /api/home/groups - Create a new device group
router.post('/groups', asyncHandler(async (req, res) => {
  const { name, deviceIds } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Group name is required' });
  }

  const groups = await loadGroups();

  // Check for duplicate name
  if (groups.some(g => g.name.toLowerCase() === name.trim().toLowerCase())) {
    return res.status(400).json({ error: 'A group with this name already exists' });
  }

  const newGroup = {
    id: `group_${Date.now()}`,
    name: name.trim(),
    deviceIds: Array.isArray(deviceIds) ? deviceIds : [],
    createdAt: new Date().toISOString(),
  };

  groups.push(newGroup);
  await saveGroups(groups);

  logger.info(`Created device group: ${newGroup.name}`);
  res.json({ success: true, group: newGroup });
}));

// PUT /api/home/groups/:groupId - Update a device group
router.put('/groups/:groupId', asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const { name, deviceIds } = req.body;

  const groups = await loadGroups();
  const groupIndex = groups.findIndex(g => g.id === groupId);

  if (groupIndex === -1) {
    return res.status(404).json({ error: 'Group not found' });
  }

  // Check for duplicate name (excluding current group)
  if (name && groups.some(g => g.id !== groupId && g.name.toLowerCase() === name.trim().toLowerCase())) {
    return res.status(400).json({ error: 'A group with this name already exists' });
  }

  if (name) groups[groupIndex].name = name.trim();
  if (Array.isArray(deviceIds)) groups[groupIndex].deviceIds = deviceIds;
  groups[groupIndex].updatedAt = new Date().toISOString();

  await saveGroups(groups);

  logger.info(`Updated device group: ${groups[groupIndex].name}`);
  res.json({ success: true, group: groups[groupIndex] });
}));

// DELETE /api/home/groups/:groupId - Delete a device group
router.delete('/groups/:groupId', asyncHandler(async (req, res) => {
  const { groupId } = req.params;

  const groups = await loadGroups();
  const groupIndex = groups.findIndex(g => g.id === groupId);

  if (groupIndex === -1) {
    return res.status(404).json({ error: 'Group not found' });
  }

  const deletedGroup = groups.splice(groupIndex, 1)[0];
  await saveGroups(groups);

  logger.info(`Deleted device group: ${deletedGroup.name}`);
  res.json({ success: true });
}));

// POST /api/home/groups/:groupId/power - Toggle power for all devices in a group
router.post('/groups/:groupId/power', asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const { state } = req.body; // true = on, false = off

  if (typeof state !== 'boolean') {
    return res.status(400).json({ error: 'state must be a boolean (true/false)' });
  }

  const groups = await loadGroups();
  const group = groups.find(g => g.id === groupId);

  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  if (!group.deviceIds || group.deviceIds.length === 0) {
    return res.status(400).json({ error: 'Group has no devices' });
  }

  // Get all devices to map IDs to providers
  const [goveeDevices, tapoDevices] = await Promise.all([
    goveeService.getDevices().catch(() => []),
    tapoService.getDevices().catch(() => []),
  ]);

  const allDevices = [
    ...goveeDevices.map(d => ({ ...d, provider: 'govee' })),
    ...tapoDevices.map(d => ({ ...d, provider: 'tapo' })),
  ];

  const results = [];

  for (const deviceId of group.deviceIds) {
    const device = allDevices.find(d => d.id === deviceId);
    if (!device) {
      results.push({ deviceId, success: false, error: 'Device not found' });
      continue;
    }

    try {
      if (device.provider === 'govee') {
        state ? await goveeService.turnOn(deviceId) : await goveeService.turnOff(deviceId);
      } else if (device.provider === 'tapo') {
        state ? await tapoService.turnOn(deviceId) : await tapoService.turnOff(deviceId);
      }
      results.push({ deviceId, success: true });
    } catch (error) {
      results.push({ deviceId, success: false, error: error.message });
    }
  }

  const successCount = results.filter(r => r.success).length;
  logger.info(`Group ${group.name}: turned ${state ? 'on' : 'off'} ${successCount}/${group.deviceIds.length} devices`);

  res.json({
    success: true,
    state,
    results,
    summary: {
      total: group.deviceIds.length,
      succeeded: successCount,
      failed: results.filter(r => !r.success).length,
    },
  });
}));

// ============ THERMOSTAT (EPH Ember) ============

// GET /api/home/thermostat - Get thermostat summary
router.get('/thermostat', asyncHandler(async (req, res) => {
  const summary = await ephService.getSummary();
  res.json(summary);
}));

// GET /api/home/thermostat/zones - Get all zones
router.get('/thermostat/zones', asyncHandler(async (req, res) => {
  if (!ephService.isConfigured()) {
    return res.status(400).json({ error: 'EPH thermostat not configured' });
  }

  const zones = await ephService.getZones();
  res.json({ zones });
}));

// GET /api/home/thermostat/zones/:zoneId - Get specific zone
router.get('/thermostat/zones/:zoneId', asyncHandler(async (req, res) => {
  const { zoneId } = req.params;

  const zone = await ephService.getZone(zoneId);
  if (!zone) {
    return res.status(404).json({ error: 'Zone not found' });
  }

  res.json({ zone });
}));

// PUT /api/home/thermostat/zones/:zoneId/temperature - Set target temperature
router.put('/thermostat/zones/:zoneId/temperature', asyncHandler(async (req, res) => {
  const { zoneId } = req.params;
  const { temperature } = req.body;

  if (typeof temperature !== 'number') {
    return res.status(400).json({ error: 'temperature must be a number' });
  }

  const result = await ephService.setTargetTemperature(zoneId, temperature);
  res.json(result);
}));

// POST /api/home/thermostat/zones/:zoneId/boost - Activate boost
router.post('/thermostat/zones/:zoneId/boost', asyncHandler(async (req, res) => {
  const { zoneId } = req.params;
  const { temperature, hours } = req.body;

  const result = await ephService.activateBoost(
    zoneId,
    temperature || null,
    hours || 1
  );
  res.json(result);
}));

// DELETE /api/home/thermostat/zones/:zoneId/boost - Deactivate boost
router.delete('/thermostat/zones/:zoneId/boost', asyncHandler(async (req, res) => {
  const { zoneId } = req.params;

  const result = await ephService.deactivateBoost(zoneId);
  res.json(result);
}));

// PUT /api/home/thermostat/zones/:zoneId/mode - Set zone mode
router.put('/thermostat/zones/:zoneId/mode', asyncHandler(async (req, res) => {
  const { zoneId } = req.params;
  const { mode } = req.body;

  if (!mode) {
    return res.status(400).json({ error: 'mode is required (Off, Auto, On, All Day)' });
  }

  const result = await ephService.setZoneMode(zoneId, mode);
  res.json(result);
}));

export default router;
