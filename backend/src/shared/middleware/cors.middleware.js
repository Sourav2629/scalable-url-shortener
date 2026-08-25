const cors = require('cors');
const config = require('../../config');
const AppError = require('../errors/app-error');

// The application authenticates with Authorization Bearer tokens, not cookies,
// so credentialed cross-origin requests are neither needed nor allowed.
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = config.cors.getAllowedOrigins();

    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins === '*') {
      if (config.app.isProduction()) {
        return callback(
          new AppError('Wildcard CORS is not allowed in production', 403),
          false
        );
      }
      return callback(null, true);
    }

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // AppError carries a statusCode so the global error handler responds
      // with a clean JSON 403 instead of an unclassified 500.
      callback(new AppError('Not allowed by CORS', 403));
    }
  },
  credentials: false,
};

const corsMiddleware = cors(corsOptions);

module.exports = { corsMiddleware };
