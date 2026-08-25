const rateLimit = require('express-rate-limit');
const config = require('../../config');
const { logSecurityEvent } = require('../logger/security-event');

const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
      logSecurityEvent('security.rate_limit.exceeded', {
        requestId: req.id,
        ip: req.ip,
        method: req.method,
        path: req.originalUrl || req.url,
      });

      res.status(options.statusCode).json({
        message: message || options.message,
      });
    },
  });
};

// ─── Auth Endpoint Limiters ───────────────────────────────────

const loginLimiter = createRateLimiter(
  config.rateLimit.getLoginWindowMs(),
  config.rateLimit.getLoginMaxRequests(),
  'Too many login attempts, please try again later.'
);

const registerLimiter = createRateLimiter(
  config.rateLimit.getRegisterWindowMs(),
  config.rateLimit.getRegisterMaxRequests(),
  'Too many registration attempts, please try again later.'
);

const otpLimiter = createRateLimiter(
  config.rateLimit.getOtpWindowMs(),
  config.rateLimit.getOtpMaxRequests(),
  'Too many verification attempts, please try again later.'
);

const passwordResetLimiter = createRateLimiter(
  config.rateLimit.getPasswordResetWindowMs(),
  config.rateLimit.getPasswordResetMaxRequests(),
  'Too many password reset requests, please try again later.'
);

const resendLimiter = createRateLimiter(
  config.rateLimit.getResendWindowMs(),
  config.rateLimit.getResendMaxRequests(),
  'Too many resend requests, please try again later.'
);

const sessionLimiter = createRateLimiter(
  config.rateLimit.getSessionWindowMs(),
  config.rateLimit.getSessionMaxRequests(),
  'Too many requests, please try again later.'
);

const changePasswordLimiter = createRateLimiter(
  config.rateLimit.getChangePasswordWindowMs(),
  config.rateLimit.getChangePasswordMaxRequests(),
  'Too many password change attempts, please try again later.'
);

const deleteAccountLimiter = createRateLimiter(
  config.rateLimit.getDeleteAccountWindowMs(),
  config.rateLimit.getDeleteAccountMaxRequests(),
  'Too many account deletion attempts, please try again later.'
);

const refreshLimiter = createRateLimiter(
  config.rateLimit.getRefreshWindowMs(),
  config.rateLimit.getRefreshMaxRequests(),
  'Too many token refresh attempts, please try again later.'
);

// ─── Public Endpoint Limiters ─────────────────────────────────

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

// ─── Authenticated API Limiter ────────────────────────────────

const apiLimiter = createRateLimiter(
  config.rateLimit.getApiWindowMs(),
  config.rateLimit.getApiMaxRequests(),
  'Too many API requests, please try again later.'
);

module.exports = {
  // Auth endpoint limiters
  loginLimiter,
  registerLimiter,
  otpLimiter,
  passwordResetLimiter,
  resendLimiter,
  sessionLimiter,
  changePasswordLimiter,
  deleteAccountLimiter,
  refreshLimiter,
  // Public limiters
  publicLimiter,
  publicShortenLimiter,
  // Authenticated API
  apiLimiter,
};
