import dayjs from 'dayjs';
import { useSyncedScroll } from '../../../hooks/useSyncedScroll';

// Rain intensity thresholds (mm/h) - meteorological standards
// 0 mm/h: No rain
// 0.1-2.5 mm/h: Light rain
// 2.5-7.5 mm/h: Moderate rain
// 7.5+ mm/h: Heavy rain

function Precipitation({ hourlyData }) {
  const { scrollRef, onScroll } = useSyncedScroll('hourly-weather');

  if (!hourlyData || hourlyData.length === 0) {
    return null;
  }

  // Get rain intensity label
  const getRainIntensity = (precip) => {
    if (precip === 0 || precip === null || precip === undefined) return { label: 'None', level: 0 };
    if (precip < 0.1) return { label: 'Trace', level: 0.5 };
    if (precip < 2.5) return { label: 'Light', level: 1 };
    if (precip < 7.5) return { label: 'Moderate', level: 2 };
    return { label: 'Heavy', level: 3 };
  };

  // Get bar color based on precipitation amount - darker greys for heavier rain
  const getBarColor = (precip) => {
    if (precip === 0 || precip === null || precip === undefined) return 'bg-slate-200 dark:bg-slate-600';
    if (precip < 0.1) return 'bg-slate-300 dark:bg-slate-500';
    if (precip < 2.5) return 'bg-blue-300 dark:bg-blue-500';
    if (precip < 7.5) return 'bg-blue-500 dark:bg-blue-400';
    return 'bg-blue-700 dark:bg-blue-300';
  };

  // Get emoji based on precipitation level
  const getRainEmoji = (precip, probability) => {
    if (precip === 0 || precip === null || precip === undefined) {
      // No current rain, but check probability
      if (probability && probability > 50) return '🌦️';
      return '✓';
    }
    if (precip < 0.1) return '💧';
    if (precip < 2.5) return '🌧️';
    if (precip < 7.5) return '🌧️';
    return '⛈️';
  };

  const barHeight = 120;
  // Find max precipitation for scaling (minimum 5mm to show light rain properly)
  const maxPrecip = Math.max(5, ...hourlyData.map(h => h.precipitation || 0));

  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
        Precipitation
      </h2>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="card p-4 overflow-x-auto"
      >
        <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
          {hourlyData.map((hour, index) => {
            const precip = hour.precipitation || 0;
            const probability = hour.precipitationProbability;
            const intensity = getRainIntensity(precip);
            // Scale fill height relative to max precipitation
            const fillHeight = (precip / maxPrecip) * barHeight;

            return (
              <div
                key={hour.time || index}
                className={`flex flex-col items-center min-w-[60px] ${
                  index === 0 ? 'font-semibold' : ''
                }`}
              >
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  {index === 0 ? 'Now' : dayjs(hour.time).format('HH:mm')}
                </p>

                {/* Bar chart container */}
                <div
                  className="relative w-8 rounded-md bg-slate-100 dark:bg-slate-700 overflow-hidden"
                  style={{ height: barHeight }}
                >
                  {/* Filled portion */}
                  <div
                    className={`absolute bottom-0 left-0 right-0 rounded-b-md transition-all ${getBarColor(precip)}`}
                    style={{ height: fillHeight }}
                  />

                  {/* Amount overlay */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span
                      className="text-xs font-bold text-white"
                      style={{
                        textShadow: '0 0 4px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.9), 1px 1px 2px rgba(0,0,0,0.7)'
                      }}
                    >
                      {precip > 0 ? `${precip.toFixed(1)}` : '0'}
                    </span>
                  </div>
                </div>

                {/* Intensity label */}
                <p className={`text-[10px] mt-1 ${
                  intensity.level === 0 ? 'text-slate-400 dark:text-slate-500' :
                  intensity.level === 1 ? 'text-blue-400 dark:text-blue-400' :
                  intensity.level === 2 ? 'text-blue-500 dark:text-blue-300' :
                  'text-blue-700 dark:text-blue-200 font-semibold'
                }`}>
                  {intensity.label}
                </p>

                {/* Probability */}
                {probability !== null && probability !== undefined && (
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">
                    {probability}%
                  </p>
                )}

                {/* Emoji below */}
                <p className="text-base mt-1">
                  {getRainEmoji(precip, probability)}
                </p>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-slate-200 dark:bg-slate-600" />
            <span>None (0 mm/h)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-blue-300 dark:bg-blue-500" />
            <span>Light (&lt;2.5 mm/h)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-blue-500 dark:bg-blue-400" />
            <span>Moderate (2.5-7.5 mm/h)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-blue-700 dark:bg-blue-300" />
            <span>Heavy (&gt;7.5 mm/h)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Precipitation;
