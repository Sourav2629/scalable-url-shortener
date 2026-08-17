const UrlService = require('../../application/url.service');
const generateShortCode = require('../../application/short-code.generator');
const UrlRepository = require('../../infrastructure/repositories/url.repository');
const createUrlController = require('../controllers/url.controller');
const AnalyticsPublisher = require('../../../analytics/application/analytics.publisher');

const urlRepository = new UrlRepository();
const analyticsPublisher = new AnalyticsPublisher();
const urlService = new UrlService(urlRepository, generateShortCode, analyticsPublisher);
const urlController = createUrlController(urlService);

module.exports = {
  urlController,
};
