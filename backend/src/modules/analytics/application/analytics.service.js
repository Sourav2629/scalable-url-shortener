const AppError = require('../../../shared/errors/app-error');
const { parseUserAgent } = require('../utils/ua-parser');
const { classifyReferrer } = require('../utils/referrer-classifier');

class AnalyticsService {
  constructor(analyticsRepository, urlRepository) {
    this.analyticsRepository = analyticsRepository;
    this.urlRepository = urlRepository;
  }

  async processClickEvent(event) {
    const { browser, os, deviceType } = parseUserAgent(event.userAgent);
    const trafficSource = classifyReferrer(event.referrer);

    const enrichedEvent = {
      ...event,
      metadata: {
        ...(event.metadata || {}),
        browser,
        os,
        deviceType,
        trafficSource,
      },
    };

    try {
      await this.analyticsRepository.create(enrichedEvent);
    } catch (error) {
      if (error.code === 11000) {
        return;
      }
      throw error;
    }
  }

  async getSummary(ownerId, urlId) {
    await this._verifyOwnership(ownerId, urlId);
    const result = await this.analyticsRepository.getSummary(urlId);
    if (!result.length) return { urlId, totalClicks: 0, topBrowsers: [], topOperatingSystems: [], topDevices: [], topTrafficSources: [] };
    
    const data = result[0];
    return {
      urlId,
      totalClicks: data.totalClicks,
      topBrowsers: this._count(data.topBrowsers),
      topOperatingSystems: this._count(data.topOS),
      topDevices: this._count(data.topDevices),
      topTrafficSources: this._count(data.topSources),
    };
  }

  async getTimeseries(ownerId, urlId, from, to, interval = 'day') {
    await this._verifyOwnership(ownerId, urlId);

    const fromDate = from instanceof Date ? from : new Date(from);
    const toDate = to instanceof Date ? to : new Date(to);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new AppError('Valid from and to date parameters are required.', 400);
    }

    if (fromDate >= toDate) {
      throw new AppError('Invalid date range. "from" must be before "to".', 400);
    }

    if (!['day', 'hour'].includes(interval)) {
      throw new AppError('Invalid interval parameter. Must be "day" or "hour".', 400);
    }

    const data = await this.analyticsRepository.getTimeseries(urlId, fromDate, toDate, interval);
    return { urlId, interval, from: fromDate, to: toDate, data };
  }

  async _verifyOwnership(ownerId, urlId) {
    const url = await this.urlRepository.findByIdForOwner(urlId, ownerId);
    if (!url) throw new AppError('URL not found or unauthorized', 404);
  }

  _count(arr) {
    const counts = {};
    arr.forEach(item => counts[item] = (counts[item] || 0) + 1);
    return Object.entries(counts).map(([name, clicks]) => ({ name, clicks })).sort((a, b) => b.clicks - a.clicks).slice(0, 5);
  }
}

module.exports = AnalyticsService;
