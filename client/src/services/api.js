import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('[API] Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error || error.message || 'An error occurred';
    console.error(`[API] Response error: ${message}`);
    return Promise.reject(error);
  }
);

// Dashboard API
export const dashboardApi = {
  // Stock data
  getStockData: (symbol, period = '1y') =>
    api.get('/stock-data', { params: { symbol, period } }),
  getCurrentPrice: (symbol, period = '1d') =>
    api.get('/current-price', { params: { symbol, period } }),

  // Portfolio
  getPortfolioValue: (period = '1y') => api.get('/portfolio-value', { params: { period } }),
  getCashAssetsValue: (period = '1y') => api.get('/cash-assets-value', { params: { period } }),

  // Crypto
  getXrpData: (period = '1y') => api.get('/xrp-data', { params: { period } }),
  getXrpPrice: (period = '1d') => api.get('/xrp-price', { params: { period } }),

  // Currency
  getCurrencyData: (period = '1y') => api.get('/currency-data', { params: { period } }),
  getCurrencyRate: (period = '1d') => api.get('/currency-rate', { params: { period } }),

  // Gold
  getGoldData: (period = '1y') => api.get('/gold-data', { params: { period } }),
  getGoldPrice: (period = '1d') => api.get('/gold-price', { params: { period } }),

  // Sell recommendations
  getSellRecommendation: () => api.get('/sell-recommendation'),
  getRecommendationHistory: () => api.get('/recommendation-history'),
};

// Claude API
export const claudeApi = {
  getModels: () => api.get('/claude/models'),
  getContexts: () => api.get('/claude/contexts'),
  chat: (messages, model = 'claude-sonnet-4-20250514', contexts = []) => {
    // Server expects { message, history, model, contexts } format
    const history = messages.slice(0, -1);
    const message = messages[messages.length - 1]?.content || '';
    // Ensure model is a string (not an object)
    const modelId = typeof model === 'object'
      ? (model?.name || model?.id || 'claude-sonnet-4-20250514')
      : model;
    // Extended timeout for AI chat (2 minutes)
    return api.post('/claude/chat', { message, history, model: modelId, contexts }, { timeout: 120000 });
  },
};

// Weather API
export const weatherApi = {
  getWeather: (params = {}) => api.get('/weather', { params }),
  getSunTimes: (params = {}) => api.get('/weather/sun', { params }),
  getMoonPhase: (params = {}) => api.get('/weather/moon', { params }),
  getRadar: () => api.get('/weather/radar'),
  getDefaults: () => api.get('/weather/defaults'),
};

// Todos API
export const todosApi = {
  getAll: (list) => api.get('/todos', { params: list ? { list } : {} }),
  create: (todo) => api.post('/todos', todo),
  update: (id, updates) => api.put(`/todos/${id}`, updates),
  delete: (id) => api.delete(`/todos/${id}`),
  reorder: (orderedIds, list = 'work') => api.post('/todos/reorder', { orderedIds, list }),
};

// Logs API
export const logsApi = {
  getAll: (params = {}) => api.get('/logs', { params }),
  clear: () => api.post('/logs/clear'),
};

// System API
export const systemApi = {
  restart: () => api.post('/restart'),
  health: () => api.get('/health'),
};

// Tools API
export const toolsApi = {
  calculateVrt: (data) => api.post('/tools/vrt-calculate', data),
  getExchangeRate: () => api.get('/tools/exchange-rate'),
};

// Settings API
export const settingsApi = {
  getSchema: () => api.get('/settings/schema'),
  update: (settings) => api.put('/settings', settings),
  clear: (key) => api.delete(`/settings/${key}`),
};

// Network API
export const networkApi = {
  getCurrent: (options = {}) => api.get('/network/current', { timeout: 15000, ...options }),
  getDiagnostics: () => api.get('/network/diagnostics', { timeout: 30000 }),
  getStatus: () => api.get('/network/status', { timeout: 10000 }),
  ping: (host, count = 5) => api.get('/network/ping', { params: { host, count }, timeout: 20000 }),
  getHistory: (period = '1h') => api.get(`/network/history/${period}`),
  getStats: (period = '1h') => api.get(`/network/stats/${period}`),
  getHistorySummary: () => api.get('/network/history'),
};

// Platform Health API
export const platformHealthApi = {
  getStatus: () => api.get('/platform-health/status', { timeout: 15000 }),
  getPlatformStatus: (platform) => api.get(`/platform-health/status/${platform}`, { timeout: 15000 }),
  getPlatforms: () => api.get('/platform-health/platforms'),
};

// Home Automation API
export const homeApi = {
  getDevices: () => api.get('/home/devices'),
  refresh: () => api.post('/home/refresh', {}, { timeout: 60000 }),
  setPower: (provider, deviceId, state) =>
    api.post(`/home/devices/${provider}/${deviceId}/power`, { state }),
  addTapoDevice: (ip, name, model) =>
    api.post('/home/tapo/devices', { ip, name, model }),
  removeTapoDevice: (deviceId) =>
    api.delete(`/home/tapo/devices/${deviceId}`),
  // Govee device discovery
  discoverGoveeDevices: () =>
    api.post('/home/govee/discover', {}, { timeout: 10000 }),
  // Tapo device discovery
  getSubnets: () => api.get('/home/tapo/subnets'),
  discoverTapoDevices: (additionalSubnets = []) =>
    api.post('/home/tapo/discover', { additionalSubnets }, { timeout: 120000 }),
  addDiscoveredDevices: (devices) =>
    api.post('/home/tapo/discover/add', { devices }),
  // Device groups
  getGroups: () => api.get('/home/groups'),
  createGroup: (name, deviceIds = []) =>
    api.post('/home/groups', { name, deviceIds }),
  updateGroup: (groupId, updates) =>
    api.put(`/home/groups/${groupId}`, updates),
  deleteGroup: (groupId) =>
    api.delete(`/home/groups/${groupId}`),
  setGroupPower: (groupId, state) =>
    api.post(`/home/groups/${groupId}/power`, { state }),
  // Thermostat (EPH Ember)
  getThermostat: () => api.get('/home/thermostat'),
  getThermostatZones: () => api.get('/home/thermostat/zones'),
  getThermostatZone: (zoneId) => api.get(`/home/thermostat/zones/${zoneId}`),
  setThermostatTemperature: (zoneId, temperature) =>
    api.put(`/home/thermostat/zones/${zoneId}/temperature`, { temperature }),
  activateThermostatBoost: (zoneId, temperature, hours = 1) =>
    api.post(`/home/thermostat/zones/${zoneId}/boost`, { temperature, hours }),
  deactivateThermostatBoost: (zoneId) =>
    api.delete(`/home/thermostat/zones/${zoneId}/boost`),
  setThermostatMode: (zoneId, mode) =>
    api.put(`/home/thermostat/zones/${zoneId}/mode`, { mode }),
};

export default api;
