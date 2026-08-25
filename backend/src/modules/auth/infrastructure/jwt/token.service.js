const jwt = require('jsonwebtoken');
const config = require('../../../../config');

function createToken(userId, secret, expiresIn, type) {
  return jwt.sign({ sub: userId.toString(), type }, secret, { expiresIn });
}

function generateAccessToken(userId) {
  return createToken(
    userId,
    config.auth.getAccessTokenSecret(),
    config.auth.getAccessTokenExpiresIn(),
    'access',
  );
}

function generateRefreshToken(userId) {
  return createToken(
    userId,
    config.auth.getRefreshTokenSecret(),
    config.auth.getRefreshTokenExpiresIn(),
    'refresh',
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, config.auth.getAccessTokenSecret());
}

function verifyRefreshToken(token) {
  const payload = jwt.verify(token, config.auth.getRefreshTokenSecret());

  if (payload.type !== 'refresh') {
    throw new Error('Invalid token type');
  }

  return payload;
}

/**
 * Calculate the absolute Date when a refresh token expires,
 * based on the same TTL used by JWT_REFRESH_TOKEN_EXPIRES_IN.
 */
function getRefreshTokenExpiryDate() {
  const expiresIn = config.auth.getRefreshTokenExpiresIn();
  // Parse the ms notation used by jsonwebtoken (e.g. '7d', '24h', '604800s')
  // For ms-style strings like '7d', we convert manually
  if (typeof expiresIn === 'number') {
    return new Date(Date.now() + expiresIn * 1000);
  }

  const str = String(expiresIn).trim();
  // Handle numeric string (seconds)
  if (/^\d+$/.test(str)) {
    return new Date(Date.now() + parseInt(str, 10) * 1000);
  }

  // Handle unit suffixes: s, m, h, d, w
  const match = str.match(/^(\d+)\s*(s|m|h|d|w)$/);
  if (match) {
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers = { s: 1000, m: 60 * 1000, h: 3600 * 1000, d: 86400 * 1000, w: 604800 * 1000 };
    return new Date(Date.now() + value * multipliers[unit]);
  }

  // Fallback: let jsonwebtoken interpret it, or default to 7 days
  return new Date(Date.now() + 7 * 86400 * 1000);
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  getRefreshTokenExpiryDate,
};
