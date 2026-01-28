import { Router } from 'express';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { cache } from '../services/cache.js';
import { canMakeApiCall, recordApiCall, getApiUsageStats } from '../services/apiRateLimiter.js';

const router = Router();

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Convert wind direction degrees to cardinal direction
const getWindDirection = (degrees) => {
  if (degrees === undefined || degrees === null) return { direction: 'N', label: 'North' };
  const directions = [
    { direction: 'N', label: 'North' },
    { direction: 'NNE', label: 'North-Northeast' },
    { direction: 'NE', label: 'Northeast' },
    { direction: 'ENE', label: 'East-Northeast' },
    { direction: 'E', label: 'East' },
    { direction: 'ESE', label: 'East-Southeast' },
    { direction: 'SE', label: 'Southeast' },
    { direction: 'SSE', label: 'South-Southeast' },
    { direction: 'S', label: 'South' },
    { direction: 'SSW', label: 'South-Southwest' },
    { direction: 'SW', label: 'Southwest' },
    { direction: 'WSW', label: 'West-Southwest' },
    { direction: 'W', label: 'West' },
    { direction: 'WNW', label: 'West-Northwest' },
    { direction: 'NW', label: 'Northwest' },
    { direction: 'NNW', label: 'North-Northwest' }
  ];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
};

// Calculate feels like temperature (wind chill / heat index)
const calculateFeelsLike = (tempC, windSpeedKmh, humidity) => {
  if (tempC <= 10 && windSpeedKmh > 4.8) {
    const windChill = 13.12 + 0.6215 * tempC - 11.37 * Math.pow(windSpeedKmh, 0.16) + 0.3965 * tempC * Math.pow(windSpeedKmh, 0.16);
    return Math.round(windChill);
  }
  if (tempC >= 27 && humidity >= 40) {
    const heatIndex = -8.78469475556 + 1.61139411 * tempC + 2.33854883889 * humidity
      - 0.14611605 * tempC * humidity - 0.012308094 * tempC * tempC
      - 0.0164248277778 * humidity * humidity + 0.002211732 * tempC * tempC * humidity
      + 0.00072546 * tempC * humidity * humidity - 0.000003582 * tempC * tempC * humidity * humidity;
    return Math.round(heatIndex);
  }
  return Math.round(tempC);
};

// ============================================================================
// AVERAGING FUNCTIONS - Core logic for combining multiple data sources
// ============================================================================

// Average multiple numeric values, handling undefined/null
const avgNumMultiple = (...values) => {
  const valid = values.filter(v => typeof v === 'number' && !isNaN(v));
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((sum, v) => sum + v, 0) / valid.length);
};

// Average multiple numeric values with one decimal precision
const avgNumDecimalMultiple = (...values) => {
  const valid = values.filter(v => typeof v === 'number' && !isNaN(v));
  if (valid.length === 0) return null;
  const avg = valid.reduce((sum, v) => sum + v, 0) / valid.length;
  return Math.round(avg * 10) / 10;
};

// Average multiple wind directions (handles circular averaging for degrees)
const avgWindDirectionMultiple = (...values) => {
  const valid = values.filter(v => typeof v === 'number' && !isNaN(v));
  if (valid.length === 0) return 0;
  if (valid.length === 1) return Math.round(valid[0]);

  // Convert to radians and use vector averaging for circular data
  let sinSum = 0;
  let cosSum = 0;
  for (const deg of valid) {
    const rad = deg * Math.PI / 180;
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
  }
  let avgDeg = Math.atan2(sinSum / valid.length, cosSum / valid.length) * 180 / Math.PI;
  if (avgDeg < 0) avgDeg += 360;
  return Math.round(avgDeg);
};

// Pick the most appropriate weather condition from multiple sources
// Prioritizes more severe/specific conditions over generic ones
const pickConditionMultiple = (...conditions) => {
  const valid = conditions.filter(c => c && c.condition);
  if (valid.length === 0) return { condition: 'Unknown', icon: 'cloudy' };
  if (valid.length === 1) return valid[0];

  // Severity ranking (higher = more severe/specific, should be preferred)
  const severityRank = {
    'Thunderstorm': 10, 'Thunder': 10, 'Stormy': 10,
    'Heavy Rain': 9, 'Very Heavy Rain': 9, 'Heavy Showers': 9,
    'Snow': 8, 'Snow Showers': 8, 'Snow Thunder': 8,
    'Sleet': 7, 'Sleet Showers': 7, 'Sleet Thunder': 7,
    'Rain': 6, 'Rainy': 6, 'Rain Showers': 6,
    'Light Rain': 5, 'Light Rain Showers': 5, 'Drizzle': 5, 'Light Drizzle': 5,
    'Fog': 4, 'Foggy': 4, 'Mist': 4, 'Haze': 4,
    'Cloudy': 3, 'Mostly Cloudy': 3, 'Overcast': 3,
    'Partly Cloudy': 2, 'Partly cloudy': 2, 'Scattered Clouds': 2, 'Broken Clouds': 2,
    'Few Clouds': 1, 'Fair': 1, 'Clear': 1,
    'Unknown': 0
  };

  // Sort by severity and pick highest, but prefer Met Éireann if tied
  const ranked = valid.map((c, i) => ({
    condition: c,
    rank: severityRank[c.condition] ?? 0,
    sourceIndex: i // Lower index = higher priority source (Met Éireann first)
  }));

  ranked.sort((a, b) => {
    const rankDiff = b.rank - a.rank;
    if (Math.abs(rankDiff) > 1) return rankDiff; // Significant difference, use higher rank
    return a.sourceIndex - b.sourceIndex; // Similar rank, prefer earlier source
  });

  return ranked[0].condition;
};

// ============================================================================
// DATA SOURCE: MET ÉIREANN
// ============================================================================

// Map Met Éireann weather symbols to our icons
const getConditionFromSymbol = (symbol) => {
  if (!symbol) return null;
  const code = String(symbol).replace(/[dn]$/, '');

  const symbolMap = {
    '1': { condition: 'Clear', icon: 'sunny' },
    '2': { condition: 'Fair', icon: 'sunny' },
    '3': { condition: 'Partly Cloudy', icon: 'cloudy' },
    '4': { condition: 'Cloudy', icon: 'cloudy' },
    '5': { condition: 'Rain Showers', icon: 'rainy' },
    '6': { condition: 'Heavy Rain Showers', icon: 'rainy' },
    '7': { condition: 'Sleet Showers', icon: 'snowy' },
    '8': { condition: 'Snow Showers', icon: 'snowy' },
    '9': { condition: 'Light Rain', icon: 'rainy' },
    '10': { condition: 'Rain', icon: 'rainy' },
    '11': { condition: 'Thunderstorm', icon: 'rainy' },
    '12': { condition: 'Sleet', icon: 'snowy' },
    '13': { condition: 'Snow', icon: 'snowy' },
    '14': { condition: 'Thunder Showers', icon: 'rainy' },
    '15': { condition: 'Drizzle', icon: 'rainy' },
    '01': { condition: 'Clear', icon: 'sunny' },
    '02': { condition: 'Fair', icon: 'sunny' },
    '03': { condition: 'Partly Cloudy', icon: 'cloudy' },
    '04': { condition: 'Cloudy', icon: 'cloudy' },
    '09': { condition: 'Light Rain', icon: 'rainy' },
    '40': { condition: 'Light Rain Showers', icon: 'rainy' },
    '41': { condition: 'Rain Showers', icon: 'rainy' },
    '42': { condition: 'Heavy Showers', icon: 'rainy' },
    '43': { condition: 'Sleet Showers', icon: 'snowy' },
    '44': { condition: 'Snow Showers', icon: 'snowy' },
    '45': { condition: 'Hail Showers', icon: 'rainy' },
    '46': { condition: 'Thundery Showers', icon: 'rainy' },
    '50': { condition: 'Drizzle', icon: 'rainy' },
    '51': { condition: 'Light Drizzle', icon: 'rainy' },
    '60': { condition: 'Light Rain', icon: 'rainy' },
    '61': { condition: 'Rain', icon: 'rainy' },
    '63': { condition: 'Heavy Rain', icon: 'rainy' },
    '65': { condition: 'Very Heavy Rain', icon: 'rainy' },
    '80': { condition: 'Light Showers', icon: 'rainy' },
    '81': { condition: 'Showers', icon: 'rainy' },
    '82': { condition: 'Heavy Showers', icon: 'rainy' },
    'Sun': { condition: 'Clear', icon: 'sunny' },
    'LightCloud': { condition: 'Partly Cloudy', icon: 'cloudy' },
    'PartlyCloud': { condition: 'Partly Cloudy', icon: 'cloudy' },
    'Cloud': { condition: 'Cloudy', icon: 'cloudy' },
    'LightRainSun': { condition: 'Light Rain', icon: 'rainy' },
    'LightRainThunderSun': { condition: 'Light Rain', icon: 'rainy' },
    'SleetSun': { condition: 'Sleet', icon: 'snowy' },
    'SnowSun': { condition: 'Snow Showers', icon: 'snowy' },
    'LightRain': { condition: 'Light Rain', icon: 'rainy' },
    'Rain': { condition: 'Rain', icon: 'rainy' },
    'RainThunder': { condition: 'Thunder', icon: 'rainy' },
    'Sleet': { condition: 'Sleet', icon: 'snowy' },
    'Snow': { condition: 'Snow', icon: 'snowy' },
    'SnowThunder': { condition: 'Snow Thunder', icon: 'snowy' },
    'Fog': { condition: 'Fog', icon: 'cloudy' },
    'SleetSunThunder': { condition: 'Sleet', icon: 'snowy' },
    'SnowSunThunder': { condition: 'Snow', icon: 'snowy' },
    'LightRainThunder': { condition: 'Thunder Rain', icon: 'rainy' },
    'SleetThunder': { condition: 'Sleet Thunder', icon: 'snowy' },
    'DrizzleSun': { condition: 'Drizzle', icon: 'rainy' },
    'DrizzleThunderSun': { condition: 'Drizzle Thunder', icon: 'rainy' },
    'DrizzleThunder': { condition: 'Drizzle Thunder', icon: 'rainy' },
    'Drizzle': { condition: 'Drizzle', icon: 'rainy' },
  };

  return symbolMap[code] || null;
};

// Fetch current observations from Met Éireann
const fetchMetEireannCurrent = async (location) => {
  try {
    const url = `https://prodapi.metweb.ie/observations/${location}/today`;
    const response = await axios.get(url, { timeout: 10000 });
    const observations = response.data;
    const latest = observations[observations.length - 1] || {};

    const condition = getConditionFromSymbol(latest.symbol);
    const temp = parseInt(latest.temperature, 10);
    const windSpeed = parseInt(latest.windSpeed, 10);
    const humidity = parseInt(latest.humidity, 10);
    const windDirection = parseInt(latest.windDirection, 10);

    return {
      source: 'Met Éireann',
      temperature: isNaN(temp) ? null : temp,
      humidity: isNaN(humidity) ? null : humidity,
      windSpeed: isNaN(windSpeed) ? null : windSpeed,
      windDirection: isNaN(windDirection) ? null : windDirection,
      windGusts: parseInt(latest.windGust, 10) || null,
      pressure: parseInt(latest.pressure, 10) || null,
      rainfall: parseFloat(latest.rainfall) || null,
      condition: condition?.condition || null,
      icon: condition?.icon || null,
      reportTime: latest.reportTime,
      stationName: latest.name
    };
  } catch (error) {
    logger.warn(`Met Éireann current observations error: ${error.message}`);
    return null;
  }
};

// Parse Met Éireann forecast XML
const parseMetEireannForecast = async (xmlData) => {
  const parsed = await parseStringPromise(xmlData, { explicitArray: false, mergeAttrs: true });
  const product = parsed?.weatherdata?.product;

  if (!product || !product.time) {
    return { hourly: [], forecast: [] };
  }

  const times = Array.isArray(product.time) ? product.time : [product.time];
  const hourlyMap = new Map();
  const dailyMap = new Map();

  for (const timeEntry of times) {
    const from = timeEntry.from;
    const to = timeEntry.to;
    const location = timeEntry.location;

    if (!location) continue;

    if (from === to) {
      const hour = from.substring(0, 13);

      if (!hourlyMap.has(hour)) {
        hourlyMap.set(hour, { time: from });
      }

      const entry = hourlyMap.get(hour);

      if (location.temperature) {
        entry.temperature = parseFloat(location.temperature.value);
      }
      if (location.windSpeed) {
        entry.windSpeed = parseFloat(location.windSpeed.mps) * 3.6;
      }
      if (location.windDirection) {
        entry.windDirection = parseFloat(location.windDirection.deg);
      }
      if (location.humidity) {
        entry.humidity = parseFloat(location.humidity.value);
      }
      if (location.pressure) {
        entry.pressure = parseFloat(location.pressure.value);
      }
      if (location.cloudiness) {
        entry.cloudCover = parseFloat(location.cloudiness.percent);
      }
    } else {
      const hour = from.substring(0, 13);
      const date = from.substring(0, 10);

      if (!hourlyMap.has(hour)) {
        hourlyMap.set(hour, { time: from });
      }

      const entry = hourlyMap.get(hour);

      if (location.symbol) {
        const symbolId = location.symbol.id || location.symbol.number;
        const condition = getConditionFromSymbol(symbolId);
        if (condition) {
          entry.condition = condition.condition;
          entry.icon = condition.icon;
        }
      }
      if (location.precipitation) {
        entry.precipitation = parseFloat(location.precipitation.value) || 0;
      }
      if (location.minTemperature) {
        if (!dailyMap.has(date)) {
          dailyMap.set(date, { date });
        }
        dailyMap.get(date).low = parseFloat(location.minTemperature.value);
      }
      if (location.maxTemperature) {
        if (!dailyMap.has(date)) {
          dailyMap.set(date, { date });
        }
        dailyMap.get(date).high = parseFloat(location.maxTemperature.value);
      }
    }
  }

  const now = new Date();
  const hourly = Array.from(hourlyMap.values())
    .filter(h => new Date(h.time) >= now && h.temperature !== undefined)
    .sort((a, b) => new Date(a.time) - new Date(b.time))
    .slice(0, 24);

  // Build daily from hourly if needed
  const dailyFromHourly = new Map();
  for (const h of hourlyMap.values()) {
    const date = h.time?.substring(0, 10);
    if (!date || h.temperature === undefined) continue;

    if (!dailyFromHourly.has(date)) {
      dailyFromHourly.set(date, { date, temps: [], icons: [], conditions: [] });
    }
    dailyFromHourly.get(date).temps.push(h.temperature);
    if (h.icon) dailyFromHourly.get(date).icons.push(h.icon);
    if (h.condition) dailyFromHourly.get(date).conditions.push(h.condition);
  }

  for (const [date, data] of dailyFromHourly) {
    if (!dailyMap.has(date)) {
      dailyMap.set(date, { date });
    }
    const daily = dailyMap.get(date);
    if (daily.high === undefined && data.temps.length > 0) {
      daily.high = Math.max(...data.temps);
    }
    if (daily.low === undefined && data.temps.length > 0) {
      daily.low = Math.min(...data.temps);
    }
    if (!daily.icon && data.icons.length > 0) {
      daily.icon = data.icons[Math.floor(data.icons.length / 2)];
      daily.condition = data.conditions[Math.floor(data.conditions.length / 2)];
    }
  }

  const forecast = Array.from(dailyMap.values())
    .filter(d => d.high !== undefined || d.low !== undefined)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 7);

  return { hourly, forecast };
};

// Fetch forecast from Met Éireann WDB API
const fetchMetEireannForecast = async (lat, lng) => {
  try {
    const url = `http://metwdb-openaccess.ichec.ie/metno-wdb2ts/locationforecast?lat=${lat};long=${lng}`;
    const response = await axios.get(url, {
      timeout: 15000,
      headers: { 'Accept': 'application/xml' }
    });

    const data = await parseMetEireannForecast(response.data);
    logger.info(`Met Éireann forecast: ${data.hourly.length} hourly, ${data.forecast.length} daily`);
    return { source: 'Met Éireann', ...data };
  } catch (error) {
    logger.warn(`Met Éireann forecast error: ${error.message}`);
    return { source: 'Met Éireann', hourly: [], forecast: [] };
  }
};

// ============================================================================
// DATA SOURCE: OPEN-METEO
// ============================================================================

// Map Open-Meteo weather codes to conditions
const getConditionFromCode = (code) => {
  if (code === undefined || code === null) return null;
  if (code === 0) return { condition: 'Clear', icon: 'sunny' };
  if (code <= 3) return { condition: 'Partly Cloudy', icon: 'cloudy' };
  if (code <= 49) return { condition: 'Foggy', icon: 'cloudy' };
  if (code <= 59) return { condition: 'Drizzle', icon: 'rainy' };
  if (code <= 69) return { condition: 'Rain', icon: 'rainy' };
  if (code <= 79) return { condition: 'Snow', icon: 'snowy' };
  if (code <= 84) return { condition: 'Rain Showers', icon: 'rainy' };
  if (code <= 86) return { condition: 'Snow Showers', icon: 'snowy' };
  if (code <= 99) return { condition: 'Thunderstorm', icon: 'rainy' };
  return null;
};

// Fetch all data from Open-Meteo in a single request
const fetchOpenMeteo = async (lat, lng) => {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,precipitation,cloud_cover,dew_point_2m` +
      `&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,precipitation_probability,precipitation,dew_point_2m,visibility,uv_index` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,uv_index_max` +
      `&timezone=Europe%2FDublin&forecast_days=7`;

    const response = await axios.get(url, { timeout: 10000 });
    const data = response.data;
    const current = data.current || {};
    const hourlyData = data.hourly || {};
    const daily = data.daily || {};

    // Parse current
    const currentCondition = getConditionFromCode(current.weather_code);
    const currentParsed = {
      source: 'Open-Meteo',
      temperature: current.temperature_2m,
      humidity: current.relative_humidity_2m,
      feelsLike: current.apparent_temperature,
      windSpeed: current.wind_speed_10m,
      windDirection: current.wind_direction_10m,
      windGusts: current.wind_gusts_10m,
      pressure: current.surface_pressure,
      precipitation: current.precipitation,
      cloudCover: current.cloud_cover,
      dewPoint: current.dew_point_2m,
      condition: currentCondition?.condition || null,
      icon: currentCondition?.icon || null
    };

    // Parse hourly
    const now = new Date();
    const hourly = (hourlyData.time || [])
      .map((time, i) => {
        const condition = getConditionFromCode(hourlyData.weather_code?.[i]);
        return {
          time,
          temperature: hourlyData.temperature_2m?.[i],
          humidity: hourlyData.relative_humidity_2m?.[i],
          feelsLike: hourlyData.apparent_temperature?.[i],
          windSpeed: hourlyData.wind_speed_10m?.[i],
          windDirection: hourlyData.wind_direction_10m?.[i],
          windGusts: hourlyData.wind_gusts_10m?.[i],
          cloudCover: hourlyData.cloud_cover?.[i],
          precipitationProbability: hourlyData.precipitation_probability?.[i],
          precipitation: hourlyData.precipitation?.[i],
          dewPoint: hourlyData.dew_point_2m?.[i],
          visibility: hourlyData.visibility?.[i],
          uvIndex: hourlyData.uv_index?.[i],
          condition: condition?.condition || null,
          icon: condition?.icon || null
        };
      })
      .filter(h => new Date(h.time) >= now)
      .slice(0, 24);

    // Parse daily
    const forecast = (daily.time || []).slice(0, 7).map((date, i) => {
      const condition = getConditionFromCode(daily.weather_code?.[i]);
      return {
        date,
        high: daily.temperature_2m_max?.[i],
        low: daily.temperature_2m_min?.[i],
        feelsLikeHigh: daily.apparent_temperature_max?.[i],
        feelsLikeLow: daily.apparent_temperature_min?.[i],
        precipitationSum: daily.precipitation_sum?.[i],
        precipitationProbability: daily.precipitation_probability_max?.[i],
        maxWindSpeed: daily.wind_speed_10m_max?.[i],
        maxWindGusts: daily.wind_gusts_10m_max?.[i],
        uvIndex: daily.uv_index_max?.[i],
        condition: condition?.condition || null,
        icon: condition?.icon || null
      };
    });

    logger.info(`Open-Meteo: current + ${hourly.length} hourly + ${forecast.length} daily`);
    return { source: 'Open-Meteo', current: currentParsed, hourly, forecast };
  } catch (error) {
    logger.warn(`Open-Meteo error: ${error.message}`);
    return { source: 'Open-Meteo', current: null, hourly: [], forecast: [] };
  }
};

// ============================================================================
// DATA SOURCE: OPENWEATHERMAP
// ============================================================================

// Map OpenWeatherMap condition codes to our icons
const getConditionFromOWM = (weather) => {
  if (!weather || !weather.main) return null;

  const id = weather.id;

  // Map based on condition ID ranges
  if (id >= 200 && id < 300) return { condition: 'Thunderstorm', icon: 'rainy' };
  if (id >= 300 && id < 400) return { condition: 'Drizzle', icon: 'rainy' };
  if (id >= 500 && id < 505) return { condition: 'Rain', icon: 'rainy' };
  if (id === 511) return { condition: 'Freezing Rain', icon: 'snowy' };
  if (id >= 520 && id < 600) return { condition: 'Rain Showers', icon: 'rainy' };
  if (id >= 600 && id < 700) return { condition: 'Snow', icon: 'snowy' };
  if (id >= 700 && id < 800) {
    if (id === 701 || id === 721) return { condition: 'Mist', icon: 'cloudy' };
    if (id === 741) return { condition: 'Fog', icon: 'cloudy' };
    return { condition: 'Haze', icon: 'cloudy' };
  }
  if (id === 800) return { condition: 'Clear', icon: 'sunny' };
  if (id === 801) return { condition: 'Few Clouds', icon: 'sunny' };
  if (id === 802) return { condition: 'Scattered Clouds', icon: 'cloudy' };
  if (id === 803) return { condition: 'Broken Clouds', icon: 'cloudy' };
  if (id === 804) return { condition: 'Overcast', icon: 'cloudy' };

  return { condition: weather.main, icon: 'cloudy' };
};

// Fetch data from OpenWeatherMap free APIs (2.5 current + forecast)
// Uses free tier APIs that don't require One Call subscription
const fetchOpenWeatherMap = async (lat, lng) => {
  const apiKey = config.openWeatherMapApiKey;
  if (!apiKey) {
    logger.debug('OpenWeatherMap API key not configured, skipping');
    return { source: 'OpenWeatherMap', current: null, hourly: [], forecast: [] };
  }

  // Check rate limit BEFORE making the call
  const rateCheck = canMakeApiCall('openweathermap');
  if (!rateCheck.allowed) {
    logger.error(`OpenWeatherMap BLOCKED: Daily limit reached (${rateCheck.count}/${rateCheck.limit}). Skipping API call.`);
    return { source: 'OpenWeatherMap', current: null, hourly: [], forecast: [], rateLimited: true };
  }

  try {
    // Record the API call (this increments the counter)
    const recorded = recordApiCall('openweathermap');
    if (!recorded.success) {
      logger.error('OpenWeatherMap: Failed to record API call, blocking request');
      return { source: 'OpenWeatherMap', current: null, hourly: [], forecast: [], rateLimited: true };
    }

    // Use free APIs: /data/2.5/weather (current) + /data/2.5/forecast (5 day/3 hour)
    const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&appid=${apiKey}`;
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&units=metric&appid=${apiKey}`;

    const [currentResponse, forecastResponse] = await Promise.all([
      axios.get(currentUrl, { timeout: 10000 }),
      axios.get(forecastUrl, { timeout: 10000 })
    ]);

    const currentData = currentResponse.data;
    const forecastData = forecastResponse.data;

    // Parse current weather from /data/2.5/weather
    const currentCondition = getConditionFromOWM(currentData.weather?.[0]);
    const currentParsed = {
      source: 'OpenWeatherMap',
      temperature: currentData.main?.temp,
      feelsLike: currentData.main?.feels_like,
      humidity: currentData.main?.humidity,
      windSpeed: currentData.wind?.speed ? currentData.wind.speed * 3.6 : null, // m/s to km/h
      windDirection: currentData.wind?.deg,
      windGusts: currentData.wind?.gust ? currentData.wind.gust * 3.6 : null,
      pressure: currentData.main?.pressure,
      cloudCover: currentData.clouds?.all,
      visibility: currentData.visibility,
      condition: currentCondition?.condition || null,
      icon: currentCondition?.icon || null
    };

    // Parse 3-hour forecast from /data/2.5/forecast (40 entries = 5 days)
    // Convert to hourly format (will have gaps, but provides 3-hourly data)
    const hourly = (forecastData.list || []).slice(0, 24).map(h => {
      const condition = getConditionFromOWM(h.weather?.[0]);
      return {
        time: new Date(h.dt * 1000).toISOString(),
        temperature: h.main?.temp,
        feelsLike: h.main?.feels_like,
        humidity: h.main?.humidity,
        windSpeed: h.wind?.speed ? h.wind.speed * 3.6 : null,
        windDirection: h.wind?.deg,
        windGusts: h.wind?.gust ? h.wind.gust * 3.6 : null,
        cloudCover: h.clouds?.all,
        precipitation: (h.rain?.['3h'] || 0) + (h.snow?.['3h'] || 0),
        precipitationProbability: h.pop ? Math.round(h.pop * 100) : null,
        visibility: h.visibility,
        condition: condition?.condition || null,
        icon: condition?.icon || null
      };
    });

    // Build daily forecast by aggregating 3-hour intervals
    const dailyMap = new Map();
    for (const item of forecastData.list || []) {
      const date = new Date(item.dt * 1000).toISOString().split('T')[0];
      if (!dailyMap.has(date)) {
        dailyMap.set(date, {
          date,
          temps: [],
          conditions: [],
          icons: [],
          precipProbs: [],
          precips: [],
          windSpeeds: [],
          windGusts: []
        });
      }
      const day = dailyMap.get(date);
      if (item.main?.temp != null) day.temps.push(item.main.temp);
      if (item.weather?.[0]) {
        const cond = getConditionFromOWM(item.weather[0]);
        if (cond) {
          day.conditions.push(cond.condition);
          day.icons.push(cond.icon);
        }
      }
      if (item.pop != null) day.precipProbs.push(Math.round(item.pop * 100));
      const precip = (item.rain?.['3h'] || 0) + (item.snow?.['3h'] || 0);
      if (precip > 0) day.precips.push(precip);
      if (item.wind?.speed != null) day.windSpeeds.push(item.wind.speed * 3.6);
      if (item.wind?.gust != null) day.windGusts.push(item.wind.gust * 3.6);
    }

    const forecast = Array.from(dailyMap.values()).slice(0, 7).map(day => {
      const midConditionIdx = Math.floor(day.conditions.length / 2);
      return {
        date: day.date,
        high: day.temps.length > 0 ? Math.round(Math.max(...day.temps)) : null,
        low: day.temps.length > 0 ? Math.round(Math.min(...day.temps)) : null,
        precipitationProbability: day.precipProbs.length > 0 ? Math.max(...day.precipProbs) : null,
        precipitationSum: day.precips.length > 0 ? day.precips.reduce((a, b) => a + b, 0) : null,
        maxWindSpeed: day.windSpeeds.length > 0 ? Math.round(Math.max(...day.windSpeeds)) : null,
        maxWindGusts: day.windGusts.length > 0 ? Math.round(Math.max(...day.windGusts)) : null,
        condition: day.conditions[midConditionIdx] || null,
        icon: day.icons[midConditionIdx] || null
      };
    });

    logger.info(`OpenWeatherMap (free 2.5 API): current + ${hourly.length} 3-hourly + ${forecast.length} daily (${recorded.remaining} calls remaining today)`);
    return { source: 'OpenWeatherMap', current: currentParsed, hourly, forecast };
  } catch (error) {
    logger.warn(`OpenWeatherMap error: ${error.message}`);
    return { source: 'OpenWeatherMap', current: null, hourly: [], forecast: [] };
  }
};

// ============================================================================
// DATA MERGING - Combine and average data from multiple sources
// ============================================================================

// Merge current weather observations from all sources
const mergeCurrentWeather = (metEireann, openMeteo, openWeatherMap) => {
  const sources = [];
  const sourceDetails = {
    metEireann: { available: false, fields: [] },
    openMeteo: { available: false, fields: [] },
    openWeatherMap: { available: false, fields: [] }
  };

  if (metEireann) {
    sourceDetails.metEireann.available = true;
    sources.push('Met Éireann');
  }
  if (openMeteo) {
    sourceDetails.openMeteo.available = true;
    sources.push('Open-Meteo');
  }
  if (openWeatherMap) {
    sourceDetails.openWeatherMap.available = true;
    sources.push('OpenWeatherMap');
  }

  if (!metEireann && !openMeteo && !openWeatherMap) {
    return {
      data: null,
      sources: [],
      sourceDetails
    };
  }

  const me = metEireann || {};
  const om = openMeteo || {};
  const owm = openWeatherMap || {};

  // Track which fields come from which sources
  const trackField = (fieldName, meVal, omVal, owmVal) => {
    if (meVal !== null && meVal !== undefined) sourceDetails.metEireann.fields.push(fieldName);
    if (omVal !== null && omVal !== undefined) sourceDetails.openMeteo.fields.push(fieldName);
    if (owmVal !== null && owmVal !== undefined) sourceDetails.openWeatherMap.fields.push(fieldName);
  };

  trackField('temperature', me.temperature, om.temperature, owm.temperature);
  trackField('humidity', me.humidity, om.humidity, owm.humidity);
  trackField('windSpeed', me.windSpeed, om.windSpeed, owm.windSpeed);
  trackField('windDirection', me.windDirection, om.windDirection, owm.windDirection);
  trackField('windGusts', me.windGusts, om.windGusts, owm.windGusts);
  trackField('pressure', me.pressure, om.pressure, owm.pressure);
  trackField('cloudCover', me.cloudCover, om.cloudCover, owm.cloudCover);
  trackField('uvIndex', null, om.uvIndex, owm.uvIndex);
  trackField('dewPoint', null, om.dewPoint, owm.dewPoint);
  trackField('visibility', null, om.visibility, owm.visibility);
  trackField('feelsLike', null, om.feelsLike, owm.feelsLike);
  trackField('condition', me.condition, om.condition, owm.condition);

  // Average all numeric fields from all available sources
  const avgTemp = avgNumMultiple(me.temperature, om.temperature, owm.temperature);
  const avgWindSpeed = avgNumMultiple(me.windSpeed, om.windSpeed, owm.windSpeed);
  const avgHumidity = avgNumMultiple(me.humidity, om.humidity, owm.humidity);
  const avgWindDir = avgWindDirectionMultiple(me.windDirection, om.windDirection, owm.windDirection);
  const avgCloudCover = avgNumMultiple(me.cloudCover, om.cloudCover, owm.cloudCover);
  const avgPressure = avgNumMultiple(me.pressure, om.pressure, owm.pressure);
  const avgWindGusts = avgNumMultiple(me.windGusts, om.windGusts, owm.windGusts);
  const avgUvIndex = avgNumDecimalMultiple(om.uvIndex, owm.uvIndex);
  const avgDewPoint = avgNumDecimalMultiple(om.dewPoint, owm.dewPoint);
  const avgVisibility = avgNumMultiple(om.visibility, owm.visibility);

  // Average feels like from sources that provide it, or calculate from averaged values
  const avgFeelsLike = avgNumDecimalMultiple(om.feelsLike, owm.feelsLike) ??
    calculateFeelsLike(avgTemp ?? 0, avgWindSpeed ?? 0, avgHumidity ?? 0);

  const windDir = getWindDirection(avgWindDir);
  const condition = pickConditionMultiple(
    me.condition ? { condition: me.condition, icon: me.icon } : null,
    om.condition ? { condition: om.condition, icon: om.icon } : null,
    owm.condition ? { condition: owm.condition, icon: owm.icon } : null
  );

  // Count how many sources contributed data
  const sourceCount = [metEireann, openMeteo, openWeatherMap].filter(Boolean).length;

  const merged = {
    temperature: avgTemp ?? 0,
    feelsLike: avgFeelsLike,
    humidity: avgHumidity ?? 0,
    windSpeed: avgWindSpeed ?? 0,
    windDirection: avgWindDir,
    windDirectionCardinal: windDir.direction,
    windDirectionLabel: windDir.label,
    windGusts: avgWindGusts ?? 0,
    pressure: avgPressure ?? 0,
    rainfall: avgNumDecimalMultiple(me.rainfall, om.precipitation) ?? 0,
    cloudCover: avgCloudCover,
    uvIndex: avgUvIndex,
    visibility: avgVisibility,
    dewPoint: avgDewPoint,
    condition: condition.condition,
    icon: condition.icon,
    reportTime: me.reportTime,
    stationName: me.stationName,
    sourceCount,
    // Include individual source values for transparency
    _sourceValues: {
      temperature: { metEireann: me.temperature, openMeteo: om.temperature, openWeatherMap: owm.temperature },
      humidity: { metEireann: me.humidity, openMeteo: om.humidity, openWeatherMap: owm.humidity },
      windSpeed: { metEireann: me.windSpeed, openMeteo: om.windSpeed, openWeatherMap: owm.windSpeed },
      windDirection: { metEireann: me.windDirection, openMeteo: om.windDirection, openWeatherMap: owm.windDirection },
      windGusts: { metEireann: me.windGusts, openMeteo: om.windGusts, openWeatherMap: owm.windGusts },
      pressure: { metEireann: me.pressure, openMeteo: om.pressure, openWeatherMap: owm.pressure },
      cloudCover: { metEireann: me.cloudCover, openMeteo: om.cloudCover, openWeatherMap: owm.cloudCover },
      uvIndex: { openMeteo: om.uvIndex, openWeatherMap: owm.uvIndex },
      dewPoint: { openMeteo: om.dewPoint, openWeatherMap: owm.dewPoint },
      visibility: { openMeteo: om.visibility, openWeatherMap: owm.visibility },
      feelsLike: { openMeteo: om.feelsLike, openWeatherMap: owm.feelsLike },
      condition: { metEireann: me.condition, openMeteo: om.condition, openWeatherMap: owm.condition }
    }
  };

  return { data: merged, sources, sourceDetails };
};

// Merge hourly forecasts from all sources
const mergeHourlyForecasts = (metEireannHourly, openMeteoHourly, openWeatherMapHourly) => {
  const meMap = new Map();
  const omMap = new Map();
  const owmMap = new Map();

  // Index by hour key (YYYY-MM-DDTHH)
  for (const h of metEireannHourly || []) {
    const key = h.time.substring(0, 13);
    meMap.set(key, h);
  }
  for (const h of openMeteoHourly || []) {
    const key = h.time.substring(0, 13);
    omMap.set(key, h);
  }
  for (const h of openWeatherMapHourly || []) {
    const key = h.time.substring(0, 13);
    owmMap.set(key, h);
  }

  // Get all unique hours
  const allHours = new Set([...meMap.keys(), ...omMap.keys(), ...owmMap.keys()]);
  const sortedHours = Array.from(allHours).sort();

  const merged = [];
  for (const hourKey of sortedHours.slice(0, 24)) {
    const me = meMap.get(hourKey) || {};
    const om = omMap.get(hourKey) || {};
    const owm = owmMap.get(hourKey) || {};

    const condition = pickConditionMultiple(
      me.condition ? { condition: me.condition, icon: me.icon } : null,
      om.condition ? { condition: om.condition, icon: om.icon } : null,
      owm.condition ? { condition: owm.condition, icon: owm.icon } : null
    );

    // Average all numeric fields from all available sources
    const avgTemp = avgNumMultiple(me.temperature, om.temperature, owm.temperature) ?? 0;
    const avgHumidity = avgNumMultiple(me.humidity, om.humidity, owm.humidity);
    const avgWindSpeed = avgNumMultiple(me.windSpeed, om.windSpeed, owm.windSpeed);
    const avgWindDir = avgWindDirectionMultiple(me.windDirection, om.windDirection, owm.windDirection);
    const avgWindGusts = avgNumMultiple(me.windGusts, om.windGusts, owm.windGusts);
    const avgCloudCover = avgNumMultiple(me.cloudCover, om.cloudCover, owm.cloudCover) ?? 0;
    const avgPrecip = avgNumDecimalMultiple(me.precipitation, om.precipitation, owm.precipitation) ?? 0;
    const avgPrecipProb = avgNumMultiple(om.precipitationProbability, owm.precipitationProbability);
    const avgUvIndex = avgNumDecimalMultiple(om.uvIndex, owm.uvIndex);
    const avgDewPoint = avgNumDecimalMultiple(om.dewPoint, owm.dewPoint);
    const avgVisibility = avgNumMultiple(om.visibility, owm.visibility);

    // Average feels like from sources that provide it, or calculate from averaged values
    const avgFeelsLike = avgNumDecimalMultiple(om.feelsLike, owm.feelsLike) ??
      calculateFeelsLike(avgTemp, avgWindSpeed ?? 0, avgHumidity ?? 0);

    const windDir = getWindDirection(avgWindDir);

    merged.push({
      time: me.time || om.time || owm.time,
      temperature: avgTemp,
      feelsLike: avgFeelsLike,
      humidity: avgHumidity,
      windSpeed: avgWindSpeed,
      windDirection: avgWindDir,
      windDirectionCardinal: windDir.direction,
      windDirectionLabel: windDir.label,
      windGusts: avgWindGusts,
      cloudCover: avgCloudCover,
      precipitation: avgPrecip,
      precipitationProbability: avgPrecipProb,
      uvIndex: avgUvIndex,
      dewPoint: avgDewPoint,
      visibility: avgVisibility,
      condition: condition.condition,
      icon: condition.icon,
      // Track how many sources contributed to this hour
      sourceCount: [meMap.has(hourKey), omMap.has(hourKey), owmMap.has(hourKey)].filter(Boolean).length,
      _sources: {
        metEireann: meMap.has(hourKey),
        openMeteo: omMap.has(hourKey),
        openWeatherMap: owmMap.has(hourKey)
      },
      _sourceValues: {
        temperature: { metEireann: me.temperature, openMeteo: om.temperature, openWeatherMap: owm.temperature },
        feelsLike: { openMeteo: om.feelsLike, openWeatherMap: owm.feelsLike },
        humidity: { metEireann: me.humidity, openMeteo: om.humidity, openWeatherMap: owm.humidity },
        windSpeed: { metEireann: me.windSpeed, openMeteo: om.windSpeed, openWeatherMap: owm.windSpeed },
        windDirection: { metEireann: me.windDirection, openMeteo: om.windDirection, openWeatherMap: owm.windDirection },
        windGusts: { metEireann: me.windGusts, openMeteo: om.windGusts, openWeatherMap: owm.windGusts },
        cloudCover: { metEireann: me.cloudCover, openMeteo: om.cloudCover, openWeatherMap: owm.cloudCover },
        precipitation: { metEireann: me.precipitation, openMeteo: om.precipitation, openWeatherMap: owm.precipitation },
        precipitationProbability: { openMeteo: om.precipitationProbability, openWeatherMap: owm.precipitationProbability },
        uvIndex: { openMeteo: om.uvIndex, openWeatherMap: owm.uvIndex },
        dewPoint: { openMeteo: om.dewPoint, openWeatherMap: owm.dewPoint },
        visibility: { openMeteo: om.visibility, openWeatherMap: owm.visibility }
      }
    });
  }

  return merged;
};

// Merge daily forecasts from all sources
const mergeDailyForecasts = (metEireannDaily, openMeteoDaily, openWeatherMapDaily) => {
  const meMap = new Map();
  const omMap = new Map();
  const owmMap = new Map();

  for (const d of metEireannDaily || []) {
    meMap.set(d.date, d);
  }
  for (const d of openMeteoDaily || []) {
    omMap.set(d.date, d);
  }
  for (const d of openWeatherMapDaily || []) {
    owmMap.set(d.date, d);
  }

  const allDates = new Set([...meMap.keys(), ...omMap.keys(), ...owmMap.keys()]);
  const sortedDates = Array.from(allDates).sort();

  const merged = [];
  for (const date of sortedDates.slice(0, 7)) {
    const me = meMap.get(date) || {};
    const om = omMap.get(date) || {};
    const owm = owmMap.get(date) || {};

    const condition = pickConditionMultiple(
      me.condition ? { condition: me.condition, icon: me.icon } : null,
      om.condition ? { condition: om.condition, icon: om.icon } : null,
      owm.condition ? { condition: owm.condition, icon: owm.icon } : null
    );

    // Average all numeric fields from all sources
    const avgHigh = avgNumMultiple(me.high, om.high, owm.high);
    const avgLow = avgNumMultiple(me.low, om.low, owm.low);
    const avgFeelsLikeHigh = avgNumDecimalMultiple(om.feelsLikeHigh, owm.feelsLikeHigh);
    const avgFeelsLikeLow = avgNumDecimalMultiple(om.feelsLikeLow, owm.feelsLikeLow);
    const avgPrecipProb = avgNumMultiple(om.precipitationProbability, owm.precipitationProbability);
    const avgPrecipSum = avgNumDecimalMultiple(om.precipitationSum, owm.precipitationSum);
    const avgMaxWind = avgNumMultiple(om.maxWindSpeed, owm.maxWindSpeed);
    const avgMaxWindGusts = avgNumMultiple(om.maxWindGusts, owm.maxWindGusts);
    const avgUvIndex = avgNumDecimalMultiple(om.uvIndex, owm.uvIndex);

    merged.push({
      date,
      high: avgHigh,
      low: avgLow,
      feelsLikeHigh: avgFeelsLikeHigh,
      feelsLikeLow: avgFeelsLikeLow,
      precipitationSum: avgPrecipSum,
      precipitationProbability: avgPrecipProb,
      maxWindSpeed: avgMaxWind,
      maxWindGusts: avgMaxWindGusts,
      uvIndex: avgUvIndex,
      condition: condition.condition,
      icon: condition.icon,
      // Track how many sources contributed to this day
      sourceCount: [meMap.has(date), omMap.has(date), owmMap.has(date)].filter(Boolean).length,
      _sources: {
        metEireann: meMap.has(date),
        openMeteo: omMap.has(date),
        openWeatherMap: owmMap.has(date)
      },
      _sourceValues: {
        high: { metEireann: me.high, openMeteo: om.high, openWeatherMap: owm.high },
        low: { metEireann: me.low, openMeteo: om.low, openWeatherMap: owm.low },
        feelsLikeHigh: { openMeteo: om.feelsLikeHigh, openWeatherMap: owm.feelsLikeHigh },
        feelsLikeLow: { openMeteo: om.feelsLikeLow, openWeatherMap: owm.feelsLikeLow },
        precipitationProbability: { openMeteo: om.precipitationProbability, openWeatherMap: owm.precipitationProbability },
        precipitationSum: { openMeteo: om.precipitationSum, openWeatherMap: owm.precipitationSum },
        maxWindSpeed: { openMeteo: om.maxWindSpeed, openWeatherMap: owm.maxWindSpeed },
        maxWindGusts: { openMeteo: om.maxWindGusts, openWeatherMap: owm.maxWindGusts },
        uvIndex: { openMeteo: om.uvIndex, openWeatherMap: owm.uvIndex }
      }
    });
  }

  return merged;
};

// ============================================================================
// RADAR AND SATELLITE DATA - RainViewer API
// ============================================================================

// Fetch radar/satellite data from RainViewer (free, no API key required)
const fetchRadarData = async () => {
  try {
    const url = 'https://api.rainviewer.com/public/weather-maps.json';
    const response = await axios.get(url, { timeout: 10000 });
    const data = response.data;

    // RainViewer provides radar frames (past + nowcast) and satellite infrared
    const radar = data.radar || {};
    const satellite = data.satellite || {};

    // Get the tile host (usually tilecache.rainviewer.com)
    const host = radar.host || data.host || 'https://tilecache.rainviewer.com';

    // Build radar frames (past + nowcast)
    const radarFrames = [];

    // Past radar frames
    if (radar.past && Array.isArray(radar.past)) {
      for (const frame of radar.past) {
        radarFrames.push({
          time: frame.time,
          path: frame.path,
          type: 'past',
          tileUrl: `${host}${frame.path}/256/{z}/{x}/{y}/4/1_1.png`
        });
      }
    }

    // Nowcast (forecast) radar frames
    if (radar.nowcast && Array.isArray(radar.nowcast)) {
      for (const frame of radar.nowcast) {
        radarFrames.push({
          time: frame.time,
          path: frame.path,
          type: 'nowcast',
          tileUrl: `${host}${frame.path}/256/{z}/{x}/{y}/4/1_1.png`
        });
      }
    }

    // Satellite infrared frames
    const satelliteFrames = [];
    if (satellite.infrared && Array.isArray(satellite.infrared)) {
      for (const frame of satellite.infrared) {
        satelliteFrames.push({
          time: frame.time,
          path: frame.path,
          tileUrl: `${host}${frame.path}/256/{z}/{x}/{y}/0/0_0.png`
        });
      }
    }

    // Generate static image URLs centered on Dublin for quick preview
    // Format: https://tilecache.rainviewer.com/v2/radar/{timestamp}/256/{z}/{x}/{y}/{color}/{options}.png
    // For Dublin area: lat 53.35, lng -6.26 at zoom 6 => tile x=30, y=20 (approx)
    const dublinZoom = 6;
    const dublinTileX = 30;
    const dublinTileY = 20;

    // Get latest radar frame for static preview
    const latestRadar = radarFrames.length > 0 ? radarFrames[radarFrames.length - 1] : null;
    const latestSatellite = satelliteFrames.length > 0 ? satelliteFrames[satelliteFrames.length - 1] : null;

    // Build static preview URLs
    const staticRadarUrl = latestRadar
      ? `${host}${latestRadar.path}/256/${dublinZoom}/${dublinTileX}/${dublinTileY}/4/1_1.png`
      : null;
    const staticSatelliteUrl = latestSatellite
      ? `${host}${latestSatellite.path}/256/${dublinZoom}/${dublinTileX}/${dublinTileY}/0/0_0.png`
      : null;

    logger.info(`RainViewer: ${radarFrames.length} radar frames, ${satelliteFrames.length} satellite frames`);

    return {
      host,
      radar: {
        frames: radarFrames,
        latest: latestRadar,
        staticPreview: staticRadarUrl
      },
      satellite: {
        frames: satelliteFrames,
        latest: latestSatellite,
        staticPreview: staticSatelliteUrl
      },
      // Coverage bounds (RainViewer covers most of the world)
      coverage: {
        bounds: [[-90, -180], [90, 180]],
        note: 'Radar coverage varies by region'
      },
      // Color scheme info
      colorSchemes: {
        radar: {
          '1': 'Original',
          '2': 'Universal Blue',
          '3': 'TITAN',
          '4': 'The Weather Channel',
          '5': 'Meteored',
          '6': 'NEXRAD Level III',
          '7': 'Rainbow @ SELEX-IS',
          '8': 'Dark Sky'
        }
      },
      generated: data.generated,
      fetchedAt: new Date().toISOString()
    };
  } catch (error) {
    logger.warn(`RainViewer error: ${error.message}`);
    return null;
  }
};

// Radar endpoint
router.get('/radar', asyncHandler(async (req, res) => {
  const cacheKey = 'weather:radar';
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  logger.info('Fetching radar/satellite data from RainViewer');
  const radarData = await fetchRadarData();

  if (!radarData) {
    return res.status(500).json({ error: 'Failed to fetch radar data' });
  }

  // Cache for 5 minutes (radar updates every 10 minutes)
  cache.set(cacheKey, radarData, 300);
  res.json(radarData);
}));

// ============================================================================
// MAIN WEATHER ENDPOINT
// ============================================================================

// Ireland bounding box (approximate)
const IRELAND_BOUNDS = {
  minLat: 51.4,
  maxLat: 55.5,
  minLng: -10.5,
  maxLng: -5.5
};

// Check if coordinates are within Ireland
const isInIreland = (lat, lng) => {
  return lat >= IRELAND_BOUNDS.minLat && lat <= IRELAND_BOUNDS.maxLat &&
         lng >= IRELAND_BOUNDS.minLng && lng <= IRELAND_BOUNDS.maxLng;
};

// Map of Met Éireann station names for Irish locations
const MET_EIREANN_STATIONS = {
  'dublin': 'dublin',
  'killiney': 'dublin', // Uses Dublin station
  'cork': 'cork',
  'galway': 'galway',
  'limerick': 'limerick',
  'waterford': 'waterford',
  'belfast': 'belfast',
  'athlone': 'athlone',
  'knock': 'knock',
  'shannon': 'shannon',
  'casement': 'casement',
  'malin-head': 'malin-head',
  'valentia': 'valentia',
  'belmullet': 'belmullet',
  'claremorris': 'claremorris',
  'mullingar': 'mullingar',
  'birr': 'birr',
  'gurteen': 'gurteen',
  'johnstown': 'johnstown',
  'kilkenny': 'kilkenny',
  'dunsany': 'dunsany',
  'rosslare': 'rosslare',
  'moore-park': 'moore-park',
  'roches-point': 'roches-point',
  'sherkin-island': 'sherkin-island',
  'mace-head': 'mace-head',
  'newport': 'newport',
  'markree': 'markree',
  'ballyhaise': 'ballyhaise',
  'finner': 'finner',
  'phoenix-park': 'phoenix-park'
};

router.get('/', asyncHandler(async (req, res) => {
  // Accept lat/lng or fall back to defaults (Killiney)
  const lat = parseFloat(req.query.lat) || config.weather.defaultLat;
  const lng = parseFloat(req.query.lng) || config.weather.defaultLng;
  const locationName = req.query.name || 'Killiney';

  // Determine if we should use Met Éireann (only for Ireland)
  const useMetEireann = isInIreland(lat, lng);

  // Find closest Met Éireann station if in Ireland
  let metStation = 'dublin'; // Default
  if (useMetEireann) {
    // Simple heuristic: use location name if it matches, otherwise dublin
    const normalizedName = locationName.toLowerCase().replace(/[^a-z]/g, '-');
    metStation = MET_EIREANN_STATIONS[normalizedName] || 'dublin';
  }

  const cacheKey = `weather:combined:${lat}:${lng}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  logger.info(`Fetching weather for ${locationName} (${lat}, ${lng}) - Met Éireann: ${useMetEireann ? metStation : 'disabled'}`);

  // Fetch from all sources in parallel (Met Éireann only if in Ireland)
  const [metEireannCurrent, metEireannForecast, openMeteoData, openWeatherMapData] = await Promise.all([
    useMetEireann ? fetchMetEireannCurrent(metStation) : Promise.resolve(null),
    useMetEireann ? fetchMetEireannForecast(lat, lng) : Promise.resolve({ source: 'Met Éireann', hourly: [], forecast: [] }),
    fetchOpenMeteo(lat, lng),
    fetchOpenWeatherMap(lat, lng)
  ]);

  // Merge current weather from all 3 sources
  const currentMerged = mergeCurrentWeather(
    metEireannCurrent,
    openMeteoData.current,
    openWeatherMapData.current
  );

  // Merge forecasts from all 3 sources
  const hourlyMerged = mergeHourlyForecasts(
    metEireannForecast.hourly,
    openMeteoData.hourly,
    openWeatherMapData.hourly
  );

  const dailyMerged = mergeDailyForecasts(
    metEireannForecast.forecast,
    openMeteoData.forecast,
    openWeatherMapData.forecast
  );

  // Improve current condition accuracy by also considering the first hourly forecast
  // Forecast models are often more accurate than observation stations for current conditions
  let currentData = currentMerged.data;
  if (currentData && hourlyMerged.length > 0) {
    const nowForecast = hourlyMerged[0];

    // Always preserve the original observation station data
    currentData = {
      ...currentData,
      observedCondition: currentData.condition,
      observedIcon: currentData.icon,
      forecastCondition: nowForecast.condition,
      forecastIcon: nowForecast.icon
    };

    // If the first hourly forecast has a condition that differs from current observations,
    // prefer the forecast condition (it's usually more accurate for the exact location)
    if (nowForecast.condition && nowForecast.icon) {
      // Use forecast condition if observation is generic (Cloudy, Partly Cloudy) but forecast is specific (Rain, etc)
      const genericConditions = ['Cloudy', 'Partly Cloudy', 'Overcast', 'Few Clouds', 'Scattered Clouds', 'Broken Clouds'];
      const isCurrentGeneric = genericConditions.includes(currentData.observedCondition);
      const isForecastSpecific = !genericConditions.includes(nowForecast.condition) && nowForecast.condition !== 'Clear';

      if (isCurrentGeneric && isForecastSpecific) {
        logger.info(`Overriding current condition "${currentData.observedCondition}" with forecast "${nowForecast.condition}"`);
        currentData.condition = nowForecast.condition;
        currentData.icon = nowForecast.icon;
        currentData.conditionSource = 'forecast';
      } else {
        currentData.conditionSource = 'observation';
      }
    }
  }

  // Build response
  const weatherData = {
    current: currentData || {
      temperature: 0,
      feelsLike: 0,
      humidity: 0,
      windSpeed: 0,
      windDirection: 0,
      windDirectionCardinal: 'N',
      condition: 'Unknown',
      icon: 'cloudy'
    },
    hourly: hourlyMerged,
    forecast: dailyMerged,
    sources: {
      current: currentMerged.sources,
      forecast: [
        useMetEireann && metEireannForecast.hourly.length > 0 ? 'Met Éireann' : null,
        openMeteoData.hourly.length > 0 ? 'Open-Meteo' : null,
        openWeatherMapData.hourly.length > 0 ? 'OpenWeatherMap' : null
      ].filter(Boolean)
    },
    sourceDetails: currentMerged.sourceDetails,
    location: {
      name: locationName,
      lat,
      lng,
      inIreland: useMetEireann,
      metStation: useMetEireann ? metStation : null
    },
    fetchedAt: new Date().toISOString()
  };

  cache.set(cacheKey, weatherData, config.cache.weather);
  res.json(weatherData);
}));

// ============================================================================
// DEFAULT LOCATION ENDPOINT
// ============================================================================

router.get('/defaults', asyncHandler(async (req, res) => {
  res.json({
    lat: config.weather.defaultLat,
    lng: config.weather.defaultLng,
    name: config.weather.defaultName
  });
}));

// ============================================================================
// API USAGE STATS ENDPOINT
// ============================================================================

router.get('/api-usage', asyncHandler(async (req, res) => {
  const owmStats = getApiUsageStats('openweathermap');
  res.json({
    openweathermap: owmStats,
    message: owmStats.remaining <= 100
      ? `Warning: Only ${owmStats.remaining} API calls remaining today!`
      : `${owmStats.remaining} API calls remaining today`
  });
}));

// ============================================================================
// SUN TIMES ENDPOINT
// ============================================================================

router.get('/sun', asyncHandler(async (req, res) => {
  const lat = parseFloat(req.query.lat) || config.weather.defaultLat;
  const lng = parseFloat(req.query.lng) || config.weather.defaultLng;

  const cacheKey = `sun:v3:${lat}:${lng}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  logger.info(`Fetching sun times for ${lat},${lng}`);

  // Fetch today's and tomorrow's sun times in parallel
  // We need tomorrow's data to calculate the Astro Night window correctly
  // (tonight's astronomical twilight end -> tomorrow morning's astronomical twilight begin)
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const todayUrl = `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lng}&formatted=0`;
  const tomorrowUrl = `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lng}&date=${tomorrowStr}&formatted=0`;

  const [todayResponse, tomorrowResponse] = await Promise.all([
    axios.get(todayUrl, { timeout: 10000 }),
    axios.get(tomorrowUrl, { timeout: 10000 })
  ]);

  if (todayResponse.data?.status === 'OK') {
    const results = todayResponse.data.results;
    const tomorrowResults = tomorrowResponse.data?.status === 'OK' ? tomorrowResponse.data.results : null;

    const sunData = {
      sunrise: results.sunrise,
      sunset: results.sunset,
      civilTwilightEnd: results.civil_twilight_end,
      civilTwilightBegin: results.civil_twilight_begin,
      nauticalTwilightEnd: results.nautical_twilight_end,
      nauticalTwilightBegin: results.nautical_twilight_begin,
      astronomicalTwilightEnd: results.astronomical_twilight_end,
      astronomicalTwilightBegin: results.astronomical_twilight_begin,
      // For Astro Night calculation: use tomorrow morning's astronomical twilight begin
      // This gives us the window from tonight's darkness start to tomorrow's darkness end
      tomorrowAstronomicalTwilightBegin: tomorrowResults?.astronomical_twilight_begin || null,
      solarNoon: results.solar_noon,
      dayLength: results.day_length,
      location: { lat, lng },
      fetchedAt: new Date().toISOString()
    };

    cache.set(cacheKey, sunData, config.cache.sunTimes);
    return res.json(sunData);
  }

  return res.status(500).json({ error: 'Failed to fetch sun times' });
}));

// ============================================================================
// MOON PHASE ENDPOINT
// ============================================================================

router.get('/moon', asyncHandler(async (req, res) => {
  const lat = parseFloat(req.query.lat) || config.weather.defaultLat;
  const lng = parseFloat(req.query.lng) || config.weather.defaultLng;

  const cacheKey = `moon:${lat}:${lng}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  logger.info(`Fetching moon phase for ${lat},${lng}`);

  const now = new Date();
  const referenceNewMoon = new Date('2000-01-06T18:14:00Z').getTime();
  const synodicMonth = 29.53059;

  const daysSinceReference = (now.getTime() - referenceNewMoon) / (1000 * 60 * 60 * 24);
  const moonCycles = daysSinceReference / synodicMonth;
  const currentPhase = moonCycles - Math.floor(moonCycles);

  const illumination = Math.round((1 - Math.cos(currentPhase * 2 * Math.PI)) / 2 * 100);

  let phaseName;
  let phaseEmoji;
  if (currentPhase < 0.0625) {
    phaseName = 'New Moon';
    phaseEmoji = '🌑';
  } else if (currentPhase < 0.1875) {
    phaseName = 'Waxing Crescent';
    phaseEmoji = '🌒';
  } else if (currentPhase < 0.3125) {
    phaseName = 'First Quarter';
    phaseEmoji = '🌓';
  } else if (currentPhase < 0.4375) {
    phaseName = 'Waxing Gibbous';
    phaseEmoji = '🌔';
  } else if (currentPhase < 0.5625) {
    phaseName = 'Full Moon';
    phaseEmoji = '🌕';
  } else if (currentPhase < 0.6875) {
    phaseName = 'Waning Gibbous';
    phaseEmoji = '🌖';
  } else if (currentPhase < 0.8125) {
    phaseName = 'Last Quarter';
    phaseEmoji = '🌗';
  } else if (currentPhase < 0.9375) {
    phaseName = 'Waning Crescent';
    phaseEmoji = '🌘';
  } else {
    phaseName = 'New Moon';
    phaseEmoji = '🌑';
  }

  const baseRiseHour = 6;
  const phaseOffset = currentPhase * 24;

  const moonriseHour = (baseRiseHour + phaseOffset) % 24;
  const moonsetHour = (moonriseHour + 12) % 24;

  const moonrise = new Date(now);
  moonrise.setHours(Math.floor(moonriseHour), Math.round((moonriseHour % 1) * 60), 0, 0);

  const moonset = new Date(now);
  moonset.setHours(Math.floor(moonsetHour), Math.round((moonsetHour % 1) * 60), 0, 0);

  if (moonset < moonrise) {
    moonset.setDate(moonset.getDate() + 1);
  }

  const moonData = {
    phase: currentPhase,
    phaseName,
    phaseEmoji,
    illumination,
    moonrise: moonrise.toISOString(),
    moonset: moonset.toISOString(),
    isWaxing: currentPhase < 0.5,
    location: { lat, lng },
    fetchedAt: new Date().toISOString()
  };

  cache.set(cacheKey, moonData, config.cache.sunTimes);
  res.json(moonData);
}));

export default router;
