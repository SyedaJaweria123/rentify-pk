'use strict';
/**
 * Rate Limiter Middleware — Rentify
 * In-memory rate limiting (replace with Redis in production for multi-instance).
 */

const store = new Map(); // key -> { count, resetAt }

const createLimiter = ({ windowMs, max, message }) => {
  return (req, res, next) => {
    const key = req.ip + ':' + req.path;
    const now = Date.now();

    let entry = store.get(key);

    if (!entry || entry.resetAt < now) {
      entry = { count: 1, resetAt: now + windowMs };
      store.set(key, entry);
      return next();
    }

    entry.count++;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', retryAfter);
      return res.status(429).json({
        success: false,
        message: message || 'Too many requests. Please try again later.',
        retryAfter,
      });
    }

    next();
  };
};

// Periodic cleanup (every 5 min)
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of store.entries()) {
    if (val.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

module.exports = {
  // Strict limiter for auth endpoints
  authLimiter: createLimiter({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 200,
    message: 'Too many authentication attempts. Please try again in 15 minutes.',
  }),

  // General API limiter
  apiLimiter: createLimiter({
    windowMs: 60 * 1000, // 1 min
    max: 2000,
    message: 'Too many requests. Please slow down.',
  }),

  // Booking creation limiter
  bookingLimiter: createLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 500,
    message: 'Too many booking requests. Please try again in an hour.',
  }),

  // Message sending limiter
  messageLimiter: createLimiter({
    windowMs: 60 * 1000, // 1 min
    max: 30,
    message: 'Sending too fast. Please slow down.',
  }),
};
