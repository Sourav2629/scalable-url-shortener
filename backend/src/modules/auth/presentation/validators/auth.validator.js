const AppError = require('../../../../shared/errors/app-error');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRegister(req, res, next) {
  const { name, email, password } = req.body || {};

  if (typeof name !== 'string' || name.trim().length === 0) {
    return next(new AppError('Full name is required.', 400));
  }

  if (name.trim().length > 100) {
    return next(new AppError('Full name must be 100 characters or less.', 400));
  }

  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
    return next(new AppError('A valid email address is required.', 400));
  }

  if (typeof password !== 'string' || password.length < 8) {
    return next(new AppError('Password must be at least 8 characters long.', 400));
  }

  req.body.name = name.trim();
  req.body.email = email.trim().toLowerCase();

  return next();
}

function validateLogin(req, res, next) {
  const { email, password } = req.body || {};

  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
    return next(new AppError('A valid email address is required.', 400));
  }

  if (typeof password !== 'string' || password.length < 8) {
    return next(new AppError('Password must be at least 8 characters long.', 400));
  }

  req.body.email = email.trim().toLowerCase();

  return next();
}

module.exports = { validateRegister, validateLogin };
