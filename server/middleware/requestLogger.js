import logger from '../utils/logger.js';

export const requestLogger = (req, res, next) => {
  const start = Date.now();

  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - start;
    const { method, originalUrl } = req;
    const { statusCode } = res;

    // Skip health checks and static files
    if (originalUrl === '/health' || originalUrl.startsWith('/assets')) {
      return;
    }

    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    logger[level](`${method} ${originalUrl} ${statusCode} ${duration}ms`);
  });

  next();
};
