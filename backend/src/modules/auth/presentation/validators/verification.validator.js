const AppError = require('../../../../shared/errors/app-error');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_PATTERN = /^\d{6}$/;

function validateVerifyEmail(req, res, next) {
  const { email, code } = req.body || {};

  if (typeof email !== 'string') {
    return next(new AppError('A valid email address is required.', 400));
  }

  const trimmedEmail = email.trim();

  if (trimmedEmail.length === 0 || !EMAIL_PATTERN.test(trimmedEmail)) {
    return next(new AppError('A valid email address is required.', 400));
  }

  const normalizedEmail = trimmedEmail.toLowerCase();

  if (normalizedEmail.includes('..')) {
    return next(new AppError('A valid email address is required.', 400));
  }

  if (typeof code !== 'string') {
    return next(new AppError('A valid 6-digit verification code is required.', 400));
  }

  const trimmedCode = code.trim();

  if (!OTP_PATTERN.test(trimmedCode)) {
    return next(new AppError('A valid 6-digit verification code is required.', 400));
  }

  req.body.email = normalizedEmail;
  req.body.code = trimmedCode;

  return next();
}

function validateResendVerification(req, res, next) {
  const { email } = req.body || {};

  if (typeof email !== 'string') {
    return next(new AppError('A valid email address is required.', 400));
  }

  const trimmedEmail = email.trim();

  if (trimmedEmail.length === 0 || !EMAIL_PATTERN.test(trimmedEmail)) {
    return next(new AppError('A valid email address is required.', 400));
  }

  const normalizedEmail = trimmedEmail.toLowerCase();

  if (normalizedEmail.includes('..')) {
    return next(new AppError('A valid email address is required.', 400));
  }

  req.body.email = normalizedEmail;

  return next();
}

function validateForgotPassword(req, res, next) {
  const { email } = req.body || {};

  if (typeof email !== 'string') {
    return next(new AppError('A valid email address is required.', 400));
  }

  const trimmedEmail = email.trim();

  if (trimmedEmail.length === 0 || !EMAIL_PATTERN.test(trimmedEmail)) {
    return next(new AppError('A valid email address is required.', 400));
  }

  const normalizedEmail = trimmedEmail.toLowerCase();

  if (normalizedEmail.includes('..')) {
    return next(new AppError('A valid email address is required.', 400));
  }

  req.body.email = normalizedEmail;

  return next();
}

function validateResetPassword(req, res, next) {
  const { email, code, newPassword } = req.body || {};

  // Validate email
  if (typeof email !== 'string') {
    return next(new AppError('A valid email address is required.', 400));
  }

  const trimmedEmail = email.trim();

  if (trimmedEmail.length === 0 || !EMAIL_PATTERN.test(trimmedEmail)) {
    return next(new AppError('A valid email address is required.', 400));
  }

  const normalizedEmail = trimmedEmail.toLowerCase();

  if (normalizedEmail.includes('..')) {
    return next(new AppError('A valid email address is required.', 400));
  }

  // Validate OTP code
  if (typeof code !== 'string') {
    return next(new AppError('A valid 6-digit reset code is required.', 400));
  }

  const trimmedCode = code.trim();

  if (!OTP_PATTERN.test(trimmedCode)) {
    return next(new AppError('A valid 6-digit reset code is required.', 400));
  }

  // Validate new password
  if (typeof newPassword !== 'string' || newPassword.trim().length < 8) {
    return next(new AppError('Password must be at least 8 characters long.', 400));
  }

  req.body.email = normalizedEmail;
  req.body.code = trimmedCode;
  req.body.newPassword = newPassword.trim();

  return next();
}

function validateResendPasswordReset(req, res, next) {
  const { email } = req.body || {};

  if (typeof email !== 'string') {
    return next(new AppError('A valid email address is required.', 400));
  }

  const trimmedEmail = email.trim();

  if (trimmedEmail.length === 0 || !EMAIL_PATTERN.test(trimmedEmail)) {
    return next(new AppError('A valid email address is required.', 400));
  }

  const normalizedEmail = trimmedEmail.toLowerCase();

  if (normalizedEmail.includes('..')) {
    return next(new AppError('A valid email address is required.', 400));
  }

  req.body.email = normalizedEmail;

  return next();
}

module.exports = { validateVerifyEmail, validateResendVerification, validateForgotPassword, validateResetPassword, validateResendPasswordReset };
