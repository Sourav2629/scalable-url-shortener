const { analyticsRepository } = require('../../infrastructure/repositories/analytics.repository');
const UrlRepository = require('../../../urls/infrastructure/repositories/url.repository');
const AnalyticsService = require('../../application/analytics.service');

const urlRepository = new UrlRepository();
const analyticsService = new AnalyticsService(analyticsRepository, urlRepository);

module.exports = { analyticsService };
