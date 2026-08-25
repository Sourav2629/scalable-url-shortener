require('dotenv').config();

function getRequiredEnvironmentVariable(name) {
  const value = process.env[name];

  if (!value || !value.trim()) {
    throw new Error(`${name} environment variable is required.`);
  }

  return value;
}

function getPort() {
  const value = process.env.PORT;

  if (value === undefined) {
    return 5000;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT environment variable must be an integer between 1 and 65535.');
  }

  return port;
}

function getOptionalEnvironmentVariable(name, defaultValue) {
  const value = process.env[name];

  return value && value.trim() ? value : defaultValue;
}

function parseTrustProxy(value) {
  if (value === 'false' || value === '') return false;
  if (value === 'true') return true;
  const num = Number(value);
  if (Number.isInteger(num) && num >= 0) return num;
  throw new Error(
    `TRUST_PROXY must be 'false', 'true', or a non-negative integer. Received: '${value}'`
  );
}

// ─── Production secret hardening ──────────────────────────────────
// Enforced ONLY when NODE_ENV=production. Development/test are unaffected.
// Fails fast during configuration loading so a misconfigured production
// deployment can never start.

const JWT_SECRET_MIN_LENGTH = 32;
const KNOWN_WEAK_SECRETS = new Set([
  'secret',
  'changeme',
  'password',
  'jwt_secret',
  'change_me',
  'your-secret-key',
  'supersecret',
]);

function assertStrongJwtSecret(name, value) {
  if (value.length < JWT_SECRET_MIN_LENGTH) {
    throw new Error(
      `${name} must be at least ${JWT_SECRET_MIN_LENGTH} characters long in production.`
    );
  }

  if (KNOWN_WEAK_SECRETS.has(value.toLowerCase())) {
    throw new Error(
      `${name} is a known-weak value and is rejected in production. Generate a cryptographically random secret instead.`
    );
  }
}

function validateProductionSecrets() {
  if (getOptionalEnvironmentVariable('NODE_ENV', 'development') !== 'production') {
    return;
  }

  const accessSecret = getRequiredEnvironmentVariable('JWT_ACCESS_SECRET');
  const refreshSecret = getRequiredEnvironmentVariable('JWT_REFRESH_SECRET');

  assertStrongJwtSecret('JWT_ACCESS_SECRET', accessSecret);
  assertStrongJwtSecret('JWT_REFRESH_SECRET', refreshSecret);

  if (accessSecret === refreshSecret) {
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values.'
    );
  }
}

const config = {
  app: {
    getNodeEnv: () => getOptionalEnvironmentVariable('NODE_ENV', 'development'),
    isProduction: () => getOptionalEnvironmentVariable('NODE_ENV', 'development') === 'production',
  },
  server: {
    getPort,
    getShutdownTimeout: () => parseInt(getOptionalEnvironmentVariable('SHUTDOWN_TIMEOUT', '10000'), 10),
    getTrustProxy: () => parseTrustProxy(getOptionalEnvironmentVariable('TRUST_PROXY', 'false')),
  },
  cors: {
    getAllowedOrigins: () => {
      const origins = getOptionalEnvironmentVariable('CORS_ALLOWED_ORIGINS', '*');
      return origins === '*' ? '*' : origins.split(',').map(o => o.trim());
    },
  },
  rateLimit: {
    // Login
    getLoginMaxRequests: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_LOGIN_MAX', '10'), 10),
    getLoginWindowMs: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_LOGIN_WINDOW_MS', '900000'), 10), // 15 mins
    // Register
    getRegisterMaxRequests: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_REGISTER_MAX', '5'), 10),
    getRegisterWindowMs: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_REGISTER_WINDOW_MS', '900000'), 10), // 15 mins
    // OTP / Verification
    getOtpMaxRequests: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_OTP_MAX', '10'), 10),
    getOtpWindowMs: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_OTP_WINDOW_MS', '900000'), 10), // 15 mins
    // Password Reset (forgot-password + resend-password-reset)
    getPasswordResetMaxRequests: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_PASSWORD_RESET_MAX', '5'), 10),
    getPasswordResetWindowMs: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_PASSWORD_RESET_WINDOW_MS', '900000'), 10), // 15 mins
    // Resend Verification
    getResendMaxRequests: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_RESEND_MAX', '5'), 10),
    getResendWindowMs: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_RESEND_WINDOW_MS', '900000'), 10), // 15 mins
    // Session / Low-risk authenticated ops (me, logout, profile)
    getSessionMaxRequests: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_SESSION_MAX', '60'), 10),
    getSessionWindowMs: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_SESSION_WINDOW_MS', '900000'), 10), // 15 mins
    // Change Password
    getChangePasswordMaxRequests: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_CHANGE_PASSWORD_MAX', '10'), 10),
    getChangePasswordWindowMs: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_CHANGE_PASSWORD_WINDOW_MS', '900000'), 10), // 15 mins
    // Delete Account
    getDeleteAccountMaxRequests: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_DELETE_ACCOUNT_MAX', '5'), 10),
    getDeleteAccountWindowMs: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_DELETE_ACCOUNT_WINDOW_MS', '900000'), 10), // 15 mins
    // Refresh Token
    getRefreshMaxRequests: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_REFRESH_MAX', '20'), 10),
    getRefreshWindowMs: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_REFRESH_WINDOW_MS', '900000'), 10), // 15 mins
    // Public (redirect)
    getPublicMaxRequests: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_PUBLIC_MAX', '100'), 10),
    getPublicWindowMs: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_PUBLIC_WINDOW_MS', '60000'), 10), // 1 min
    // Public shorten
    getPublicShortenMaxRequests: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_PUBLIC_SHORTEN_MAX', '10'), 10),
    getPublicShortenWindowMs: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_PUBLIC_SHORTEN_WINDOW_MS', '60000'), 10), // 1 min
    // Authenticated API (URLs, analytics)
    getApiMaxRequests: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_API_MAX', '300'), 10),
    getApiWindowMs: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_API_WINDOW_MS', '900000'), 10), // 15 mins
  },
  database: {
    getMongoUri: () => getRequiredEnvironmentVariable('MONGODB_URI'),
  },
  auth: {
    getAccessTokenSecret: () => getRequiredEnvironmentVariable('JWT_ACCESS_SECRET'),
    getRefreshTokenSecret: () => getRequiredEnvironmentVariable('JWT_REFRESH_SECRET'),
    getAccessTokenExpiresIn: () =>
      getOptionalEnvironmentVariable('JWT_ACCESS_TOKEN_EXPIRES_IN', '15m'),
    getRefreshTokenExpiresIn: () =>
      getOptionalEnvironmentVariable('JWT_REFRESH_TOKEN_EXPIRES_IN', '7d'),
  },
  redis: {
    getUrl: () => getOptionalEnvironmentVariable('REDIS_URL', 'redis://localhost:6379'),
  },
  email: {
    getProvider: () => getOptionalEnvironmentVariable('EMAIL_PROVIDER', 'brevo'),
    getFromEmail: () => getOptionalEnvironmentVariable('EMAIL_FROM_EMAIL', 'noreply@linksphere.app'),
    getFromName: () => getOptionalEnvironmentVariable('EMAIL_FROM_NAME', 'LinkSphere'),
    getBrevoApiKey: () => getOptionalEnvironmentVariable('BREVO_API_KEY', ''),
    getBrevoApiUrl: () => getOptionalEnvironmentVariable('BREVO_API_URL', 'https://api.brevo.com/v3'),
  },
};

// Fail fast in production with weak or missing JWT secrets.
validateProductionSecrets();

module.exports = config;
