import { useEffect, useRef, useCallback } from 'react';
import { networkApi } from '../services/api';

// Debounce timings
const DEBOUNCE_DOWN_MS = 5000; // Wait 5 seconds before alerting connection down
const DEBOUNCE_UP_MS = 2000;   // Wait 2 seconds before alerting connection restored
const CHECK_INTERVAL_MS = 10000; // Check every 10 seconds
const SLEEP_THRESHOLD_MS = 30000; // Consider it sleep if 30+ seconds between checks

// Get alert preference from localStorage
const getAlertPreference = () => {
  const saved = localStorage.getItem('networkAlertsEnabled');
  return saved !== null ? JSON.parse(saved) : true;
};

// Global state to prevent multiple instances
let isMonitoringActive = false;
let monitorInterval = null;
let lastKnownState = null; // 'online' | 'offline' | null
let stateChangeTimer = null;
let consecutiveFailures = 0;
let consecutiveSuccesses = 0;

// Sleep detection state
let lastCheckTime = Date.now();
let isReturningFromSleep = false;
let sleepGraceChecks = 0; // Number of checks to skip alerts after waking
const SLEEP_GRACE_CHECKS = 3; // Skip 3 checks (~30 seconds) after waking

// Page visibility state for sleep detection
let pageHiddenTime = null;
let visibilityListenerAdded = false;

// Handle page visibility changes (detect sleep/wake)
const handleVisibilityChange = () => {
  if (document.hidden) {
    // Page is now hidden - record the time
    pageHiddenTime = Date.now();
    console.log('[NetworkMonitor] Page hidden at', new Date(pageHiddenTime).toISOString());
  } else {
    // Page is now visible - check if we were asleep
    if (pageHiddenTime) {
      const hiddenDuration = Date.now() - pageHiddenTime;
      console.log('[NetworkMonitor] Page visible after', Math.round(hiddenDuration / 1000), 'seconds');

      if (hiddenDuration >= SLEEP_THRESHOLD_MS) {
        // We were likely asleep - suppress alerts for a few checks
        console.log('[NetworkMonitor] Detected sleep/wake cycle, suppressing alerts temporarily');
        isReturningFromSleep = true;
        sleepGraceChecks = SLEEP_GRACE_CHECKS;

        // Reset state to avoid false alerts
        consecutiveFailures = 0;
        consecutiveSuccesses = 0;

        // Clear any pending alert timers
        if (stateChangeTimer) {
          clearTimeout(stateChangeTimer);
          stateChangeTimer = null;
        }
      }
      pageHiddenTime = null;
    }

    // Update last check time to avoid time gap detection
    lastCheckTime = Date.now();
  }
};

// Check network status
const checkNetworkStatus = async () => {
  const now = Date.now();
  const timeSinceLastCheck = now - lastCheckTime;

  // Detect sleep by checking if too much time passed between checks
  // This catches cases where visibility API didn't fire (lid closed without browser knowing)
  if (timeSinceLastCheck > SLEEP_THRESHOLD_MS) {
    console.log('[NetworkMonitor] Time gap detected:', Math.round(timeSinceLastCheck / 1000), 'seconds - likely sleep');
    isReturningFromSleep = true;
    sleepGraceChecks = SLEEP_GRACE_CHECKS;

    // Reset counters
    consecutiveFailures = 0;
    consecutiveSuccesses = 0;

    // Clear any pending alert timers
    if (stateChangeTimer) {
      clearTimeout(stateChangeTimer);
      stateChangeTimer = null;
    }
  }

  lastCheckTime = now;

  const alertsEnabled = getAlertPreference();

  // Decrement grace period counter
  if (sleepGraceChecks > 0) {
    sleepGraceChecks--;
    console.log('[NetworkMonitor] Sleep grace period:', sleepGraceChecks, 'checks remaining');
    if (sleepGraceChecks === 0) {
      isReturningFromSleep = false;
      console.log('[NetworkMonitor] Sleep grace period ended');
    }
  }

  try {
    // Set a timeout for the request - if it takes too long, the network is likely down
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    const response = await networkApi.getCurrent({ signal: controller.signal });
    clearTimeout(timeoutId);

    const data = response.data;
    const isOnline = data.success;

    if (isOnline) {
      consecutiveSuccesses++;
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
      consecutiveSuccesses = 0;
    }

    handleStateChange(isOnline, alertsEnabled, data);
  } catch (error) {
    // Request failed - network is likely down
    // This catches both network errors and timeout aborts
    consecutiveFailures++;
    consecutiveSuccesses = 0;

    handleStateChange(false, alertsEnabled, null);
  }
};

// Handle state transitions with debouncing
const handleStateChange = (isOnline, alertsEnabled, data) => {
  // Clear any pending state change timer
  if (stateChangeTimer) {
    clearTimeout(stateChangeTimer);
    stateChangeTimer = null;
  }

  // Initialize state without alerting
  if (lastKnownState === null) {
    lastKnownState = isOnline ? 'online' : 'offline';
    console.log('[NetworkMonitor] Initial state:', lastKnownState);
    return;
  }

  // Skip alerts if returning from sleep
  if (isReturningFromSleep || sleepGraceChecks > 0) {
    // Still update state, just don't alert
    if (isOnline && consecutiveSuccesses >= 2) {
      lastKnownState = 'online';
      console.log('[NetworkMonitor] State updated to online (no alert - returning from sleep)');
    } else if (!isOnline && consecutiveFailures >= 2) {
      lastKnownState = 'offline';
      console.log('[NetworkMonitor] State updated to offline (no alert - returning from sleep)');
    }
    return;
  }

  // Only process if alerts are enabled
  if (!alertsEnabled) {
    // Still update state, just don't alert
    if (isOnline && consecutiveSuccesses >= 2) {
      lastKnownState = 'online';
    } else if (!isOnline && consecutiveFailures >= 2) {
      lastKnownState = 'offline';
    }
    return;
  }

  // Transition: online -> offline
  if (lastKnownState === 'online' && !isOnline) {
    console.log('[NetworkMonitor] Connection may be down, waiting for debounce...', { consecutiveFailures });
    stateChangeTimer = setTimeout(() => {
      // Double-check we're not in sleep grace period
      if (sleepGraceChecks > 0 || isReturningFromSleep) {
        console.log('[NetworkMonitor] Suppressing offline alert - in sleep grace period');
        return;
      }
      // Only alert if still failing after debounce period
      if (consecutiveFailures >= 2) {
        lastKnownState = 'offline';
        console.log('[NetworkMonitor] Connection LOST - alerting user');
        window.alert('⚠️ Network Connection Lost\n\nYour internet connection appears to be down.\n\nLatency: --\nPacket Loss: 100%');
      }
    }, DEBOUNCE_DOWN_MS);
  }
  // Transition: offline -> online
  else if (lastKnownState === 'offline' && isOnline) {
    console.log('[NetworkMonitor] Connection may be restored, waiting for debounce...', { consecutiveSuccesses });
    stateChangeTimer = setTimeout(() => {
      // Double-check we're not in sleep grace period
      if (sleepGraceChecks > 0 || isReturningFromSleep) {
        console.log('[NetworkMonitor] Suppressing online alert - in sleep grace period');
        lastKnownState = 'online'; // Still update state
        return;
      }
      // Only alert if still succeeding after debounce period
      if (consecutiveSuccesses >= 2) {
        lastKnownState = 'online';
        const latency = data?.latency ? `${data.latency.toFixed(1)} ms` : '--';
        const packetLoss = data?.packetLoss !== undefined ? `${data.packetLoss}%` : '--';
        console.log('[NetworkMonitor] Connection RESTORED - alerting user');
        window.alert(`✅ Network Connection Restored\n\nYour internet connection is back online.\n\nLatency: ${latency}\nPacket Loss: ${packetLoss}`);
      }
    }, DEBOUNCE_UP_MS);
  }
};

// Start the global monitor
const startMonitor = () => {
  if (isMonitoringActive) {
    console.log('[NetworkMonitor] Already running');
    return;
  }

  console.log('[NetworkMonitor] Starting global network monitor');
  isMonitoringActive = true;
  lastCheckTime = Date.now();

  // Add visibility change listener for sleep detection
  if (!visibilityListenerAdded) {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    visibilityListenerAdded = true;
    console.log('[NetworkMonitor] Added visibility change listener for sleep detection');
  }

  // Initial check
  checkNetworkStatus();

  // Start interval
  monitorInterval = setInterval(checkNetworkStatus, CHECK_INTERVAL_MS);
};

// Stop the global monitor
const stopMonitor = () => {
  console.log('[NetworkMonitor] Stopping global network monitor');
  isMonitoringActive = false;

  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }

  if (stateChangeTimer) {
    clearTimeout(stateChangeTimer);
    stateChangeTimer = null;
  }

  // Remove visibility listener
  if (visibilityListenerAdded) {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    visibilityListenerAdded = false;
  }
};

// Hook to start/manage the network monitor
export function useNetworkMonitor() {
  const mountedRef = useRef(false);

  // Force a check (useful for testing)
  const forceCheck = useCallback(() => {
    checkNetworkStatus();
  }, []);

  // Get current state
  const getState = useCallback(() => ({
    isMonitoring: isMonitoringActive,
    lastKnownState,
    consecutiveFailures,
    consecutiveSuccesses,
    isReturningFromSleep,
    sleepGraceChecks,
  }), []);

  useEffect(() => {
    // Only start on first mount of any component using this hook
    if (!mountedRef.current) {
      mountedRef.current = true;
      startMonitor();
    }

    // Cleanup on unmount - but don't stop the monitor since it's global
    // The monitor should keep running as long as the app is open
    return () => {
      // Don't stop the monitor on component unmount
      // It will be cleaned up when the app is closed
    };
  }, []);

  return { forceCheck, getState, stopMonitor };
}

// Export for testing/debugging
export { checkNetworkStatus, startMonitor, stopMonitor };
