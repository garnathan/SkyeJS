import dayjs from 'dayjs';
import { useSyncedScroll } from '../../../hooks/useSyncedScroll';

function CloudCover({ hourlyData, sunTimes }) {
  const { scrollRef, onScroll } = useSyncedScroll('hourly-weather');
  if (!hourlyData || hourlyData.length === 0) {
    return null;
  }

  // Check if a given time is night
  const isNightTime = (time) => {
    const checkTime = dayjs(time);

    if (sunTimes?.sunrise && sunTimes?.sunset) {
      const sunrise = dayjs(sunTimes.sunrise);
      const sunset = dayjs(sunTimes.sunset);
      const checkHourMin = checkTime.hour() * 60 + checkTime.minute();
      const sunriseHourMin = sunrise.hour() * 60 + sunrise.minute();
      const sunsetHourMin = sunset.hour() * 60 + sunset.minute();
      return checkHourMin < sunriseHourMin || checkHourMin >= sunsetHourMin;
    }

    // Fallback: before 7am or after 8pm
    const hour = checkTime.hour();
    return hour < 7 || hour >= 20;
  };

  // Get bar color based on cloud coverage
  const getBarColor = (cover, isNight) => {
    if (cover <= 10) return isNight ? 'bg-indigo-400' : 'bg-amber-400';
    if (cover <= 25) return isNight ? 'bg-indigo-300' : 'bg-amber-300';
    if (cover <= 50) return 'bg-slate-300 dark:bg-slate-500';
    if (cover <= 75) return 'bg-slate-400 dark:bg-slate-400';
    return 'bg-slate-500 dark:bg-slate-300';
  };

  // Get cloud emoji based on coverage and time of day
  const getCloudEmoji = (cover, time) => {
    const isNight = isNightTime(time);

    if (cover <= 10) return isNight ? '🌙' : '☀️';
    if (cover <= 25) return isNight ? '🌙' : '🌤️';
    if (cover <= 50) return '⛅';
    if (cover <= 75) return '🌥️';
    return '☁️';
  };

  const barHeight = 120;

  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
        Cloud Cover
      </h2>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="card p-4 overflow-x-auto"
      >
        <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
          {hourlyData.map((hour, index) => {
            const isNight = isNightTime(hour.time);
            const fillHeight = (hour.cloudCover / 100) * barHeight;

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
                    className={`absolute bottom-0 left-0 right-0 rounded-b-md transition-all ${getBarColor(hour.cloudCover, isNight)}`}
                    style={{ height: fillHeight }}
                  />

                  {/* Percentage overlay */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span
                      className="text-xs font-bold text-white"
                      style={{
                        textShadow: '0 0 4px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.9), 1px 1px 2px rgba(0,0,0,0.7)'
                      }}
                    >
                      {hour.cloudCover}%
                    </span>
                  </div>
                </div>

                {/* Emoji below bar */}
                <p className="text-base mt-2">
                  {getCloudEmoji(hour.cloudCover, hour.time)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default CloudCover;
