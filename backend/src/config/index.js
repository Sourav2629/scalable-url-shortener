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

const config = {
  app: {
    getNodeEnv: () => getOptionalEnvironmentVariable('NODE_ENV', 'development'),
    isProduction: () => getOptionalEnvironmentVariable('NODE_ENV', 'development') === 'production',
  },
  server: {
    getPort,
    getShutdownTimeout: () => parseInt(getOptionalEnvironmentVariable('SHUTDOWN_TIMEOUT', '10000'), 10),
  },
  cors: {
    getAllowedOrigins: () => {
      const origins = getOptionalEnvironmentVariable('CORS_ALLOWED_ORIGINS', '*');
      return origins === '*' ? '*' : origins.split(',').map(o => o.trim());
    },
  },
  rateLimit: {
    getAuthMaxRequests: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_AUTH_MAX', '10'), 10),
    getAuthWindowMs: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_AUTH_WINDOW_MS', '900000'), 10), // 15 mins
    getPublicMaxRequests: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_PUBLIC_MAX', '100'), 10),
    getPublicWindowMs: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_PUBLIC_WINDOW_MS', '60000'), 10), // 1 min
    getPublicShortenMaxRequests: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_PUBLIC_SHORTEN_MAX', '10'), 10),
    getPublicShortenWindowMs: () => parseInt(getOptionalEnvironmentVariable('RATE_LIMIT_PUBLIC_SHORTEN_WINDOW_MS', '60000'), 10), // 1 min
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
};

module.exports = config;
