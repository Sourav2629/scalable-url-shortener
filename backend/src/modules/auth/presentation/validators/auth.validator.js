const AppError = require('../../../../shared/errors/app-error');

// Email pattern: standard local@domain.tld structure.
// Rejects: missing @, missing dot, whitespace, consecutive dots.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate and normalize an email address.
 * Returns the normalized email string or throws an AppError via the next callback.
 */
function validateAndNormalizeEmail(email, next) {
  if (typeof email !== 'string') {
    return next(new AppError('A valid email address is required.', 400));
  }

  const trimmed = email.trim();

  if (trimmed.length === 0 || !EMAIL_PATTERN.test(trimmed)) {
    return next(new AppError('A valid email address is required.', 400));
  }

  const normalized = trimmed.toLowerCase();

  // Reject consecutive dots in the local or domain part.
  if (normalized.includes('..')) {
    return next(new AppError('A valid email address is required.', 400));
  }

  return normalized;
}

function validateRegister(req, res, next) {
  const { name, email, password } = req.body || {};

  if (typeof name !== 'string' || name.trim().length === 0) {
    return next(new AppError('Full name is required.', 400));
  }

  if (name.trim().length > 100) {
    return next(new AppError('Full name must be 100 characters or less.', 400));
  }

  const normalizedEmail = validateAndNormalizeEmail(email, next);
  if (normalizedEmail === undefined) return; // error already forwarded via next()

  if (typeof password !== 'string' || password.trim().length < 8) {
    return next(new AppError('Password must be at least 8 characters long.', 400));
  }

  req.body.name = name.trim();
  req.body.email = normalizedEmail;

  return next();
}

function validateLogin(req, res, next) {
  const { email, password } = req.body || {};

  const normalizedEmail = validateAndNormalizeEmail(email, next);
  if (normalizedEmail === undefined) return; // error already forwarded via next()

  if (typeof password !== 'string' || password.trim().length < 8) {
    return next(new AppError('Password must be at least 8 characters long.', 400));
  }

  req.body.email = normalizedEmail;

  return next();
}

function validateRefreshToken(req, res, next) {
  const { refreshToken } = req.body || {};

  if (typeof refreshToken !== 'string' || refreshToken.trim().length === 0) {
    return next(new AppError('A refresh token is required.', 400));
  }

  req.body.refreshToken = refreshToken.trim();

  return next();
}

module.exports = { validateRegister, validateLogin, validateRefreshToken };
