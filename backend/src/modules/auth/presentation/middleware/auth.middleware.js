const AppError = require('../../../../shared/errors/app-error');
const tokenService = require('../../infrastructure/jwt/token.service');

function authenticate(req, res, next) {
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

    req.auth = { userId: payload.sub };
    return next();
  } catch (error) {
    const authenticationError =
      error instanceof AppError ? error : new AppError('Invalid or expired access token.', 401);

    return next(authenticationError);
  }
}

module.exports = { authenticate };
