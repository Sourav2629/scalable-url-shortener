const AppError = require('../../../../shared/errors/app-error');

function validateUpdateProfile(req, res, next) {
  const { name } = req.body || {};

  if (typeof name !== 'string' || name.trim().length === 0) {
    return next(new AppError('Full name is required.', 400));
  }

  if (name.trim().length > 100) {
    return next(new AppError('Full name must be 100 characters or less.', 400));
  }

  // Only allow name to be updated — strip any other fields
  req.body = { name: name.trim() };

  return next();
}

function validateChangePassword(req, res, next) {
  const { currentPassword, newPassword } = req.body || {};

  if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
    return next(new AppError('Current password is required.', 400));
  }

  if (typeof newPassword !== 'string' || newPassword.trim().length < 8) {
    return next(new AppError('New password must be at least 8 characters long.', 400));
  }

  req.body = {
    currentPassword,
    newPassword: newPassword.trim(),
  };

  return next();
}

function validateDeleteAccount(req, res, next) {
  const { password } = req.body || {};

  if (typeof password !== 'string' || password.length === 0) {
    return next(new AppError('Password is required to delete your account.', 400));
  }

  req.body = { password };

  return next();
}

module.exports = {
  validateUpdateProfile,
  validateChangePassword,
  validateDeleteAccount,
};
