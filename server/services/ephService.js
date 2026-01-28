/**
 * EPH Ember Thermostat Service
 * Interfaces with EPH Controls heating systems via the Topband Cloud API
 * Based on pyephember: https://github.com/ttroy50/pyephember
 */

import axios from 'axios';
import mqtt from 'mqtt';
import logger from '../utils/logger.js';
import config from '../config/index.js';

const EPH_API_BASE = 'https://eu-https.topband-cloud.com/ember-back';
const MQTT_BROKER = 'mqtts://eu-base-mqtt.topband-cloud.com:18883';

// Zone modes matching the EPH API (from pyephember)
const ZoneMode = {
  AUTO: 0,
  ALL_DAY: 1,
  ON: 2,
  OFF: 3,
};

const ZoneModeNames = {
  0: 'Auto',
  1: 'All Day',
  2: 'On',
  3: 'Off',
  // Observed additional modes (may be firmware-specific)
  13: 'Schedule',
};

// Point data indices for commands (from pyephember)
const PointDataIndex = {
  TARGET_TEMP: 6,
  BOOST_TIME: 8,
  BOOST_TEMP: 9,
  ZONE_MODE: 3,
};

const CommandTypeId = {
  TARGET_TEMP: 4,
  BOOST_TIME: 4,
  BOOST_TEMP: 4,
  ZONE_MODE: 1,
};

class EphService {
  constructor() {
    this.token = null;
    this.refreshToken = null;
    this.tokenExpiry = 0;
    this.homes = null;
    this.currentHome = null;
    this.zonesData = null;
    this.lastFetch = 0;
    this.cacheTimeout = 30000; // 30 seconds cache
    this.mqttClient = null;
    this.commandSerial = Math.floor(Math.random() * 10000);
  }

  /**
   * Check if credentials are configured
   */
  isConfigured() {
    return !!(config.eph?.email && config.eph?.password);
  }

  /**
   * Authenticate with EPH/Topband API
   */
  async login() {
    if (!this.isConfigured()) {
      throw new Error('EPH credentials not configured');
    }

    try {
      const response = await axios.post(`${EPH_API_BASE}/appLogin/login`, {
        userName: config.eph.email,
        password: config.eph.password,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 15000,
      });

      logger.debug(`EPH Ember login response: ${JSON.stringify(response.data)}`);

      if (response.data?.status === 0 && response.data?.data) {
        const data = response.data.data;
        this.token = data.token;
        this.refreshToken = data.refresh_token || data.refreshToken;
        this.tokenExpiry = Date.now() + ((data.validTime || 1800) * 1000) - 60000; // Refresh 1 min early
        logger.info('EPH Ember: Successfully authenticated');
        return true;
      }

      throw new Error(response.data?.message || `Login failed - status: ${response.data?.status}`);
    } catch (error) {
      const respData = error.response?.data;
      const msg = respData?.message || error.message;
      logger.error(`EPH Ember login failed: ${msg}`);
      logger.debug(`EPH Ember login error response: ${JSON.stringify(respData || error.response?.status)}`);
      this.token = null;
      throw new Error(`EPH login failed: ${msg}`);
    }
  }

  /**
   * Refresh the access token
   */
  async refreshAccessToken() {
    if (!this.refreshToken) {
      return this.login();
    }

    try {
      const response = await axios.get(`${EPH_API_BASE}/appLogin/refreshAccessToken`, {
        headers: {
          'Authorization': this.refreshToken,
          'Accept': 'application/json',
        },
        timeout: 10000,
      });

      if (response.data?.status === 0 && response.data?.data) {
        const data = response.data.data;
        this.token = data.token;
        this.refreshToken = data.refreshToken;
        this.tokenExpiry = Date.now() + ((data.validTime || 1800) * 1000) - 60000;
        logger.debug('EPH Ember: Token refreshed');
        return true;
      }

      // Fallback to full login
      return this.login();
    } catch (error) {
      logger.warn('EPH Ember: Token refresh failed, re-authenticating');
      return this.login();
    }
  }

  /**
   * Ensure we have a valid token
   */
  async ensureAuth() {
    if (!this.token || Date.now() >= this.tokenExpiry) {
      if (this.refreshToken && Date.now() < this.tokenExpiry + 300000) {
        await this.refreshAccessToken();
      } else {
        await this.login();
      }
    }
  }

  /**
   * Make authenticated API request
   */
  async apiRequest(method, endpoint, data = null, retry = true) {
    await this.ensureAuth();

    try {
      const response = await axios({
        method,
        url: `${EPH_API_BASE}${endpoint}`,
        data,
        headers: {
          'Authorization': this.token,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 15000,
      });

      if (response.data?.status !== 0) {
        throw new Error(response.data?.message || `API request failed with status ${response.data?.status}`);
      }

      logger.debug(`EPH Ember: API response for ${endpoint}: ${JSON.stringify(response.data).substring(0, 500)}`);
      return response.data.data;
    } catch (error) {
      if (retry && error.response?.status === 401) {
        logger.debug('EPH Ember: Token expired, re-authenticating...');
        this.token = null;
        await this.login();
        return this.apiRequest(method, endpoint, data, false);
      }
      throw error;
    }
  }

  /**
   * Get list of homes/gateways
   */
  async getHomes() {
    const data = await this.apiRequest('GET', '/homes/list');
    this.homes = data || [];
    logger.debug(`EPH Ember: Found ${this.homes.length} homes: ${JSON.stringify(this.homes)}`);
    return this.homes;
  }

  /**
   * Get home details
   */
  async getHomeDetails(homeId) {
    const data = await this.apiRequest('POST', '/homes/detail', { homeId });
    return data;
  }

  /**
   * Get zones data with current temperatures
   */
  async getZonesData(forceRefresh = false) {
    const now = Date.now();

    // Return cached data if still valid
    if (!forceRefresh && this.zonesData && (now - this.lastFetch) < this.cacheTimeout) {
      return this.zonesData;
    }

    // Get homes if we don't have them
    if (!this.homes) {
      await this.getHomes();
    }

    if (!this.homes || this.homes.length === 0) {
      throw new Error('No EPH homes/gateways found');
    }

    const home = this.homes[0];
    this.currentHome = home;

    // Get gateway ID from home object (API uses lowercase 'gatewayid')
    const gatewayId = home.gatewayid || home.gateWayId || home.gatewayId || home.gateway_id || home.id;
    logger.debug(`EPH Ember: Using gateway ID: ${gatewayId}`);

    // Get zone program data
    const data = await this.apiRequest('POST', '/homesVT/zoneProgram', {
      gateWayId: gatewayId,
    });

    logger.debug(`EPH Ember: Zone program response: ${JSON.stringify(data)}`);
    this.zonesData = data;
    this.lastFetch = now;

    return data;
  }

  /**
   * Get all zones with their current state
   */
  async getZones() {
    const data = await this.getZonesData();
    // Data is an array directly, not data.zones
    const zones = Array.isArray(data) ? data : (data?.zones || []);

    return zones.map(zone => {
      // Parse point data - it's an array of {pointIndex, value} objects
      const pointDataList = zone.pointDataList || zone.pointData || [];
      const pointData = {};

      // Convert array of objects to indexed object
      for (const item of pointDataList) {
        if (item.pointIndex !== undefined) {
          pointData[item.pointIndex] = parseInt(item.value, 10);
        }
      }

      const mode = pointData[3] ?? ZoneMode.AUTO;

      return {
        id: zone.zoneid || zone.zoneId,
        mac: zone.mac,
        name: zone.name || `Zone ${zone.zoneid || zone.zoneId}`,
        currentTemperature: this.parseTemperature(pointData[5]), // Current temp at index 5
        targetTemperature: this.parseTemperature(pointData[6]),  // Target temp at index 6
        mode: mode,
        modeName: ZoneModeNames[mode] || `Mode ${mode}`,
        isActive: pointData[0] === 1,
        isHeating: pointData[1] === 1,
        isOnline: zone.isonline || zone.isOnline || false,
        boostHours: pointData[8] || 0,
        boostTemperature: this.parseTemperature(pointData[9]),
        isBoostActive: (pointData[8] || 0) > 0,
      };
    });
  }

  /**
   * Parse temperature from point data (stored as tenths of degrees)
   */
  parseTemperature(value) {
    if (value === undefined || value === null) return null;
    return value / 10;
  }

  /**
   * Get a specific zone by name or ID
   */
  async getZone(nameOrId) {
    const zones = await this.getZones();
    const searchId = String(nameOrId).toLowerCase();
    return zones.find(z =>
      z.id === nameOrId ||
      String(z.id).toLowerCase() === searchId ||
      z.name.toLowerCase() === searchId
    );
  }

  /**
   * Connect to MQTT broker for sending commands
   */
  async connectMqtt() {
    if (this.mqttClient?.connected) {
      return this.mqttClient;
    }

    await this.ensureAuth();

    return new Promise((resolve, reject) => {
      const client = mqtt.connect(MQTT_BROKER, {
        username: `app/${this.token}`,
        password: this.token,
        clientId: `skyejs_${Date.now()}`,
        rejectUnauthorized: false,
        connectTimeout: 10000,
      });

      client.on('connect', () => {
        logger.debug('EPH Ember: MQTT connected');
        this.mqttClient = client;
        resolve(client);
      });

      client.on('error', (err) => {
        logger.error(`EPH Ember MQTT error: ${err.message}`);
        reject(err);
      });

      setTimeout(() => {
        if (!client.connected) {
          client.end();
          reject(new Error('MQTT connection timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Send command via MQTT
   */
  async sendCommand(zone, pointIndex, typeId, value) {
    const client = await this.connectMqtt();

    if (!this.currentHome) {
      await this.getZonesData();
    }

    // Build command as integer array
    const cmdInts = [0, pointIndex, typeId];

    // Add value as 2-byte big-endian
    const intValue = Math.round(value);
    cmdInts.push((intValue >> 8) & 0xFF);
    cmdInts.push(intValue & 0xFF);

    // Convert to base64
    const cmdBytes = Buffer.from(cmdInts);
    const cmdBase64 = cmdBytes.toString('base64');

    // Build message
    const message = {
      common: {
        serial: this.commandSerial++,
        productId: this.currentHome.productId,
        uid: this.currentHome.uid,
        timestamp: String(Date.now()),
      },
      data: {
        mac: zone.mac,
        pointData: cmdBase64,
      },
    };

    const topic = `/${this.currentHome.productId}/${this.currentHome.uid}/download/pointdata`;

    return new Promise((resolve, reject) => {
      client.publish(topic, JSON.stringify(message), { qos: 1 }, (err) => {
        if (err) {
          reject(err);
        } else {
          // Invalidate cache
          this.lastFetch = 0;
          resolve(true);
        }
      });
    });
  }

  /**
   * Set target temperature for a zone
   */
  async setTargetTemperature(zoneId, temperature) {
    if (temperature < 5 || temperature > 35) {
      throw new Error('Temperature must be between 5 and 35°C');
    }

    const zone = await this.getZone(zoneId);
    if (!zone) {
      throw new Error(`Zone not found: ${zoneId}`);
    }

    // Temperature is stored as tenths of degrees
    const tempValue = Math.round(temperature * 10);

    await this.sendCommand(zone, PointDataIndex.TARGET_TEMP, CommandTypeId.TARGET_TEMP, tempValue);

    logger.info(`EPH Ember: Set ${zone.name} target temperature to ${temperature}°C`);
    return { success: true, zone: zone.name, targetTemperature: temperature };
  }

  /**
   * Activate boost mode for a zone
   */
  async activateBoost(zoneId, temperature = null, hours = 1) {
    const zone = await this.getZone(zoneId);
    if (!zone) {
      throw new Error(`Zone not found: ${zoneId}`);
    }

    // Set boost hours first
    await this.sendCommand(zone, PointDataIndex.BOOST_TIME, CommandTypeId.BOOST_TIME, hours);

    // Set boost temperature if provided
    if (temperature !== null) {
      const tempValue = Math.round(temperature * 10);
      await this.sendCommand(zone, PointDataIndex.BOOST_TEMP, CommandTypeId.BOOST_TEMP, tempValue);
    }

    logger.info(`EPH Ember: Activated boost for ${zone.name} for ${hours} hour(s)`);
    return { success: true, zone: zone.name, boostHours: hours };
  }

  /**
   * Deactivate boost mode for a zone
   */
  async deactivateBoost(zoneId) {
    const zone = await this.getZone(zoneId);
    if (!zone) {
      throw new Error(`Zone not found: ${zoneId}`);
    }

    // Set boost hours to 0
    await this.sendCommand(zone, PointDataIndex.BOOST_TIME, CommandTypeId.BOOST_TIME, 0);

    logger.info(`EPH Ember: Deactivated boost for ${zone.name}`);
    return { success: true, zone: zone.name };
  }

  /**
   * Set zone mode (Off=0, Auto=1, On=2, All Day=3)
   */
  async setZoneMode(zoneId, mode) {
    const modeValue = typeof mode === 'string'
      ? Object.entries(ZoneModeNames).find(([k, v]) => v.toLowerCase() === mode.toLowerCase())?.[0]
      : mode;

    const validModes = [0, 1, 2, 3]; // AUTO, ALL_DAY, ON, OFF
    if (modeValue === undefined || !validModes.includes(parseInt(modeValue))) {
      throw new Error('Invalid mode. Must be: Auto, All Day, On, or Off');
    }

    const zone = await this.getZone(zoneId);
    if (!zone) {
      throw new Error(`Zone not found: ${zoneId}`);
    }

    await this.sendCommand(zone, PointDataIndex.ZONE_MODE, CommandTypeId.ZONE_MODE, parseInt(modeValue));

    logger.info(`EPH Ember: Set ${zone.name} mode to ${ZoneModeNames[modeValue]}`);
    return { success: true, zone: zone.name, mode: ZoneModeNames[modeValue] };
  }

  /**
   * Get summary for dashboard
   */
  async getSummary() {
    if (!this.isConfigured()) {
      return { configured: false };
    }

    try {
      const zones = await this.getZones();

      // Find the primary zone (usually "Heating" or first zone)
      const primaryZone = zones.find(z =>
        z.name.toLowerCase().includes('heating') ||
        z.name.toLowerCase().includes('main')
      ) || zones[0];

      return {
        configured: true,
        connected: true,
        zones: zones.length,
        primaryZone: primaryZone ? {
          id: primaryZone.id,
          name: primaryZone.name,
          currentTemperature: primaryZone.currentTemperature,
          targetTemperature: primaryZone.targetTemperature,
          mode: primaryZone.mode,
          modeName: primaryZone.modeName,
          isHeating: primaryZone.isHeating,
          isBoostActive: primaryZone.isBoostActive,
          boostHours: primaryZone.boostHours,
        } : null,
        allZones: zones,
      };
    } catch (error) {
      logger.error(`EPH Ember summary error: ${error.message}`);
      return {
        configured: true,
        connected: false,
        error: error.message,
      };
    }
  }

  /**
   * Disconnect MQTT client
   */
  disconnect() {
    if (this.mqttClient) {
      this.mqttClient.end();
      this.mqttClient = null;
    }
  }
}

// Export singleton instance
const ephService = new EphService();
export default ephService;
export { ZoneMode, ZoneModeNames };
