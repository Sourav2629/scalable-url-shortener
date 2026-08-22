const rateLimit = require('express-rate-limit');
const config = require('../../config');

const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
      res.status(options.statusCode).json({
        message: message || options.message,
      });
    },
  });
};

const authLimiter = createRateLimiter(
  config.rateLimit.getAuthWindowMs(),
  config.rateLimit.getAuthMaxRequests(),
  'Too many authentication attempts, please try again later.'
);

const publicLimiter = createRateLimiter(
  config.rateLimit.getPublicWindowMs(),
  config.rateLimit.getPublicMaxRequests(),
  'Too many requests from this IP, please try again later.'
);

const publicShortenLimiter = createRateLimiter(
  config.rateLimit.getPublicShortenWindowMs(),
  config.rateLimit.getPublicShortenMaxRequests(),
  'Too many link creation requests, please try again later.'
);

const apiLimiter = createRateLimiter(
  config.rateLimit.getApiWindowMs(),
  config.rateLimit.getApiMaxRequests(),
  'Too many API requests, please try again later.'
);

module.exports = {
  authLimiter,
  publicLimiter,
  publicShortenLimiter,
  apiLimiter,
};
