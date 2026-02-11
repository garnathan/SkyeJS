import { useEffect, useRef, useCallback } from 'react';
import { platformHealthApi } from '../services/api';

// Check interval (2 minutes for external services)
const CHECK_INTERVAL_MS = 120000;

// Get alert preference from localStorage
const getAlertPreference = () => {
  const saved = localStorage.getItem('platformHealthAlertsEnabled');
  return saved !== null ? JSON.parse(saved) : true;
};

// Global state to prevent multiple instances
let isMonitoringActive = false;
let monitorInterval = null;
let lastKnownStatuses = {}; // { platformId: 'operational' | 'degraded' | 'outage' | 'unknown' }
let isInitialized = false;

// Platform display names
const PLATFORM_NAMES = {
  oci: 'Oracle Cloud Infrastructure',
  google: 'Google Services',
};

// Check platform health
const checkPlatformHealth = async () => {
  const alertsEnabled = getAlertPreference();

  try {
    const response = await platformHealthApi.getStatus();
    const data = response.data;

    if (!data?.platforms) {
      console.log('[PlatformHealthMonitor] No platforms data received');
      return;
    }

    // Process each platform
    for (const platform of data.platforms) {
      const platformId = platform.platform;
      const currentSeverity = platform.status?.severity || 'unknown';
      const previousSeverity = lastKnownStatuses[platformId];
      const platformName = PLATFORM_NAMES[platformId] || platform.name || platformId;

      // Initialize state without alerting
      if (!isInitialized) {
        lastKnownStatuses[platformId] = currentSeverity;
        console.log(`[PlatformHealthMonitor] Initial state for ${platformName}: ${currentSeverity}`);
        continue;
      }

      // Check for state transitions
      if (previousSeverity && currentSeverity !== previousSeverity) {
        console.log(`[PlatformHealthMonitor] ${platformName}: ${previousSeverity} -> ${currentSeverity}`);

        // Only alert if alerts are enabled
        if (alertsEnabled) {
          // Alert on degradation or outage
          if ((currentSeverity === 'outage' || currentSeverity === 'degraded') &&
              previousSeverity === 'operational') {
            const icon = currentSeverity === 'outage' ? '🔴' : '🟡';
            const statusLabel = currentSeverity === 'outage' ? 'OUTAGE' : 'DEGRADED';
            window.alert(
              `${icon} ${platformName} ${statusLabel}\n\n` +
              `${platform.status?.description || 'Service issues detected'}\n\n` +
              `Check: ${platform.pageUrl || 'Status page'}`
            );
          }

          // Alert on recovery
          if (currentSeverity === 'operational' &&
              (previousSeverity === 'outage' || previousSeverity === 'degraded')) {
            window.alert(
              `✅ ${platformName} Restored\n\n` +
              `${platform.status?.description || 'All systems operational'}`
            );
          }
        }

        lastKnownStatuses[platformId] = currentSeverity;
      } else if (!previousSeverity) {
        // First time seeing this platform after initialization
        lastKnownStatuses[platformId] = currentSeverity;
      }
    }

    // Mark as initialized after first successful check
    if (!isInitialized) {
      isInitialized = true;
      console.log('[PlatformHealthMonitor] Initialized with statuses:', { ...lastKnownStatuses });
    }

  } catch (error) {
    console.error('[PlatformHealthMonitor] Failed to check platform health:', error.message);
    // Don't alert on fetch failures - the platform health page will show errors
  }
};

// Start the global monitor
const startMonitor = () => {
  if (isMonitoringActive) {
    console.log('[PlatformHealthMonitor] Already running');
    return;
  }

  console.log('[PlatformHealthMonitor] Starting global platform health monitor');
  isMonitoringActive = true;

  // Initial check
  checkPlatformHealth();

  // Start interval
  monitorInterval = setInterval(checkPlatformHealth, CHECK_INTERVAL_MS);
};

// Stop the global monitor
const stopMonitor = () => {
  console.log('[PlatformHealthMonitor] Stopping global platform health monitor');
  isMonitoringActive = false;
  isInitialized = false;
  lastKnownStatuses = {};

  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
};

// Hook to start/manage the platform health monitor
export function usePlatformHealthMonitor() {
  const mountedRef = useRef(false);

  // Force a check (useful for testing)
  const forceCheck = useCallback(() => {
    checkPlatformHealth();
  }, []);

  // Get current state
  const getState = useCallback(() => ({
    isMonitoring: isMonitoringActive,
    lastKnownStatuses: { ...lastKnownStatuses },
    isInitialized,
  }), []);

  useEffect(() => {
    // Only start on first mount of any component using this hook
    if (!mountedRef.current) {
      mountedRef.current = true;
      startMonitor();
    }

    // Cleanup on unmount - but don't stop the monitor since it's global
    return () => {
      // Don't stop the monitor on component unmount
    };
  }, []);

  return { forceCheck, getState, stopMonitor };
}

// Export for testing/debugging
export { checkPlatformHealth, startMonitor, stopMonitor };
