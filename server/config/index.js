import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

// Try to load config.json for additional settings
let fileConfig = {};
const configPath = join(__dirname, '..', '..', 'data', 'config.json');
try {
  if (fs.existsSync(configPath)) {
    fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
} catch (e) {
  // Config file doesn't exist or is invalid, use env vars only
}

const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  // API Keys
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || fileConfig.anthropic_api_key,
  youtubeApiKey: process.env.YOUTUBE_API_KEY || fileConfig.youtube_api_key,
  windyApiKey: process.env.WINDY_API_KEY || fileConfig.windy_api_key,
  openWeatherMapApiKey: process.env.OPENWEATHERMAP_API_KEY || fileConfig.openweathermap_api_key,

  // Portfolio
  portfolio: {
    amznShares: parseFloat(process.env.AMZN_SHARES || fileConfig.portfolio?.amzn_shares || '0'),
    cashAssetsEur: parseFloat(process.env.CASH_ASSETS_EUR || fileConfig.portfolio?.cash_assets_eur || '0'),
    xrpQuantity: parseFloat(process.env.XRP_QUANTITY || fileConfig.portfolio?.xrp_quantity || '0')
  },

  // Weather defaults (Killiney, Dublin if not configured)
  weather: {
    defaultLat: parseFloat(process.env.WEATHER_DEFAULT_LAT || '53.2631'),
    defaultLng: parseFloat(process.env.WEATHER_DEFAULT_LNG || '-6.1083'),
    defaultName: process.env.WEATHER_DEFAULT_NAME || 'Killiney, Co. Dublin'
  },

  // Cache TTLs (in seconds)
  cache: {
    prices: 60,          // 1 minute
    charts: 300,         // 5 minutes
    portfolio: 120,      // 2 minutes
    recommendations: 600, // 10 minutes
    weather: 900,        // 15 minutes
    sunTimes: 3600       // 1 hour
  },

  // YouTube settings
  youtube: {
    cookiesFile: process.env.YOUTUBE_COOKIES_FILE || fileConfig.youtube_cookies_file || join(__dirname, '..', '..', 'data', 'youtube-cookies.txt'),
    oauth: {
      clientId: process.env.YOUTUBE_OAUTH_CLIENT_ID || fileConfig.youtube_oauth?.client_id,
      clientSecret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET || fileConfig.youtube_oauth?.client_secret,
      redirectUri: process.env.YOUTUBE_OAUTH_REDIRECT_URI || fileConfig.youtube_oauth?.redirect_uri || 'http://localhost:3001/oauth/youtube/callback'
    }
  },

  // Home Automation - Tapo credentials
  tapo: {
    email: process.env.TAPO_EMAIL || fileConfig.tapo?.email,
    password: process.env.TAPO_PASSWORD || fileConfig.tapo?.password
  },

  // Home Automation - Govee API key (for Cloud API to get device names)
  govee: {
    apiKey: process.env.GOVEE_API_KEY || fileConfig.govee?.api_key
  },

  // Home Automation - EPH Ember thermostat
  eph: {
    email: process.env.EPH_EMAIL || fileConfig.eph?.email,
    password: process.env.EPH_PASSWORD || fileConfig.eph?.password
  }
};

export default config;
