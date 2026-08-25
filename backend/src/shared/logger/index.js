const crypto = require('crypto');
const pino = require('pino');
const pinoHttp = require('pino-http');
const config = require('../../config');

const isProduction = config.app.isProduction();
const isTest = process.env.NODE_ENV === 'test';

// Strict request-ID validation: alphanumeric start, 8-64 chars total,
// limited to [A-Za-z0-9_.-]. Anything else (spaces, HTML, oversized values)
// is rejected and replaced with a generated ID — never trusted blindly.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{7,63}$/;

function isValidRequestId(value) {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

function generateRequestId() {
  return crypto.randomUUID();
}

const logger = pino({
  level: isProduction ? 'info' : 'debug',
  // Pretty printing is for local development only. Under test it adds
  // worker-thread overhead and noise; in production structured JSON goes to stdout.
  transport:
    !isProduction && !isTest
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
          },
        }
      : undefined,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
});

const httpLogger = pinoHttp({
  logger,
  // Reuse a strictly-validated incoming X-Request-Id (e.g., set by a reverse
  // proxy) so correlation survives proxy hops; otherwise generate a fresh one.
  // The chosen ID is echoed back to the client and attached to req.log so
  // request logs, error logs, and security events all carry it.
  genReqId: (req, res) => {
    const incoming = req.headers['x-request-id'];
    const requestId = isValidRequestId(incoming) ? incoming : generateRequestId();

    res.setHeader('X-Request-Id', requestId);
    return requestId;
  },
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
  isValidRequestId,
  generateRequestId,
};
