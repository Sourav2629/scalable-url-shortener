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

    // ALWAYS use the URL document's clickCount as the authoritative total.
    // AnalyticsEvent may be incomplete if historical events weren't processed.
    const url = await this.urlRepository.findByIdForOwner(urlId, ownerId);
    const totalClicks = url ? (url.clickCount || 0) : 0;

    const breakdown = await this.analyticsRepository.getSummary(urlId);
    return {
      urlId,
      totalClicks,
      topBrowsers: this._format(breakdown.browsers),
      topOperatingSystems: this._format(breakdown.operatingSystems),
      topDevices: this._format(breakdown.devices),
      topTrafficSources: this._format(breakdown.trafficSources),
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

  /**
   * Formats MongoDB-grouped rows [{ _id, clicks }] into the API shape [{ name, clicks }].
   * Rows arrive already counted, sorted (clicks desc) and capped at the top N by the
   * repository's server-side aggregation pipeline.
   */
  _format(rows) {
    return (rows || []).map(({ _id, clicks }) => ({ name: _id === null ? 'Unknown' : _id, clicks }));
  }
}

module.exports = AnalyticsService;
