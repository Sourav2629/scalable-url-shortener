const { randomBytes } = require('crypto');

function generateShortCode(length = 8) {
  const byteLength = Math.ceil((length * 3) / 4);

  return randomBytes(byteLength).toString('base64url').slice(0, length);
}

module.exports = generateShortCode;
