const cors = require('cors');
const config = require('../../config');

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = config.cors.getAllowedOrigins();
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins === '*') {
      if (config.app.isProduction()) {
        return callback(new Error('Wildcard CORS is not allowed in production'), false);
      }
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

const corsMiddleware = cors(corsOptions);

module.exports = { corsMiddleware };
