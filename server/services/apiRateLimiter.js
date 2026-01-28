import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RATE_LIMIT_FILE = path.join(__dirname, '..', '..', 'data', 'api-rate-limits.json');

// Rate limit configuration
const RATE_LIMITS = {
  openweathermap: {
    maxCallsPerDay: 1000,
    // Use a safety margin - stop at 950 to leave buffer for any edge cases
    safeLimit: 950
  }
};

// In-memory tracking (persisted to file for server restarts)
let rateLimitData = {
  openweathermap: {
    date: null,
    count: 0
  }
};

// Load rate limit data from file
const loadRateLimitData = () => {
  try {
    if (fs.existsSync(RATE_LIMIT_FILE)) {
      const data = JSON.parse(fs.readFileSync(RATE_LIMIT_FILE, 'utf-8'));
      rateLimitData = data;
      logger.info('Loaded API rate limit data from file');
    }
  } catch (error) {
    logger.warn(`Failed to load rate limit data: ${error.message}`);
  }
};

// Save rate limit data to file
const saveRateLimitData = () => {
  try {
    const dir = path.dirname(RATE_LIMIT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(RATE_LIMIT_FILE, JSON.stringify(rateLimitData, null, 2));
  } catch (error) {
    logger.warn(`Failed to save rate limit data: ${error.message}`);
  }
};

// Get today's date string (YYYY-MM-DD)
const getTodayString = () => {
  return new Date().toISOString().split('T')[0];
};

// Reset counter if it's a new day
const resetIfNewDay = (apiName) => {
  const today = getTodayString();
  if (rateLimitData[apiName]?.date !== today) {
    rateLimitData[apiName] = {
      date: today,
      count: 0
    };
    saveRateLimitData();
    logger.info(`Reset ${apiName} API counter for new day: ${today}`);
  }
};

/**
 * Check if an API call is allowed (does NOT increment counter)
 * @param {string} apiName - The API name (e.g., 'openweathermap')
 * @returns {object} - { allowed: boolean, remaining: number, limit: number }
 */
export const canMakeApiCall = (apiName) => {
  const limits = RATE_LIMITS[apiName];
  if (!limits) {
    return { allowed: true, remaining: Infinity, limit: Infinity };
  }

  resetIfNewDay(apiName);

  const currentCount = rateLimitData[apiName]?.count || 0;
  const remaining = limits.safeLimit - currentCount;

  return {
    allowed: currentCount < limits.safeLimit,
    remaining: Math.max(0, remaining),
    limit: limits.safeLimit,
    count: currentCount
  };
};

/**
 * Record an API call (increment counter)
 * @param {string} apiName - The API name (e.g., 'openweathermap')
 * @returns {object} - { success: boolean, remaining: number }
 */
export const recordApiCall = (apiName) => {
  const limits = RATE_LIMITS[apiName];
  if (!limits) {
    return { success: true, remaining: Infinity };
  }

  resetIfNewDay(apiName);

  const currentCount = rateLimitData[apiName]?.count || 0;

  // Double-check we're still under limit
  if (currentCount >= limits.safeLimit) {
    logger.error(`BLOCKED: ${apiName} API call - daily limit reached (${currentCount}/${limits.safeLimit})`);
    return {
      success: false,
      remaining: 0,
      count: currentCount,
      limit: limits.safeLimit
    };
  }

  // Increment counter
  rateLimitData[apiName].count = currentCount + 1;
  saveRateLimitData();

  const remaining = limits.safeLimit - rateLimitData[apiName].count;

  // Log warning when getting close to limit
  if (remaining <= 100) {
    logger.warn(`OpenWeatherMap API: ${remaining} calls remaining today (${rateLimitData[apiName].count}/${limits.safeLimit})`);
  } else if (rateLimitData[apiName].count % 100 === 0) {
    logger.info(`OpenWeatherMap API: ${rateLimitData[apiName].count} calls made today, ${remaining} remaining`);
  }

  return {
    success: true,
    remaining,
    count: rateLimitData[apiName].count,
    limit: limits.safeLimit
  };
};

/**
 * Get current API usage stats
 * @param {string} apiName - The API name (e.g., 'openweathermap')
 * @returns {object} - Usage statistics
 */
export const getApiUsageStats = (apiName) => {
  const limits = RATE_LIMITS[apiName];
  if (!limits) {
    return null;
  }

  resetIfNewDay(apiName);

  const currentCount = rateLimitData[apiName]?.count || 0;

  return {
    apiName,
    date: rateLimitData[apiName]?.date || getTodayString(),
    count: currentCount,
    limit: limits.safeLimit,
    hardLimit: limits.maxCallsPerDay,
    remaining: Math.max(0, limits.safeLimit - currentCount),
    percentUsed: Math.round((currentCount / limits.safeLimit) * 100)
  };
};

// Load data on module initialization
loadRateLimitData();

export default {
  canMakeApiCall,
  recordApiCall,
  getApiUsageStats
};
