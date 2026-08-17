const { analyticsQueue } = require('../../../infrastructure/queue/analytics.queue');
const { logger } = require('../../../shared/logger');

class AnalyticsPublisher {
  async publishClickEvent(event) {
    try {
      await analyticsQueue.add('click-event', event, {
        jobId: event.eventId,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: 100,
      });
    } catch (error) {
      if (logger && logger.error) {
        logger.error({ err: error, eventId: event.eventId }, 'Failed to publish analytics event');
      } else {
        console.error('Failed to publish analytics event:', error);
      }
      // We do not re-throw here to ensure the redirect flow is isolated from queue failures.
    }
  }
}

module.exports = AnalyticsPublisher;
