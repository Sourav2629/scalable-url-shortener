const jwt = require('jsonwebtoken');
const config = require('../../../../config');

function createToken(userId, secret, expiresIn) {
  return jwt.sign({ sub: userId.toString() }, secret, { expiresIn });
}

function generateAccessToken(userId) {
  return createToken(
    userId,
    config.auth.getAccessTokenSecret(),
    config.auth.getAccessTokenExpiresIn(),
  );
}

function generateRefreshToken(userId) {
  return createToken(
    userId,
    config.auth.getRefreshTokenSecret(),
    config.auth.getRefreshTokenExpiresIn(),
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, config.auth.getAccessTokenSecret());
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
};
