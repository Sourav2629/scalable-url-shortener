const config = require('./config');
const app = require('./app');
const mongoose = require('mongoose');
const { logger } = require('./shared/logger');

async function startServer() {
  try {
    const port = config.server.getPort();

    await mongoose.connect(config.database.getMongoUri());
    logger.info('MongoDB connected successfully.');

    const server = app.listen(port, () => {
      logger.info(`LinkSphere server is running at http://localhost:${port}`);
    });

    const shutdown = async (signal) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);
      
      const timeout = setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, config.server.getShutdownTimeout());

      server.close(async () => {
        logger.info('HTTP server closed.');
        try {
          await mongoose.disconnect();
          logger.info('MongoDB connection closed.');
          clearTimeout(timeout);
          process.exit(0);
        } catch (err) {
          logger.error('Error during shutdown:', err);
          process.exit(1);
        }
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

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
