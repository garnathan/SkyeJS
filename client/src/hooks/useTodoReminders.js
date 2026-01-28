import { useEffect, useRef } from 'react';
import { todosApi } from '../services/api';

// Check interval - every 5 minutes
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Storage key for tracking notified items (to avoid duplicate notifications)
const NOTIFIED_KEY = 'todoRemindersNotified';

// Get today's date string for comparison
const getTodayString = () => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};

// Check if a reminder date is today
const isToday = (dateStr) => {
  if (!dateStr) return false;
  return dateStr === getTodayString();
};

// Check if a reminder is overdue
const isOverdue = (dateStr) => {
  if (!dateStr) return false;
  const today = getTodayString();
  return dateStr < today;
};

// Get notified items for today from localStorage
const getNotifiedItems = () => {
  try {
    const stored = localStorage.getItem(NOTIFIED_KEY);
    if (!stored) return { date: getTodayString(), ids: [] };

    const data = JSON.parse(stored);
    // Reset if it's a new day
    if (data.date !== getTodayString()) {
      return { date: getTodayString(), ids: [] };
    }
    return data;
  } catch {
    return { date: getTodayString(), ids: [] };
  }
};

// Save notified items to localStorage
const saveNotifiedItems = (ids) => {
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify({
    date: getTodayString(),
    ids,
  }));
};

// Request notification permission
const requestPermission = async () => {
  if (!('Notification' in window)) {
    console.log('[TodoReminders] Notifications not supported');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
};

// Show a browser notification
const showNotification = (title, body, onClick) => {
  if (Notification.permission !== 'granted') return;

  const notification = new Notification(title, {
    body,
    icon: '/favicon.svg',
    tag: 'todo-reminder',
    requireInteraction: true,
  });

  notification.onclick = () => {
    window.focus();
    if (onClick) onClick();
    notification.close();
  };
};

// Check for due items and notify
const checkAndNotify = async () => {
  try {
    const response = await todosApi.getAll();
    const todos = response.data;

    // Get items that are due today or overdue and not completed
    const dueItems = todos.filter((t) =>
      !t.completed && t.reminder && (isToday(t.reminder) || isOverdue(t.reminder))
    );

    if (dueItems.length === 0) return;

    // Get already notified items
    const { ids: notifiedIds } = getNotifiedItems();

    // Find items we haven't notified about yet
    const newDueItems = dueItems.filter((t) => !notifiedIds.includes(t.id));

    if (newDueItems.length === 0) return;

    // Request permission if needed
    const hasPermission = await requestPermission();
    if (!hasPermission) {
      console.log('[TodoReminders] No notification permission');
      return;
    }

    // Show notification
    const overdueItems = newDueItems.filter((t) => isOverdue(t.reminder));
    const todayItems = newDueItems.filter((t) => isToday(t.reminder));

    let title, body;

    if (overdueItems.length > 0 && todayItems.length > 0) {
      title = `${newDueItems.length} To-Do Items Need Attention`;
      body = newDueItems.map((t) => `• ${t.text}`).join('\n');
    } else if (overdueItems.length > 0) {
      title = overdueItems.length === 1
        ? 'Overdue To-Do Item'
        : `${overdueItems.length} Overdue To-Do Items`;
      body = overdueItems.map((t) => `• ${t.text}`).join('\n');
    } else {
      title = todayItems.length === 1
        ? 'To-Do Reminder for Today'
        : `${todayItems.length} To-Do Items Due Today`;
      body = todayItems.map((t) => `• ${t.text}`).join('\n');
    }

    showNotification(title, body, () => {
      // Navigate to todo page when clicked
      window.location.href = '/todo';
    });

    // Mark these items as notified
    const allNotifiedIds = [...notifiedIds, ...newDueItems.map((t) => t.id)];
    saveNotifiedItems(allNotifiedIds);

    console.log(`[TodoReminders] Notified about ${newDueItems.length} items`);
  } catch (error) {
    console.error('[TodoReminders] Error checking reminders:', error);
  }
};

// Global state to prevent multiple instances
let isMonitoringActive = false;
let monitorInterval = null;

// Start the reminder monitor
const startMonitor = () => {
  if (isMonitoringActive) {
    console.log('[TodoReminders] Already running');
    return;
  }

  console.log('[TodoReminders] Starting reminder monitor');
  isMonitoringActive = true;

  // Initial check after a short delay (let app settle)
  setTimeout(checkAndNotify, 3000);

  // Start interval
  monitorInterval = setInterval(checkAndNotify, CHECK_INTERVAL_MS);
};

// Stop the reminder monitor
const stopMonitor = () => {
  console.log('[TodoReminders] Stopping reminder monitor');
  isMonitoringActive = false;

  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
};

// Hook to start/manage the reminder monitor
export function useTodoReminders() {
  const mountedRef = useRef(false);

  useEffect(() => {
    // Only start on first mount
    if (!mountedRef.current) {
      mountedRef.current = true;
      startMonitor();
    }

    return () => {
      // Don't stop on unmount - keep running globally
    };
  }, []);

  return { checkAndNotify, stopMonitor };
}

// Export for testing
export { checkAndNotify, requestPermission };
