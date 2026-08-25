const mongoose = require('mongoose');
const AnalyticsEvent = require('../models/analytics-event.model');

// Maximum number of distinct values returned per breakdown dimension.
// Must match the top-N slice previously applied in AnalyticsService.
const TOP_VALUES_LIMIT = 5;

function buildTopValuesPipeline(field) {
  return [
    { $group: { _id: field, clicks: { $sum: 1 } } },
    { $sort: { clicks: -1, _id: 1 } },
    { $limit: TOP_VALUES_LIMIT },
  ];
}

class AnalyticsRepository {
  async create(eventData) {
    return AnalyticsEvent.create(eventData);
  }

  /**
   * Computes per-dimension click breakdowns entirely inside MongoDB.
   *
   * Grouping/counting happens server-side via $facet + $group so memory usage
   * is bounded by the number of DISTINCT values (capped at TOP_VALUES_LIMIT
   * rows per dimension), NOT by the number of click events for the URL.
   *
   * Returns a single object:
   * { browsers, operatingSystems, devices, trafficSources }
   * where each dimension is [{ _id, clicks }] sorted by clicks desc, top N.
   */
  async getSummary(urlId) {
    const objectId = typeof urlId === 'string' ? new mongoose.Types.ObjectId(urlId) : urlId;
    const [result] = await AnalyticsEvent.aggregate([
      { $match: { urlId: objectId } },
      {
        $facet: {
          browsers: buildTopValuesPipeline('$metadata.browser'),
          operatingSystems: buildTopValuesPipeline('$metadata.os'),
          devices: buildTopValuesPipeline('$metadata.deviceType'),
          trafficSources: buildTopValuesPipeline('$metadata.trafficSource'),
        },
      },
    ]);

    return (
      result || { browsers: [], operatingSystems: [], devices: [], trafficSources: [] }
    );
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

  async deleteByUser(userId) {
    return AnalyticsEvent.deleteMany({ userId });
  }

  async deleteByUrls(urlIds) {
    return AnalyticsEvent.deleteMany({ urlId: { $in: urlIds } });
  }
}

module.exports = { analyticsRepository: new AnalyticsRepository() };
