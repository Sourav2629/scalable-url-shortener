require('dotenv').config();
const http = require('http');
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

  // Minimal HTTP server so Render detects an open port.
  const healthServer = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((resolve, reject) => {
    healthServer.on('error', reject);
    healthServer.listen(config.server.getPort(), () => {
      logger.info(`Health server listening on port ${config.server.getPort()}`);
      resolve();
    });
  });

  // Same shutdown semantics as the HTTP server: idempotent, bounded force-exit
  // timeout, structured logging, non-zero exit on crash.
  const shutdown = createGracefulShutdown({
    log: logger,
    timeoutMs: config.server.getShutdownTimeout(),
    cleanup: async () => {
      await new Promise((resolve) => healthServer.close(resolve));
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
