const mongoose = require('mongoose');
const AnalyticsEvent = require('../models/analytics-event.model');

class AnalyticsRepository {
  async create(eventData) {
    return AnalyticsEvent.create(eventData);
  }

  async getSummary(urlId) {
    const objectId = typeof urlId === 'string' ? new mongoose.Types.ObjectId(urlId) : urlId;
    return AnalyticsEvent.aggregate([
      { $match: { urlId: objectId } },
      {
        $group: {
          _id: null,
          totalClicks: { $sum: 1 },
          topBrowsers: { $push: '$metadata.browser' },
          topOS: { $push: '$metadata.os' },
          topDevices: { $push: '$metadata.deviceType' },
          topSources: { $push: '$metadata.trafficSource' },
        },
      },
    ]);
  }

  async getTimeseries(urlId, from, to, interval) {
    const objectId = typeof urlId === 'string' ? new mongoose.Types.ObjectId(urlId) : urlId;
    const format = interval === 'day' ? '%Y-%m-%d' : '%Y-%m-%d %H';
    return AnalyticsEvent.aggregate([
      { $match: { urlId: objectId, timestamp: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { $dateToString: { format, date: '$timestamp' } },
          clicks: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }
}

module.exports = { analyticsRepository: new AnalyticsRepository() };
