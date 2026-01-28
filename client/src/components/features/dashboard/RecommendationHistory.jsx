import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

function RecommendationHistory({ data, isLoading }) {
  if (isLoading) {
    return (
      <div className="card p-6">
        <div className="animate-pulse">
          <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mb-4"></div>
          <div className="h-48 bg-slate-200 dark:bg-slate-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (!data?.dates || !data?.scores) {
    return (
      <div className="card p-6">
        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-4">
          Sell Recommendation History
        </h3>
        <div className="h-48 flex items-center justify-center text-slate-400">
          No historical data available
        </div>
      </div>
    );
  }

  // Transform data for recharts
  const chartData = data.dates.map((date, i) => ({
    date,
    score: data.scores[i],
  }));

  // Determine color based on latest score
  const latestScore = chartData[chartData.length - 1]?.score || 50;
  let lineColor = '#22c55e'; // green
  if (latestScore < 50) lineColor = '#ef4444'; // red
  else if (latestScore < 65) lineColor = '#f59e0b'; // amber

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const score = payload[0].value;
      let recommendation = 'FAIR';
      if (score >= 80) recommendation = 'EXCELLENT';
      else if (score >= 65) recommendation = 'GOOD';
      else if (score >= 50) recommendation = 'FAIR';
      else if (score >= 35) recommendation = 'POOR';
      else recommendation = 'VERY POOR';

      return (
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
          <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            {score}% - {recommendation}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="card p-6">
      <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-4">
        Sell Recommendation History (12 months)
      </h3>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, 100]}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              ticks={[0, 25, 50, 75, 100]}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={50} stroke="#94a3b8" strokeDasharray="3 3" />
            <ReferenceLine y={65} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.5} />
            <Line
              type="monotone"
              dataKey="score"
              stroke={lineColor}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: lineColor }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-between text-xs text-slate-400 mt-2">
        <span>Poor &lt;35%</span>
        <span>Fair 50%</span>
        <span>Good &gt;65%</span>
      </div>
    </div>
  );
}

export default RecommendationHistory;
