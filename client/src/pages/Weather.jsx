import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SunIcon, MoonIcon, LightBulbIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { weatherApi } from '../services/api';
import { SkeletonCard } from '../components/ui/Skeleton';
import MoonPhase from '../components/features/weather/MoonPhase';
import WindCompass from '../components/features/weather/WindCompass';
import CloudCover from '../components/features/weather/CloudCover';
import Precipitation from '../components/features/weather/Precipitation';
import WeatherRadar from '../components/features/weather/WeatherRadar';
import LocationSelector, { getStoredLocation } from '../components/features/weather/LocationSelector';
import { WeatherIcon } from '../components/features/weather/WeatherIcons';
import { useSyncedScroll } from '../hooks/useSyncedScroll';
import dayjs from 'dayjs';

function Weather() {
  // Location state - initialized from localStorage
  const [location, setLocation] = useState(getStoredLocation);

  // Synchronized scroll for hourly widgets (must be called unconditionally)
  const { scrollRef: hourlyScrollRef, onScroll: onHourlyScroll } = useSyncedScroll('hourly-weather');

  // Fetch weather data - refetch every 10 minutes while page is open
  const { data: weather, isLoading: weatherLoading, error: weatherError } = useQuery({
    queryKey: ['weather', location.lat, location.lng],
    queryFn: async () => {
      const response = await weatherApi.getWeather({
        lat: location.lat,
        lng: location.lng,
        name: location.name
      });
      return response.data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - data considered fresh for this duration
    gcTime: 15 * 60 * 1000, // Keep in cache for 15 minutes
    refetchInterval: 10 * 60 * 1000, // Refetch every 10 minutes
    refetchIntervalInBackground: false, // Only refetch when tab is focused
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    refetchOnMount: false, // Don't refetch if data is fresh
    refetchOnReconnect: false, // Don't refetch on reconnect if data is fresh
  });

  // Fetch sun times - refetch every hour (changes slowly)
  const { data: sunTimes, isLoading: sunLoading } = useQuery({
    queryKey: ['sunTimes', location.lat, location.lng],
    queryFn: async () => {
      const response = await weatherApi.getSunTimes({
        lat: location.lat,
        lng: location.lng
      });
      return response.data;
    },
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 2 * 60 * 60 * 1000, // Keep in cache for 2 hours
    refetchInterval: 60 * 60 * 1000, // Refetch every hour
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Fetch moon phase - refetch every hour (changes slowly)
  const { data: moonData, isLoading: moonLoading } = useQuery({
    queryKey: ['moonPhase', location.lat, location.lng],
    queryFn: async () => {
      const response = await weatherApi.getMoonPhase({
        lat: location.lat,
        lng: location.lng
      });
      return response.data;
    },
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 2 * 60 * 60 * 1000, // Keep in cache for 2 hours
    refetchInterval: 60 * 60 * 1000, // Refetch every hour
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Fetch radar data - refetch every 10 minutes (same as weather)
  const { data: radarData, isLoading: radarLoading } = useQuery({
    queryKey: ['weatherRadar'],
    queryFn: async () => {
      const response = await weatherApi.getRadar();
      return response.data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 15 * 60 * 1000, // Keep in cache for 15 minutes
    refetchInterval: 10 * 60 * 1000, // Refetch every 10 minutes
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const isLoading = weatherLoading || sunLoading;

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto animate-fade-in">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
          Weather
        </h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (weatherError) {
    return (
      <div className="max-w-4xl mx-auto animate-fade-in">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
          Weather
        </h1>
        <div className="card p-6 text-center">
          <p className="text-red-500">Failed to load weather data</p>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            {weatherError.message}
          </p>
        </div>
      </div>
    );
  }

  const current = weather?.current || {};
  const hourly = weather?.hourly || [];
  const forecast = weather?.forecast || [];

  // Helper to check if a given time is night
  const isNightTime = (time) => {
    const checkTime = dayjs(time);

    // Use actual sunrise/sunset times if available
    if (sunTimes?.sunrise && sunTimes?.sunset) {
      const sunrise = dayjs(sunTimes.sunrise);
      const sunset = dayjs(sunTimes.sunset);
      // Compare just the time portion for the given day
      const checkHourMin = checkTime.hour() * 60 + checkTime.minute();
      const sunriseHourMin = sunrise.hour() * 60 + sunrise.minute();
      const sunsetHourMin = sunset.hour() * 60 + sunset.minute();
      return checkHourMin < sunriseHourMin || checkHourMin >= sunsetHourMin;
    }

    // Fallback: before 7am or after 8pm
    const hour = checkTime.hour();
    return hour < 7 || hour >= 20;
  };

  // Helper to get temperature color based on temperature range
  const getTemperatureColor = (temp) => {
    if (temp === null || temp === undefined || temp === '--') return 'text-slate-900 dark:text-white';
    if (temp < 2) return 'text-blue-500';
    if (temp < 10) return 'text-white';
    if (temp < 20) return 'text-yellow-400';
    if (temp < 25) return 'text-orange-500';
    return 'text-red-500';
  };

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Weather
        </h1>
        <LocationSelector location={location} onLocationChange={setLocation} />
      </div>

      {/* Data Sources Info */}
      {weather?.sources?.current && (
        <div className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Sources: {weather.sources.current.join(', ')}
          {weather.location?.inIreland === false && (
            <span className="ml-2 text-amber-500">(Met Eireann unavailable outside Ireland)</span>
          )}
        </div>
      )}

      {/* Current Weather & Wind */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Current Weather */}
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">
                Current Weather
              </p>
              <p className={`text-5xl font-bold mb-1 ${getTemperatureColor(current.temperature)}`}>
                {current.temperature ?? '--'}°C
              </p>
              {current.feelsLike !== undefined && Math.round(current.feelsLike) !== current.temperature && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                  Feels like {Math.round(current.feelsLike)}°C
                </p>
              )}
              <p className="text-lg text-slate-600 dark:text-slate-300">
                {current.condition || 'Unknown'}
              </p>
              {/* Show observed vs forecast when they differ */}
              {current.observedCondition && current.forecastCondition &&
               current.observedCondition !== current.forecastCondition && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Stations: {current.observedCondition} • Forecast: {current.forecastCondition}
                </p>
              )}
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">
                Humidity: {current.humidity || '--'}%
              </p>
            </div>
            <div>
              <WeatherIcon
                condition={current.icon}
                isNight={isNightTime(new Date().toISOString())}
                size={80}
              />
            </div>
          </div>
        </div>

        {/* Wind */}
        <div className="card p-6">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Wind
          </p>
          <WindCompass
            windSpeed={current.windSpeed || 0}
            windDirection={current.windDirection || 0}
            windGusts={current.windGusts || 0}
            windDirectionCardinal={current.windDirectionCardinal || 'N'}
          />
        </div>
      </div>

      {/* Sun Times & Moon Phase */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Sun Times */}
        {sunTimes && (
          <div className="card p-6">
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-4">
              Sun Times
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {/* Sunrise column */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                    <SunIcon className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Sunrise</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-white">
                      {sunTimes.sunrise ? dayjs(sunTimes.sunrise).format('HH:mm') : '--:--'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center flex-shrink-0">
                    <LightBulbIcon className="w-5 h-5 text-yellow-500" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Usable Light</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-white">
                      {sunTimes.civilTwilightEnd ? dayjs(sunTimes.civilTwilightEnd).format('HH:mm') : '--:--'}
                    </p>
                  </div>
                </div>
              </div>
              {/* Sunset column */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                    <MoonIcon className="w-5 h-5 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Sunset</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-white">
                      {sunTimes.sunset ? dayjs(sunTimes.sunset).format('HH:mm') : '--:--'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                    <SparklesIcon className="w-5 h-5 text-indigo-500" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Astro Night</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-white">
                      {sunTimes.astronomicalTwilightEnd && sunTimes.tomorrowAstronomicalTwilightBegin
                        ? `${dayjs(sunTimes.astronomicalTwilightEnd).format('HH:mm')} - ${dayjs(sunTimes.tomorrowAstronomicalTwilightBegin).format('HH:mm')}`
                        : '--:--'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Moon Phase */}
        <MoonPhase moonData={moonData} isLoading={moonLoading} />
      </div>

      {/* Weather Radar */}
      <WeatherRadar radarData={radarData} isLoading={radarLoading} location={location} />

      {/* Hourly Forecast */}
      {hourly.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Hourly Forecast
          </h2>
          <div
            ref={hourlyScrollRef}
            onScroll={onHourlyScroll}
            className="card p-4 overflow-x-auto"
          >
            <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
              {hourly.map((hour, index) => (
                <div
                  key={hour.time || index}
                  className={`flex flex-col items-center min-w-[60px] ${
                    index === 0 ? 'font-semibold' : ''
                  }`}
                >
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                    {index === 0 ? 'Now' : dayjs(hour.time).format('HH:mm')}
                  </p>
                  <div className="mb-1 flex justify-center">
                    <WeatherIcon
                      condition={hour.icon}
                      isNight={isNightTime(hour.time)}
                      size={36}
                    />
                  </div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white mb-2">
                    {hour.temperature}°
                  </p>
                  {/* Wind info */}
                  <div className="flex flex-col items-center gap-1 pt-2 border-t border-slate-200 dark:border-slate-700">
                    <div
                      className="w-5 h-5 text-slate-500 dark:text-slate-400"
                      title={`Wind from ${hour.windDirectionCardinal || 'N'}`}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        style={{
                          transform: `rotate(${(hour.windDirection || 0) + 180}deg)`,
                          transition: 'transform 0.3s ease'
                        }}
                      >
                        <path d="M12 2L4 20h4l4-8 4 8h4L12 2z" />
                      </svg>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {Math.round(hour.windSpeed || 0)} km/h
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">
                      {hour.windDirectionCardinal || 'N'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Cloud Cover */}
      {hourly.length > 0 && (
        <CloudCover hourlyData={hourly} sunTimes={sunTimes} />
      )}

      {/* Precipitation */}
      {hourly.length > 0 && (
        <Precipitation hourlyData={hourly} />
      )}

      {/* 7-Day Forecast */}
      {forecast.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            7-Day Forecast
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
            {forecast.map((day, index) => (
              <div
                key={day.date || index}
                className={`card p-3 text-center ${
                  index === 0 ? 'ring-2 ring-accent-500' : ''
                }`}
              >
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                  {index === 0 ? 'Today' : dayjs(day.date).format('ddd')}
                </p>
                <div className="mb-1 flex justify-center">
                  <WeatherIcon
                    condition={day.icon}
                    isNight={false}
                    size={40}
                  />
                </div>
                <p className="text-lg font-semibold text-slate-900 dark:text-white">
                  {day.high || day.temperature}°
                </p>
                {day.low !== undefined && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {day.low}°
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default Weather;
