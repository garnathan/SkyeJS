/**
 * Govee Service - Wrapper for Govee LAN protocol
 *
 * Uses custom UDP implementation for device discovery and control
 * since the govee-lan-control npm package has dependency issues.
 */

import goveeLan from './goveeLan.js';

// Re-export all functions from goveeLan
export const initialize = goveeLan.initialize;
export const getDevices = goveeLan.getDevices;
export const getDevice = goveeLan.getDevice;
export const turnOn = goveeLan.turnOn;
export const turnOff = goveeLan.turnOff;
export const setBrightness = goveeLan.setBrightness;
export const setColor = goveeLan.setColor;
export const setColorTemp = goveeLan.setColorTemp;
export const refresh = goveeLan.refresh;
export const discover = goveeLan.discover;
export const isAvailable = goveeLan.isAvailable;
export const setDeviceName = goveeLan.setDeviceName;

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
  setDeviceName,
};
