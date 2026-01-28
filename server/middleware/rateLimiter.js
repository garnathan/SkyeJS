/**
 * Simple in-memory rate limiter for localhost use
 * No need for Redis or external dependencies for a local-only app
 */

// Store request counts per endpoint per IP
const requestCounts = new Map();

// Clean up old entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of requestCounts.entries()) {
    if (now - data.windowStart > 60000) {
      requestCounts.delete(key);
    }
  }
}, 60000);

/**
 * Create a rate limiter middleware
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds (default: 60000 = 1 minute)
 * @param {number} options.max - Max requests per window (default: 60)
 * @param {string} options.message - Error message when rate limited
 */
export const createRateLimiter = (options = {}) => {
  const {
    windowMs = 60000,
    max = 60,
    message = 'Too many requests, please try again later'
  } = options;

  return (req, res, next) => {
    // Use IP + path as key (allows different limits per endpoint)
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const key = `${ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();

    let data = requestCounts.get(key);

    if (!data || now - data.windowStart > windowMs) {
      // Start new window
      data = { count: 1, windowStart: now };
      requestCounts.set(key, data);
    } else {
      data.count++;
    }

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - data.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil((data.windowStart + windowMs) / 1000));

    if (data.count > max) {
      return res.status(429).json({
        error: message,
        retryAfter: Math.ceil((data.windowStart + windowMs - now) / 1000)
      });
    }

    next();
  };
};

// Pre-configured rate limiters for different use cases
export const standardLimiter = createRateLimiter({
  windowMs: 60000,
  max: 60,
  message: 'Too many requests, please try again later'
});

// Strict limiter for expensive operations (API calls, downloads)
export const strictLimiter = createRateLimiter({
  windowMs: 60000,
  max: 10,
  message: 'Rate limit exceeded for this resource-intensive operation'
});

// Very strict limiter for diagnostics and heavy operations
export const heavyLimiter = createRateLimiter({
  windowMs: 60000,
  max: 5,
  message: 'This operation can only be performed 5 times per minute'
});

export default {
  createRateLimiter,
  standardLimiter,
  strictLimiter,
  heavyLimiter
};
