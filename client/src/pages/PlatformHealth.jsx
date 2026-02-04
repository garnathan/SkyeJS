import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  QuestionMarkCircleIcon,
  ArrowTopRightOnSquareIcon,
  ServerIcon,
} from '@heroicons/react/24/outline';
import { platformHealthApi } from '../services/api';

// Status configuration
const statusConfig = {
  operational: {
    color: 'text-green-500',
    bg: 'bg-green-500',
    bgLight: 'bg-green-100 dark:bg-green-900/30',
    label: 'Operational',
    icon: CheckCircleIcon,
  },
  degraded: {
    color: 'text-yellow-500',
    bg: 'bg-yellow-500',
    bgLight: 'bg-yellow-100 dark:bg-yellow-900/30',
    label: 'Degraded',
    icon: ExclamationTriangleIcon,
  },
  outage: {
    color: 'text-red-500',
    bg: 'bg-red-500',
    bgLight: 'bg-red-100 dark:bg-red-900/30',
    label: 'Outage',
    icon: XCircleIcon,
  },
  unknown: {
    color: 'text-slate-400',
    bg: 'bg-slate-400',
    bgLight: 'bg-slate-100 dark:bg-slate-700',
    label: 'Unknown',
    icon: QuestionMarkCircleIcon,
  },
};

// Component status colors
const componentStatusColors = {
  operational: 'text-green-500',
  degraded_performance: 'text-yellow-500',
  partial_outage: 'text-orange-500',
  major_outage: 'text-red-500',
  under_maintenance: 'text-blue-500',
};

// Health to status config mapping
const healthConfig = {
  healthy: statusConfig.operational,
  warning: statusConfig.degraded,
  critical: statusConfig.outage,
  unknown: statusConfig.unknown,
};

// Platform Card Component
function PlatformCard({ platform }) {
  const severity = platform.status?.severity || 'unknown';
  const config = statusConfig[severity] || statusConfig.unknown;
  const StatusIcon = config.icon;

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${config.bgLight}`}>
            <ServerIcon className={`w-6 h-6 ${config.color}`} />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">
              {platform.name}
            </h3>
            <a
              href={platform.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1"
            >
              Status page
              <ArrowTopRightOnSquareIcon className="w-3 h-3" />
            </a>
          </div>
        </div>
        <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${config.bgLight} ${config.color}`}>
          <StatusIcon className="w-4 h-4" />
          {config.label}
        </span>
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
        {platform.status?.description || 'Status unknown'}
      </p>

      {/* Components */}
      {platform.components && platform.components.length > 0 && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
          <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-2">
            Components
          </h4>
          <div className="space-y-2">
            {platform.components.map((component, index) => {
              const statusColor = componentStatusColors[component.status] || 'text-slate-400';
              const statusLabel = component.status
                ?.replace(/_/g, ' ')
                .replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown';

              return (
                <div key={index} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-300">
                    {component.name}
                  </span>
                  <span className={`${statusColor} font-medium`}>
                    {statusLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Last updated and monitor type */}
      <div className="flex items-center justify-between mt-4">
        {platform.lastUpdated && (
          <p className="text-xs text-slate-400">
            Last updated: {new Date(platform.lastUpdated).toLocaleString()}
          </p>
        )}
        {platform.monitorType === 'healthcheck' && (
          <span className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
            Health check
          </span>
        )}
      </div>

      {/* Error state */}
      {!platform.success && platform.error && (
        <p className="text-xs text-red-500 mt-2">
          Error: {platform.error}
        </p>
      )}
    </div>
  );
}

// Overall Health Summary
function HealthSummary({ health, platformCount, lastChecked, onRefresh, isFetching }) {
  const config = healthConfig[health] || healthConfig.unknown;
  const HealthIcon = config.icon;

  return (
    <div className="card p-6 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-xl ${config.bgLight}`}>
            <HealthIcon className={`w-8 h-8 ${config.color}`} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Overall Status
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Monitoring {platformCount} platform{platformCount !== 1 ? 's' : ''}
            </p>
          </div>
          <span className={`px-4 py-2 rounded-full text-sm font-medium ${config.bgLight} ${config.color}`}>
            {config.label}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {lastChecked && (
            <p className="text-xs text-slate-400">
              Last checked: {new Date(lastChecked).toLocaleTimeString()}
            </p>
          )}
          <button
            onClick={onRefresh}
            disabled={isFetching}
            className="btn-ghost p-2"
            title="Refresh"
          >
            <ArrowPathIcon className={`w-5 h-5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  );
}

function PlatformHealth() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [alertsEnabled, setAlertsEnabled] = useState(() => {
    const saved = localStorage.getItem('platformHealthAlertsEnabled');
    return saved !== null ? JSON.parse(saved) : true;
  });

  // Save alert preference
  useEffect(() => {
    localStorage.setItem('platformHealthAlertsEnabled', JSON.stringify(alertsEnabled));
  }, [alertsEnabled]);

  // Fetch platform health status
  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['platform-health'],
    queryFn: async () => {
      const response = await platformHealthApi.getStatus();
      return response.data;
    },
    refetchInterval: autoRefresh ? 60000 : false, // Check every minute when auto-refresh is on
    staleTime: 30000,
    retry: 2,
  });

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto animate-fade-in">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
          Platform Health
        </h1>
        <div className="card p-6 flex items-center justify-center h-64">
          <ArrowPathIcon className="w-8 h-8 animate-spin text-accent-500" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto animate-fade-in">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
          Platform Health
        </h1>
        <div className="card p-6 text-center">
          <XCircleIcon className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Failed to fetch platform status
          </p>
          <p className="text-sm text-red-500 mb-4">{error.message}</p>
          <button onClick={handleRefresh} className="btn-primary">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto animate-fade-in pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Platform Health
        </h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={alertsEnabled}
              onChange={(e) => setAlertsEnabled(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-600 text-accent-500 focus:ring-accent-500"
            />
            Outage alerts
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-600 text-accent-500 focus:ring-accent-500"
            />
            Auto-refresh
          </label>
        </div>
      </div>

      {/* Overall Health Summary */}
      <HealthSummary
        health={data?.health || 'unknown'}
        platformCount={data?.platforms?.length || 0}
        lastChecked={data?.timestamp}
        onRefresh={handleRefresh}
        isFetching={isFetching}
      />

      {/* Platform Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {data?.platforms?.map((platform) => (
          <PlatformCard key={platform.platform} platform={platform} />
        ))}
      </div>

      {/* Info footer */}
      <div className="text-center text-xs text-slate-400 dark:text-slate-500 mt-8">
        Status is checked automatically every minute when auto-refresh is enabled.
        <br />
        Outage alerts will show a browser popup when a platform goes down.
      </div>
    </div>
  );
}

export default PlatformHealth;
