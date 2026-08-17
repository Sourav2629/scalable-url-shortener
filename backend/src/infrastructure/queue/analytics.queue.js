const { Queue } = require('bullmq');
const config = require('../../config');

let analyticsQueue;

if (process.env.NODE_ENV === 'test') {
  analyticsQueue = {
    add: async () => {},
  };
} else {
  const redisUrl = config.redis.getUrl();
  analyticsQueue = new Queue('analytics-clicks', {
    connection: {
      url: redisUrl,
    },
  });
}

module.exports = {
  analyticsQueue,
};
