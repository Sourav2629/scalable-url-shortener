const config = require('./config');
const app = require('./app');
const mongoose = require('mongoose');
const { logger } = require('./shared/logger');
const {
  createGracefulShutdown,
  registerCrashHandlers,
} = require('./shared/utils/graceful-shutdown');

async function startServer() {
  try {
    const port = config.server.getPort();

    await mongoose.connect(config.database.getMongoUri());
    logger.info('MongoDB connected successfully.');

    const server = app.listen(port, () => {
      logger.info(`LinkSphere server is running at http://localhost:${port}`);
    });

    // Single shared shutdown path for signals AND crashes. Idempotent, with
    // the existing force-exit safety timeout preserved.
    const shutdown = createGracefulShutdown({
      log: logger,
      timeoutMs: config.server.getShutdownTimeout(),
      closeServer: (done) => server.close(done),
      cleanup: async () => {
        logger.info('HTTP server closed.');
        await mongoose.disconnect();
        logger.info('MongoDB connection closed.');
      },
    });

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    registerCrashHandlers({ log: logger, shutdown });

    server.on('error', (error) => {
      logger.error(`Failed to start LinkSphere server: ${error.message}`);
      process.exit(1);
    });
  } catch (error) {
    logger.error(`LinkSphere startup failed: ${error.message}`);
    process.exit(1);
  }
}

startServer();
