const pino = require('pino');
const pinoHttp = require('pino-http');
const config = require('../../config');

const isProduction = config.app.isProduction();

const logger = pino({
  level: isProduction ? 'info' : 'debug',
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
        },
      },
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
});

const httpLogger = pinoHttp({
  logger,
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) {
      return 'error';
    }
    if (res.statusCode >= 400) {
      return 'warn';
    }
    return 'info';
  },
  autoLogging: {
    ignore: (req) => {
      // Don't log health checks to avoid spam
      return req.url.startsWith('/health');
    },
  },
});

module.exports = {
  logger,
  httpLogger,
};
