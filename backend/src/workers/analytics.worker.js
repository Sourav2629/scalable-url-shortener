require('dotenv').config();
const { Worker } = require('bullmq');
const mongoose = require('mongoose');
const config = require('../config');
const { logger } = require('../shared/logger');
const {
  createGracefulShutdown,
  registerCrashHandlers,
} = require('../shared/utils/graceful-shutdown');
const { analyticsRepository } = require('../modules/analytics/infrastructure/repositories/analytics.repository');
const AnalyticsService = require('../modules/analytics/application/analytics.service');

const analyticsService = new AnalyticsService(analyticsRepository);

async function startWorker() {
  logger.info('Analytics worker starting...');

  await mongoose.connect(config.database.getMongoUri());
  logger.info('Worker connected to MongoDB.');

  const worker = new Worker(
    'analytics-clicks',
    async (job) => {
      logger.info({ jobId: job.id }, 'Processing analytics job');
      await analyticsService.processClickEvent(job.data);
    },
    {
      connection: {
        url: config.redis.getUrl(),
      },
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Analytics job completed.'));
  worker.on('failed', (job, err) => logger.error({ err, jobId: job?.id }, 'Analytics job failed.'));

  // Same shutdown semantics as the HTTP server: idempotent, bounded force-exit
  // timeout, structured logging, non-zero exit on crash.
  const shutdown = createGracefulShutdown({
    log: logger,
    timeoutMs: config.server.getShutdownTimeout(),
    cleanup: async () => {
      await worker.close();
      await mongoose.disconnect();
    },
  });

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  registerCrashHandlers({ log: logger, shutdown });
}

startWorker().catch((err) => {
  logger.error({ err }, 'Analytics worker startup failed');
  process.exit(1);
});
