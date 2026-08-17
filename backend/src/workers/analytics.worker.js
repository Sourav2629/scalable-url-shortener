require('dotenv').config();
const { Worker } = require('bullmq');
const mongoose = require('mongoose');
const config = require('../config');
const { analyticsRepository } = require('../modules/analytics/infrastructure/repositories/analytics.repository');
const AnalyticsService = require('../modules/analytics/application/analytics.service');

const analyticsService = new AnalyticsService(analyticsRepository);

async function startWorker() {
  console.log('Analytics worker starting...');

  await mongoose.connect(config.database.getMongoUri());
  console.log('Connected to MongoDB.');

  const worker = new Worker(
    'analytics-clicks',
    async (job) => {
      console.log(`Processing job ${job.id}`);
      await analyticsService.processClickEvent(job.data);
    },
    {
      connection: {
        url: config.redis.getUrl(),
      },
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => console.log(`Job ${job.id} completed.`));
  worker.on('failed', (job, err) => console.error(`Job ${job.id} failed:`, err));

  const shutdown = async () => {
    console.log('Shutting down worker...');
    await worker.close();
    await mongoose.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startWorker().catch((err) => {
  console.error('Worker startup failed:', err);
  process.exit(1);
});
