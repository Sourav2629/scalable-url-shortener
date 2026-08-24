const AppError = require('../../../../shared/errors/app-error');
const tokenService = require('../../infrastructure/jwt/token.service');
const UserRepository = require('../../../users/infrastructure/repositories/user.repository');

const userRepository = new UserRepository();

async function authenticate(req, res, next) {
  const authorization = req.get('authorization');

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return next(new AppError('Authentication is required.', 401));
  }

  const token = authorization.slice('Bearer '.length);

  try {
    const payload = tokenService.verifyAccessToken(token);

    if (!payload.sub) {
      throw new AppError('Invalid access token.', 401);
    }

    // Verify the user still exists and is email-verified
    const user = await userRepository.findById(payload.sub);

    if (!user) {
      throw new AppError('Authentication is required.', 401);
    }

    if (!user.isEmailVerified) {
      throw new AppError('Email verification required.', 403);
    }

    req.auth = { userId: payload.sub };
    return next();
  } catch (error) {
    const authenticationError =
      error instanceof AppError ? error : new AppError('Invalid or expired access token.', 401);

    return next(authenticationError);
  }
}

module.exports = { authenticate };
