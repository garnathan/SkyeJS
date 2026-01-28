import { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import dayjs from 'dayjs';

function StockChart({ data, title, subtitle, color = '#f59e0b', currency = '$', dataKey = 'price', isLoading = false, referenceLine = null }) {
  const chartData = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    return data.map((item) => ({
      date: item.date || item.timestamp,
      price: item.close || item.price || item.value,
      value: item.value,
    }));
  }, [data]);

  const valueKey = dataKey === 'value' ? 'value' : 'price';

  const minMax = useMemo(() => {
    if (chartData.length === 0) return { min: 0, max: 100 };
    const values = chartData.map((d) => d[valueKey]).filter(Boolean);
    if (values.length === 0) return { min: 0, max: 100 };
    let min = Math.min(...values);
    let max = Math.max(...values);
    // Include reference line value in min/max calculation
    if (referenceLine?.value) {
      min = Math.min(min, referenceLine.value);
      max = Math.max(max, referenceLine.value);
    }
    const padding = (max - min) * 0.1;
    return { min: min - padding, max: max + padding };
  }, [chartData, valueKey, referenceLine]);

  if (isLoading) {
    return (
      <div className="card p-4">
        <div className="animate-pulse">
          <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-4"></div>
          <div className="h-48 bg-slate-200 dark:bg-slate-700 rounded"></div>
        </div>
      </div>
    );
  }

  const formatValue = (value) => {
    if (value >= 1000) {
      return `${currency}${(value / 1000).toFixed(1)}k`;
    }
    return `${currency}${value.toFixed(currency ? 2 : 4)}`;
  };

  return (
    <div className="card p-4">
      {title && (
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          )}
        </div>
      )}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
            <defs>
              <linearGradient id={`gradient-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-700" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => {
                const d = dayjs(value);
                return d.isValid() ? d.format('MMM') : value?.slice?.(0, 3) || '';
              }}
              stroke="#94a3b8"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[minMax.min, minMax.max]}
              tickFormatter={(value) => formatValue(value)}
              stroke="#94a3b8"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={50}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const dateStr = payload[0].payload.date;
                  const d = dayjs(dateStr);
                  const formattedDate = d.isValid() ? d.format('MMM D, YYYY') : dateStr;
                  return (
                    <div className="bg-white dark:bg-slate-800 p-2 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formattedDate}
                      </p>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {currency}{payload[0].value?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="monotone"
              dataKey={valueKey}
              stroke={color}
              strokeWidth={2}
              fill={`url(#gradient-${color.replace('#', '')})`}
            />
            {referenceLine && (
              <ReferenceLine
                y={referenceLine.value}
                stroke={referenceLine.color || '#ff0000'}
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{
                  value: referenceLine.label,
                  position: 'right',
                  fill: referenceLine.color || '#ff0000',
                  fontSize: 10,
                }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default StockChart;
