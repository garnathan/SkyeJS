import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import {
  SignalIcon,
  SignalSlashIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ShieldCheckIcon,
  WifiIcon,
  MoonIcon,
} from '@heroicons/react/24/outline';
import { networkApi } from '../services/api';

// Health status colors and labels
const healthConfig = {
  healthy: {
    color: 'text-green-500',
    bg: 'bg-green-500',
    bgLight: 'bg-green-100 dark:bg-green-900/30',
    label: 'Healthy',
    icon: CheckCircleIcon,
  },
  warning: {
    color: 'text-yellow-500',
    bg: 'bg-yellow-500',
    bgLight: 'bg-yellow-100 dark:bg-yellow-900/30',
    label: 'Degraded',
    icon: ExclamationTriangleIcon,
  },
  critical: {
    color: 'text-red-500',
    bg: 'bg-red-500',
    bgLight: 'bg-red-100 dark:bg-red-900/30',
    label: 'Critical',
    icon: XCircleIcon,
  },
};

// Period options
const PERIODS = [
  { key: '1h', label: '1 Hour' },
  { key: '6h', label: '6 Hours' },
  { key: '12h', label: '12 Hours' },
  { key: '24h', label: '24 Hours' },
  { key: '7d', label: '7 Days' },
];

// Format timestamp for chart
const formatTime = (timestamp, period) => {
  const date = new Date(timestamp);
  if (period === '7d') {
    return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
  }
  if (period === '24h' || period === '12h') {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

// Format duration for display
const formatDuration = (ms) => {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
};

// Format gap duration with more detail
const formatGapDuration = (ms) => {
  if (ms < 60000) return `${Math.round(ms / 1000)} seconds`;
  if (ms < 3600000) {
    const mins = Math.round(ms / 60000);
    return `${mins} minute${mins !== 1 ? 's' : ''}`;
  }
  const hours = Math.floor(ms / 3600000);
  const mins = Math.round((ms % 3600000) / 60000);
  if (mins === 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
  return `${hours}h ${mins}m`;
};

// Custom tooltip for charts
function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  const date = new Date(data.timestamp);
  const formattedDate = date.toLocaleString();

  return (
    <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{formattedDate}</p>
      {payload.map((entry, index) => (
        <p key={index} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {entry.value !== null ? `${entry.value.toFixed(1)}${entry.unit || ''}` : 'N/A'}
        </p>
      ))}
      {data.vpn && (
        <p className="text-xs text-purple-500 mt-1 flex items-center gap-1">
          <ShieldCheckIcon className="w-3 h-3" /> VPN Connected
        </p>
      )}
      {data.sampleCount && (
        <p className="text-xs text-slate-400 mt-1">{data.sampleCount} samples</p>
      )}
    </div>
  );
}

// Current Status Card
function CurrentStatus({ data, isLoading, onRefresh, isFetching }) {
  if (isLoading) {
    return (
      <div className="card p-6 mb-6">
        <div className="flex items-center justify-center h-32">
          <ArrowPathIcon className="w-6 h-6 animate-spin text-accent-500" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card p-6 mb-6 text-center">
        <SignalSlashIcon className="w-10 h-10 text-slate-400 mx-auto mb-3" />
        <p className="text-slate-500 dark:text-slate-400 mb-3">Unable to check network status</p>
        <button onClick={onRefresh} className="btn-primary text-sm">
          Retry
        </button>
      </div>
    );
  }

  const health = data.health || 'warning';
  const healthStyle = healthConfig[health] || healthConfig.warning;
  const HealthIcon = healthStyle.icon;

  const latencyStatus = !data.latency ? 'unknown' : data.latency < 50 ? 'good' : data.latency < 100 ? 'warning' : 'critical';
  const lossStatus = data.packetLoss === 0 ? 'good' : data.packetLoss < 2 ? 'warning' : 'critical';

  const statusColors = {
    good: 'text-green-500',
    warning: 'text-yellow-500',
    critical: 'text-red-500',
    unknown: 'text-slate-400',
  };

  return (
    <div className="card p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Current Status</h2>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${healthStyle.bgLight} ${healthStyle.color}`}>
            <HealthIcon className="w-4 h-4 inline mr-1" />
            {healthStyle.label}
          </span>
          {data.vpn?.connected && (
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
              <ShieldCheckIcon className="w-4 h-4 inline mr-1" />
              VPN{data.vpn.name ? `: ${data.vpn.name}` : ''}
            </span>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={isFetching}
          className="btn-ghost p-2"
          title="Refresh"
        >
          <ArrowPathIcon className={`w-5 h-5 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Latency</p>
          <p className={`text-2xl font-bold ${statusColors[latencyStatus]}`}>
            {data.latency !== null ? `${data.latency.toFixed(1)} ms` : '--'}
          </p>
        </div>
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Packet Loss</p>
          <p className={`text-2xl font-bold ${statusColors[lossStatus]}`}>
            {data.packetLoss !== null ? `${data.packetLoss.toFixed(1)}%` : '--'}
          </p>
        </div>
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Wi-Fi Signal</p>
          <p className={`text-2xl font-bold ${
            data.wifi?.signal === null ? 'text-slate-400' :
            data.wifi.signal >= -50 ? 'text-green-500' :
            data.wifi.signal >= -70 ? 'text-yellow-500' : 'text-red-500'
          }`}>
            {data.wifi?.signal !== null ? `${data.wifi.signal} dBm` : '--'}
          </p>
          {data.wifi?.quality !== null && (
            <p className="text-xs text-slate-400">{data.wifi.quality}% quality</p>
          )}
        </div>
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Status</p>
          <p className={`text-2xl font-bold ${data.success ? 'text-green-500' : 'text-red-500'}`}>
            {data.success ? 'Online' : 'Offline'}
          </p>
        </div>
      </div>

      <p className="text-xs text-slate-400 mt-4">
        Last checked: {new Date(data.timestamp).toLocaleString()}
      </p>
    </div>
  );
}

// Statistics Summary Card
function StatsSummary({ stats }) {
  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-2">
          <ClockIcon className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-500 dark:text-slate-400">Avg Latency</span>
        </div>
        <p className={`text-2xl font-bold ${stats.latency?.avg < 50 ? 'text-green-500' : stats.latency?.avg < 100 ? 'text-yellow-500' : 'text-red-500'}`}>
          {stats.latency?.avg !== null ? `${stats.latency.avg.toFixed(1)} ms` : '--'}
        </p>
        {stats.latency?.p95 && (
          <p className="text-xs text-slate-400 mt-1">P95: {stats.latency.p95.toFixed(1)} ms</p>
        )}
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-2 mb-2">
          <SignalIcon className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-500 dark:text-slate-400">Avg Packet Loss</span>
        </div>
        <p className={`text-2xl font-bold ${stats.packetLoss?.avg === 0 ? 'text-green-500' : stats.packetLoss?.avg < 2 ? 'text-yellow-500' : 'text-red-500'}`}>
          {stats.packetLoss?.avg !== null ? `${stats.packetLoss.avg.toFixed(2)}%` : '--'}
        </p>
        {stats.packetLoss?.max > 0 && (
          <p className="text-xs text-slate-400 mt-1">Max: {stats.packetLoss.max.toFixed(1)}%</p>
        )}
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-2 mb-2">
          <WifiIcon className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-500 dark:text-slate-400">Uptime</span>
        </div>
        <p className={`text-2xl font-bold ${stats.uptime >= 99 ? 'text-green-500' : stats.uptime >= 95 ? 'text-yellow-500' : 'text-red-500'}`}>
          {stats.uptime !== null ? `${stats.uptime}%` : '--'}
        </p>
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheckIcon className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-500 dark:text-slate-400">VPN Time</span>
        </div>
        <p className="text-2xl font-bold text-purple-500">
          {stats.vpnTime !== null ? `${stats.vpnTime}%` : '--'}
        </p>
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-2 mb-2">
          <MoonIcon className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-500 dark:text-slate-400">Sleep Periods</span>
        </div>
        <p className={`text-2xl font-bold ${stats.gaps?.length === 0 ? 'text-green-500' : 'text-indigo-500'}`}>
          {stats.gaps?.length ?? '--'}
        </p>
        {stats.gaps?.length > 0 && (
          <p className="text-xs text-slate-400 mt-1">
            Longest: {formatDuration(Math.max(...stats.gaps.map(g => g.duration)))}
          </p>
        )}
      </div>
    </div>
  );
}

// History Chart
function HistoryChart({ data, stats, period, metric }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-400">
        No data available for this period
      </div>
    );
  }

  // Prepare data with gap markers
  const chartData = [];
  const gaps = stats?.gaps || [];

  for (let i = 0; i < data.length; i++) {
    const sample = data[i];
    chartData.push({
      ...sample,
      time: formatTime(sample.timestamp, period),
      // Handle both nested wifi object and flat wifi properties
      wifiSignal: sample.wifi?.signal ?? null,
      wifiQuality: sample.wifi?.quality ?? null,
    });
  }

  const isLatency = metric === 'latency';
  const isWifi = metric === 'wifi';
  const dataKey = isLatency ? 'latency' : isWifi ? 'wifiSignal' : 'packetLoss';
  const color = isLatency ? '#3b82f6' : isWifi ? '#22c55e' : '#ef4444';
  const unit = isLatency ? ' ms' : isWifi ? ' dBm' : '%';
  const yLabel = isLatency ? 'Latency (ms)' : isWifi ? 'Signal (dBm)' : 'Packet Loss (%)';

  // Thresholds for each metric type
  let warningThreshold, criticalThreshold;
  if (isLatency) {
    warningThreshold = 100;
    criticalThreshold = 200;
  } else if (isWifi) {
    // Wi-Fi signal: -50 is good, -70 is warning, -80 is critical (inverted since lower is worse)
    warningThreshold = -70;
    criticalThreshold = -80;
  } else {
    warningThreshold = 2;
    criticalThreshold = 10;
  }

  // Find VPN segments for highlighting
  const vpnSegments = [];
  let vpnStart = null;
  for (let i = 0; i < chartData.length; i++) {
    if (chartData[i].vpn && vpnStart === null) {
      vpnStart = i;
    } else if (!chartData[i].vpn && vpnStart !== null) {
      vpnSegments.push({ start: vpnStart, end: i - 1 });
      vpnStart = null;
    }
  }
  if (vpnStart !== null) {
    vpnSegments.push({ start: vpnStart, end: chartData.length - 1 });
  }

  // Calculate Y domain for Wi-Fi (signal strength is negative, so we need to handle it differently)
  const getYDomain = () => {
    if (isLatency) return [0, 'auto'];
    if (isWifi) {
      const signals = chartData.map(d => d.wifiSignal).filter(s => s !== null);
      if (signals.length === 0) return [-90, -30];
      const min = Math.min(...signals);
      const max = Math.max(...signals);
      return [Math.min(min - 5, -90), Math.max(max + 5, -30)];
    }
    return [0, Math.max(10, ...chartData.map(d => d.packetLoss || 0))];
  };

  return (
    <ResponsiveContainer width="100%" height={256}>
      <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
        <XAxis
          dataKey="time"
          tick={{ fontSize: 11 }}
          className="text-slate-500"
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11 }}
          className="text-slate-500"
          domain={getYDomain()}
          label={{ value: yLabel, angle: -90, position: 'insideLeft', fontSize: 11, className: 'fill-slate-500' }}
        />
        <Tooltip content={<ChartTooltip />} />

        {/* Threshold lines - different treatment for Wi-Fi */}
        {isWifi ? (
          <>
            {/* Good signal zone (-50 and above) */}
            <ReferenceArea y1={-50} y2={-30} fill="#22c55e" fillOpacity={0.1} />
            {/* Warning zone */}
            <ReferenceLine
              y={-70}
              stroke="#eab308"
              strokeDasharray="5 5"
              label={{ value: 'Weak', fill: '#eab308', fontSize: 10 }}
            />
            {/* Critical zone */}
            <ReferenceLine
              y={-80}
              stroke="#ef4444"
              strokeDasharray="5 5"
              label={{ value: 'Poor', fill: '#ef4444', fontSize: 10 }}
            />
          </>
        ) : (
          <>
            <ReferenceLine
              y={warningThreshold}
              stroke="#eab308"
              strokeDasharray="5 5"
              label={{ value: 'Warning', fill: '#eab308', fontSize: 10 }}
            />
            <ReferenceLine
              y={criticalThreshold}
              stroke="#ef4444"
              strokeDasharray="5 5"
              label={{ value: 'Critical', fill: '#ef4444', fontSize: 10 }}
            />
          </>
        )}

        {/* VPN segments highlighted in purple */}
        {vpnSegments.map((segment, i) => (
          <ReferenceArea
            key={i}
            x1={chartData[segment.start]?.time}
            x2={chartData[segment.end]?.time}
            fill="#a855f7"
            fillOpacity={0.1}
          />
        ))}

        {/* Sleep/gap markers - show as distinct sleep periods */}
        {gaps.map((gap, i) => {
          const startTime = formatTime(gap.start, period);
          const endTime = formatTime(gap.end, period);
          return (
            <ReferenceArea
              key={`gap-${i}`}
              x1={startTime}
              x2={endTime}
              fill="#6366f1"
              fillOpacity={0.15}
              label={{ value: '💤', fontSize: 12 }}
            />
          );
        })}

        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          dot={false}
          connectNulls={false}
          name={isLatency ? 'Latency' : isWifi ? 'Wi-Fi Signal' : 'Packet Loss'}
          unit={unit}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Note: Connection alerts are now handled globally by useNetworkMonitor in App.jsx
// This ensures alerts work even when the user is on a different page

function Network() {
  const [selectedPeriod, setSelectedPeriod] = useState('1h');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [alertsEnabled, setAlertsEnabled] = useState(() => {
    // Persist alert preference in localStorage (also used by global monitor)
    const saved = localStorage.getItem('networkAlertsEnabled');
    return saved !== null ? JSON.parse(saved) : true;
  });

  // Save alert preference (global monitor reads from localStorage)
  useEffect(() => {
    localStorage.setItem('networkAlertsEnabled', JSON.stringify(alertsEnabled));
  }, [alertsEnabled]);

  // Fetch current status for display only (alerts handled globally)
  const {
    data: currentStatus,
    isLoading: currentLoading,
    isFetching: currentFetching,
    refetch: refetchCurrent,
  } = useQuery({
    queryKey: ['network-current'],
    queryFn: async () => {
      const response = await networkApi.getCurrent();
      return response.data;
    },
    refetchInterval: autoRefresh ? 10000 : false,
    staleTime: 5000,
    retry: 1, // Fewer retries since failures indicate network issues
  });

  // Fetch history for selected period
  const {
    data: historyData,
    isLoading: historyLoading,
  } = useQuery({
    queryKey: ['network-history', selectedPeriod],
    queryFn: async () => {
      const response = await networkApi.getHistory(selectedPeriod);
      return response.data;
    },
    refetchInterval: autoRefresh ? 60000 : false,
    staleTime: 30000,
  });

  // Fetch stats for selected period
  const {
    data: statsData,
    isLoading: statsLoading,
  } = useQuery({
    queryKey: ['network-stats', selectedPeriod],
    queryFn: async () => {
      const response = await networkApi.getStats(selectedPeriod);
      return response.data;
    },
    refetchInterval: autoRefresh ? 60000 : false,
    staleTime: 30000,
  });

  const handleRefreshCurrent = useCallback(() => {
    refetchCurrent();
  }, [refetchCurrent]);

  return (
    <div className="max-w-6xl mx-auto animate-fade-in pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Network Status
        </h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={alertsEnabled}
              onChange={(e) => setAlertsEnabled(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-600 text-accent-500 focus:ring-accent-500"
            />
            Connection alerts
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

      {/* Current Status (Priority at top) */}
      <CurrentStatus
        data={currentStatus}
        isLoading={currentLoading}
        isFetching={currentFetching}
        onRefresh={handleRefreshCurrent}
      />

      {/* Period Selector */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-slate-500 dark:text-slate-400">History:</span>
        <div className="flex gap-1">
          {PERIODS.map((period) => (
            <button
              key={period.key}
              onClick={() => setSelectedPeriod(period.key)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                selectedPeriod === period.key
                  ? 'bg-accent-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Summary */}
      {!statsLoading && statsData && (
        <StatsSummary stats={statsData} />
      )}

      {/* Historical Charts */}
      <div className="grid md:grid-cols-1 gap-6 mb-6">
        {/* Latency Chart */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ClockIcon className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Latency History
              </h2>
            </div>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Target: 8.8.4.4 (Google DNS)
            </span>
          </div>
          {historyLoading ? (
            <div className="h-64 flex items-center justify-center">
              <ArrowPathIcon className="w-6 h-6 animate-spin text-accent-500" />
            </div>
          ) : (
            <HistoryChart
              data={historyData?.samples}
              stats={statsData}
              period={selectedPeriod}
              metric="latency"
            />
          )}
        </div>

        {/* Packet Loss Chart */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <SignalIcon className="w-5 h-5 text-red-500" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Packet Loss History
              </h2>
            </div>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {historyData?.sampleCount || 0} samples
            </span>
          </div>
          {historyLoading ? (
            <div className="h-64 flex items-center justify-center">
              <ArrowPathIcon className="w-6 h-6 animate-spin text-accent-500" />
            </div>
          ) : (
            <HistoryChart
              data={historyData?.samples}
              stats={statsData}
              period={selectedPeriod}
              metric="packetLoss"
            />
          )}
        </div>

        {/* Wi-Fi Signal Chart */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <WifiIcon className="w-5 h-5 text-green-500" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Wi-Fi Signal Strength
              </h2>
            </div>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Higher is better (closer to 0 dBm)
            </span>
          </div>
          {historyLoading ? (
            <div className="h-64 flex items-center justify-center">
              <ArrowPathIcon className="w-6 h-6 animate-spin text-accent-500" />
            </div>
          ) : (
            <HistoryChart
              data={historyData?.samples}
              stats={statsData}
              period={selectedPeriod}
              metric="wifi"
            />
          )}
        </div>
      </div>

      {/* Sleep Periods Detail */}
      {statsData?.gaps?.length > 0 && (
        <div className="card p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <MoonIcon className="w-5 h-5 text-indigo-500" />
            <h3 className="font-medium text-slate-900 dark:text-white">Sleep Periods</h3>
            <span className="text-xs text-slate-400">({statsData.gaps.length} detected)</span>
          </div>
          <div className="space-y-2">
            {statsData.gaps.slice(0, 5).map((gap, i) => {
              const startDate = new Date(gap.start);
              const endDate = new Date(gap.end);
              return (
                <div key={i} className="flex items-center justify-between text-sm bg-indigo-50 dark:bg-indigo-900/20 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-indigo-600 dark:text-indigo-400">💤</span>
                    <span className="text-slate-600 dark:text-slate-400">
                      {startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      {' → '}
                      {endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                    {formatGapDuration(gap.duration)}
                  </span>
                </div>
              );
            })}
            {statsData.gaps.length > 5 && (
              <p className="text-xs text-slate-400 text-center">
                +{statsData.gaps.length - 5} more sleep periods
              </p>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Sleep periods are detected when no network samples are recorded for 30+ seconds (laptop sleeping/lid closed).
            Connection alerts are automatically suppressed during these periods.
          </p>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-purple-500/20 border border-purple-500" />
          <span>VPN Connected</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-indigo-500/20 border border-indigo-500" />
          <span>💤 Sleep (laptop off/asleep)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-0.5 bg-yellow-500" style={{ borderTop: '2px dashed' }} />
          <span>Warning threshold</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-0.5 bg-red-500" style={{ borderTop: '2px dashed' }} />
          <span>Critical threshold</span>
        </div>
      </div>

      {/* Info footer */}
      <div className="text-center text-xs text-slate-400 dark:text-slate-500 mt-6">
        Samples collected every 10 seconds. History retained for 7 days.
      </div>
    </div>
  );
}

export default Network;
