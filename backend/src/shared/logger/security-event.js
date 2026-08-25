const { logger } = require('./index');

/**
 * Log a structured security event.
 *
 * Events are emitted at info level with a consistent shape:
 *   { event: "auth.login.failed", userId, email, requestId, ip, reason }
 *
 * SECURITY RULES:
 * - NEVER pass passwords, password hashes, OTPs, OTP hashes, access tokens,
 *   refresh tokens, JWTs, Authorization headers, cookies, reset/verification
 *   tokens, API keys, or full request bodies into `meta`.
 * - Only include identifiers useful for investigation (userId, email, ip,
 *   requestId, route, reason).
 *
 * @param {string} event - Dot-separated event name, e.g. "auth.login.failed"
 * @param {Object} [meta] - Additional structured metadata
 */
function logSecurityEvent(event, meta = {}) {
  const fields = { event };

  for (const [key, value] of Object.entries(meta)) {
    if (value !== undefined && value !== null) {
      fields[key] = value;
    }
  }

  logger.info(fields, event);
}

module.exports = { logSecurityEvent };
