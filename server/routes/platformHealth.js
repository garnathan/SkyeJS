import { Router } from 'express';
import https from 'https';
import logger from '../utils/logger.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// Platform status endpoints - platforms with standard Statuspage API
const STATUSPAGE_PLATFORMS = {
  oci: {
    name: 'Oracle Cloud Infrastructure',
    statusUrl: 'https://ocistatus.oraclecloud.com/api/v2/status.json',
    componentsUrl: 'https://ocistatus.oraclecloud.com/api/v2/components.json',
    pageUrl: 'https://ocistatus.oraclecloud.com'
  }
};

// Platforms monitored via health check (no status API available)
// These can have multiple services to check
const HEALTHCHECK_PLATFORMS = {
  google: {
    name: 'Google Services',
    pageUrl: 'https://www.google.com/appsstatus/dashboard/',
    services: [
      { name: 'Gmail', url: 'https://mail.google.com' },
      { name: 'YouTube', url: 'https://www.youtube.com' }
    ]
  }
};

// Map indicator values to severity levels
const INDICATOR_SEVERITY = {
  'none': 'operational',
  'minor': 'degraded',
  'major': 'outage',
  'critical': 'outage'
};

// Fetch JSON from a URL
const fetchJson = (url, timeout = 10000) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const req = https.get(url, {
      timeout,
      headers: {
        'User-Agent': 'SkyeJS-Platform-Monitor/1.0',
        'Accept': 'application/json'
      }
    }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchJson(res.headers.location, timeout)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          json._responseTime = Date.now() - startTime;
          resolve(json);
        } catch (e) {
          reject(new Error('Invalid JSON response'));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
};

// Perform HTTP health check (HEAD request)
const healthCheck = (url, timeout = 10000) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const urlObj = new URL(url);

    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname || '/',
      method: 'HEAD',
      timeout,
      headers: {
        'User-Agent': 'SkyeJS-Platform-Monitor/1.0'
      }
    }, (res) => {
      resolve({
        success: res.statusCode >= 200 && res.statusCode < 400,
        statusCode: res.statusCode,
        responseTime: Date.now() - startTime
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.end();
  });
};

// Get status for a platform with Statuspage API
const getStatuspageStatus = async (platformKey) => {
  const platform = STATUSPAGE_PLATFORMS[platformKey];
  if (!platform) {
    throw new Error(`Unknown statuspage platform: ${platformKey}`);
  }

  const startTime = Date.now();

  try {
    const [statusData, componentsData] = await Promise.all([
      fetchJson(platform.statusUrl),
      fetchJson(platform.componentsUrl).catch(() => null) // Components are optional
    ]);

    const indicator = statusData.status?.indicator || 'unknown';
    const severity = INDICATOR_SEVERITY[indicator] || 'unknown';

    // Parse components if available
    let components = [];
    if (componentsData?.components) {
      components = componentsData.components
        .filter(c => c.status !== undefined)
        .map(c => ({
          name: c.name,
          status: c.status,
          description: c.description || null
        }));
    }

    return {
      platform: platformKey,
      name: platform.name,
      pageUrl: platform.pageUrl,
      status: {
        indicator,
        severity,
        description: statusData.status?.description || 'Unknown'
      },
      components,
      lastUpdated: statusData.page?.updated_at || new Date().toISOString(),
      responseTime: Date.now() - startTime,
      success: true
    };
  } catch (error) {
    logger.error(`Failed to fetch ${platform.name} status:`, error.message);
    return {
      platform: platformKey,
      name: platform.name,
      pageUrl: platform.pageUrl,
      status: {
        indicator: 'unknown',
        severity: 'unknown',
        description: 'Unable to fetch status'
      },
      components: [],
      lastUpdated: null,
      responseTime: Date.now() - startTime,
      success: false,
      error: error.message
    };
  }
};

// Get status for a platform via health check
const getHealthcheckStatus = async (platformKey) => {
  const platform = HEALTHCHECK_PLATFORMS[platformKey];
  if (!platform) {
    throw new Error(`Unknown healthcheck platform: ${platformKey}`);
  }

  const startTime = Date.now();

  // Check all services in parallel
  const serviceResults = await Promise.all(
    platform.services.map(async (service) => {
      try {
        const result = await healthCheck(service.url);
        return {
          name: service.name,
          status: result.success ? 'operational' : 'major_outage',
          success: result.success,
          responseTime: result.responseTime
        };
      } catch (error) {
        return {
          name: service.name,
          status: 'major_outage',
          success: false,
          error: error.message
        };
      }
    })
  );

  // Determine overall status based on service results
  const allOperational = serviceResults.every(s => s.success);
  const allDown = serviceResults.every(s => !s.success);
  const operationalCount = serviceResults.filter(s => s.success).length;

  let severity, indicator, description;
  if (allOperational) {
    severity = 'operational';
    indicator = 'none';
    description = 'All services operational';
  } else if (allDown) {
    severity = 'outage';
    indicator = 'critical';
    description = 'All services unreachable';
  } else {
    severity = 'degraded';
    indicator = 'major';
    description = `${operationalCount}/${serviceResults.length} services operational`;
  }

  return {
    platform: platformKey,
    name: platform.name,
    pageUrl: platform.pageUrl,
    status: {
      indicator,
      severity,
      description
    },
    components: serviceResults,
    lastUpdated: new Date().toISOString(),
    responseTime: Date.now() - startTime,
    success: true,
    monitorType: 'healthcheck'
  };
};

// Get status for a single platform (routes to appropriate handler)
const getPlatformStatus = async (platformKey) => {
  if (STATUSPAGE_PLATFORMS[platformKey]) {
    return getStatuspageStatus(platformKey);
  }
  if (HEALTHCHECK_PLATFORMS[platformKey]) {
    return getHealthcheckStatus(platformKey);
  }
  throw new Error(`Unknown platform: ${platformKey}`);
};

// Get all platform keys
const getAllPlatformKeys = () => {
  return [
    ...Object.keys(STATUSPAGE_PLATFORMS),
    ...Object.keys(HEALTHCHECK_PLATFORMS)
  ];
};

// Get status for all platforms
router.get('/status', asyncHandler(async (req, res) => {
  logger.info('Fetching platform health status');
  const startTime = Date.now();

  const results = await Promise.all(
    getAllPlatformKeys().map(key => getPlatformStatus(key))
  );

  // Determine overall health
  const hasOutage = results.some(r => r.status.severity === 'outage');
  const hasDegraded = results.some(r => r.status.severity === 'degraded');
  const hasUnknown = results.some(r => r.status.severity === 'unknown');

  let overallHealth = 'healthy';
  if (hasOutage) overallHealth = 'critical';
  else if (hasDegraded) overallHealth = 'warning';
  else if (hasUnknown) overallHealth = 'unknown';

  res.json({
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime,
    health: overallHealth,
    platforms: results
  });
}));

// Get status for a specific platform
router.get('/status/:platform', asyncHandler(async (req, res) => {
  const { platform } = req.params;
  const allKeys = getAllPlatformKeys();

  if (!allKeys.includes(platform)) {
    return res.status(400).json({
      error: 'Invalid platform',
      validPlatforms: allKeys
    });
  }

  const result = await getPlatformStatus(platform);
  res.json(result);
}));

// Get list of monitored platforms
router.get('/platforms', asyncHandler(async (req, res) => {
  const statuspagePlatforms = Object.entries(STATUSPAGE_PLATFORMS).map(([key, value]) => ({
    id: key,
    name: value.name,
    pageUrl: value.pageUrl,
    monitorType: 'statuspage'
  }));

  const healthcheckPlatforms = Object.entries(HEALTHCHECK_PLATFORMS).map(([key, value]) => ({
    id: key,
    name: value.name,
    pageUrl: value.pageUrl,
    monitorType: 'healthcheck'
  }));

  res.json({
    platforms: [...statuspagePlatforms, ...healthcheckPlatforms]
  });
}));

export default router;
