import express from 'express';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import logger from '../utils/logger.js';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '..', '.env');

// Helper to parse .env file content
function parseEnvFile(content) {
  const env = {};
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      env[match[1]] = match[2];
    }
  }
  return env;
}

// Helper to serialize env object back to .env format
function serializeEnvFile(env, originalContent) {
  const lines = originalContent.split('\n');
  const result = [];
  const processed = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      result.push(line);
      continue;
    }
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1];
      processed.add(key);
      if (key in env) {
        result.push(`${key}=${env[key]}`);
      } else {
        result.push(line);
      }
    } else {
      result.push(line);
    }
  }

  // Add any new keys that weren't in the original file
  for (const key of Object.keys(env)) {
    if (!processed.has(key)) {
      result.push(`${key}=${env[key]}`);
    }
  }

  return result.join('\n');
}

// Define all configurable settings with metadata
// Fields with visible: true will have their values returned to the client
// Fields without visible (or visible: false) only return isSet status
const SETTINGS_SCHEMA = {
  apiKeys: {
    label: 'API Keys',
    fields: {
      ANTHROPIC_API_KEY: {
        label: 'Anthropic API Key',
        description: 'API key for Claude AI chat',
        placeholder: 'sk-ant-...',
        type: 'password'
      },
      OPENWEATHERMAP_API_KEY: {
        label: 'OpenWeatherMap API Key',
        description: 'API key for OpenWeatherMap One Call API 3.0',
        placeholder: 'Enter your OpenWeatherMap API key',
        type: 'password'
      },
      YOUTUBE_API_KEY: {
        label: 'YouTube API Key',
        description: 'API key for YouTube Data API',
        placeholder: 'Enter your YouTube API key',
        type: 'password'
      }
    }
  },
  user: {
    label: 'User Settings',
    fields: {
      USER_NAME: {
        label: 'Your Name',
        description: 'Your name for personalized greetings',
        placeholder: 'Enter your name',
        type: 'text',
        visible: true
      }
    }
  },
  weather: {
    label: 'Weather',
    fields: {
      WEATHER_DEFAULT_LAT: {
        label: 'Default Latitude',
        description: 'Default latitude for weather (e.g., 53.2631 for Killiney)',
        placeholder: '53.2631',
        type: 'text',
        visible: true
      },
      WEATHER_DEFAULT_LNG: {
        label: 'Default Longitude',
        description: 'Default longitude for weather (e.g., -6.1083 for Killiney)',
        placeholder: '-6.1083',
        type: 'text',
        visible: true
      },
      WEATHER_DEFAULT_NAME: {
        label: 'Default Location Name',
        description: 'Display name for the default weather location',
        placeholder: 'Killiney, Co. Dublin',
        type: 'text',
        visible: true
      }
    }
  },
  portfolio: {
    label: 'Portfolio',
    fields: {
      AMZN_SHARES: {
        label: 'AMZN Shares',
        description: 'Number of Amazon shares you own',
        placeholder: '0',
        type: 'number'
      },
      CASH_ASSETS_EUR: {
        label: 'Cash Assets (EUR)',
        description: 'Cash holdings in EUR',
        placeholder: '0',
        type: 'number'
      },
      XRP_QUANTITY: {
        label: 'XRP Quantity',
        description: 'Amount of XRP you own',
        placeholder: '0',
        type: 'number'
      }
    }
  },
  youtube: {
    label: 'YouTube OAuth',
    fields: {
      YOUTUBE_CLIENT_ID: {
        label: 'OAuth Client ID',
        description: 'YouTube OAuth 2.0 Client ID',
        placeholder: 'Enter your client ID',
        type: 'password'
      },
      YOUTUBE_CLIENT_SECRET: {
        label: 'OAuth Client Secret',
        description: 'YouTube OAuth 2.0 Client Secret',
        placeholder: 'Enter your client secret',
        type: 'password'
      }
    }
  },
  smartHome: {
    label: 'Smart Home',
    fields: {
      TAPO_EMAIL: {
        label: 'TP-Link Account Email',
        description: 'Email for your TP-Link account (required for Tapo devices)',
        placeholder: 'your.email@example.com',
        type: 'text',
        visible: true
      },
      TAPO_PASSWORD: {
        label: 'TP-Link Account Password',
        description: 'Password for your TP-Link account',
        placeholder: 'Enter your TP-Link password',
        type: 'password'
      },
      GOVEE_API_KEY: {
        label: 'Govee API Key',
        description: 'API key for Govee Cloud API (to fetch device names). Get it from Govee Home app → Profile → Settings → Apply for API Key',
        placeholder: 'Enter your Govee API key',
        type: 'password'
      },
      EPH_EMAIL: {
        label: 'EPH Ember Email',
        description: 'Email for your EPH Ember app account (for thermostat control)',
        placeholder: 'your.email@example.com',
        type: 'text',
        visible: true
      },
      EPH_PASSWORD: {
        label: 'EPH Ember Password',
        description: 'Password for your EPH Ember app account',
        placeholder: 'Enter your EPH Ember password',
        type: 'password'
      }
    }
  }
};

// GET /api/settings/schema - Get the settings schema and which fields have values
router.get('/schema', async (req, res) => {
  try {
    let envContent = '';
    try {
      envContent = await fs.readFile(envPath, 'utf-8');
    } catch (e) {
      // .env file doesn't exist yet
    }
    const env = parseEnvFile(envContent);

    // Build response with schema and isSet flags
    // Security: Never expose actual values - only indicate if they are set
    const schema = {};
    for (const [groupKey, group] of Object.entries(SETTINGS_SCHEMA)) {
      schema[groupKey] = {
        label: group.label,
        fields: {}
      };
      for (const [fieldKey, field] of Object.entries(group.fields)) {
        const value = env[fieldKey];
        const isSet = Boolean(value && value.trim() && !value.includes('your_') && !value.includes('...'));
        schema[groupKey].fields[fieldKey] = {
          ...field,
          isSet
          // Note: We no longer expose actual values for security/privacy reasons
        };
      }
    }

    res.json(schema);
  } catch (error) {
    logger.error('Failed to get settings schema:', error);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// PUT /api/settings - Update settings (only accepts new values, never returns existing)
router.put('/', async (req, res) => {
  try {
    const updates = req.body;

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    // Read existing .env content
    let envContent = '';
    try {
      envContent = await fs.readFile(envPath, 'utf-8');
    } catch (e) {
      // .env file doesn't exist, start with empty
      envContent = '# SkyeJS Configuration\n\n';
    }

    const env = parseEnvFile(envContent);

    // Validate and apply updates
    const validKeys = new Set();
    for (const group of Object.values(SETTINGS_SCHEMA)) {
      for (const key of Object.keys(group.fields)) {
        validKeys.add(key);
      }
    }

    const updatedKeys = [];
    for (const [key, value] of Object.entries(updates)) {
      if (!validKeys.has(key)) {
        logger.warn(`Attempted to update invalid setting: ${key}`);
        continue;
      }

      // Only update if value is provided (empty string clears the value)
      if (value !== undefined) {
        env[key] = String(value);
        updatedKeys.push(key);
      }
    }

    // Write back to .env file
    const newContent = serializeEnvFile(env, envContent);
    await fs.writeFile(envPath, newContent, 'utf-8');

    logger.info(`Settings updated: ${updatedKeys.join(', ')}`);

    res.json({
      success: true,
      message: `Updated ${updatedKeys.length} setting(s)`,
      updatedKeys,
      restartRequired: true
    });
  } catch (error) {
    logger.error('Failed to update settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// DELETE /api/settings/:key - Clear a specific setting
router.delete('/:key', async (req, res) => {
  try {
    const { key } = req.params;

    // Validate key
    const validKeys = new Set();
    for (const group of Object.values(SETTINGS_SCHEMA)) {
      for (const k of Object.keys(group.fields)) {
        validKeys.add(k);
      }
    }

    if (!validKeys.has(key)) {
      return res.status(400).json({ error: 'Invalid setting key' });
    }

    // Read existing .env content
    let envContent = '';
    try {
      envContent = await fs.readFile(envPath, 'utf-8');
    } catch (e) {
      return res.status(404).json({ error: 'No settings file found' });
    }

    const env = parseEnvFile(envContent);
    delete env[key];

    // Write back to .env file
    const newContent = serializeEnvFile(env, envContent);
    await fs.writeFile(envPath, newContent, 'utf-8');

    logger.info(`Setting cleared: ${key}`);

    res.json({
      success: true,
      message: `Cleared setting: ${key}`,
      restartRequired: true
    });
  } catch (error) {
    logger.error('Failed to clear setting:', error);
    res.status(500).json({ error: 'Failed to clear setting' });
  }
});

export default router;
