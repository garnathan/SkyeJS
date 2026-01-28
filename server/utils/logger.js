import winston from 'winston';

// In-memory log storage for the logs API
const MAX_LOGS = 500;
const logStorage = [];

// Custom format for console
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message }) => {
    return `[${timestamp}] ${level}: ${message}`;
  })
);

// Custom format for storage
const storageFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// Custom transport to store logs in memory
class MemoryTransport extends winston.Transport {
  log(info, callback) {
    setImmediate(() => {
      // Add to storage
      logStorage.push({
        timestamp: info.timestamp || new Date().toISOString(),
        level: info.level,
        message: info.message
      });

      // Trim if exceeds max
      while (logStorage.length > MAX_LOGS) {
        logStorage.shift();
      }
    });
    callback();
  }
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: storageFormat,
  transports: [
    new winston.transports.Console({
      format: consoleFormat
    }),
    new MemoryTransport()
  ]
});

// Export log storage for the logs API
export const getLogs = (options = {}) => {
  const { minutes, level, search } = options;
  let filtered = [...logStorage];

  // Filter by time
  if (minutes) {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    filtered = filtered.filter(log => new Date(log.timestamp).getTime() > cutoff);
  }

  // Filter by level
  if (level) {
    filtered = filtered.filter(log => log.level === level.toLowerCase());
  }

  // Filter by search term
  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(log =>
      log.message.toLowerCase().includes(searchLower)
    );
  }

  // Return in reverse chronological order
  return filtered.reverse();
};

export const clearLogs = () => {
  logStorage.length = 0;
};

export const getLogStats = () => {
  const levels = {};
  logStorage.forEach(log => {
    levels[log.level] = (levels[log.level] || 0) + 1;
  });
  return { total: logStorage.length, byLevel: levels };
};

export default logger;
