const crypto = require('crypto');
const AppError = require('../../../shared/errors/app-error');

const MAX_SHORT_CODE_ATTEMPTS = 5;

function anonymizeIp(ip) {
  if (!ip) return '0.0.0.0';
  const cleanIp = ip.replace(/^::ffff:/, '');
  if (cleanIp.includes('.')) {
    const parts = cleanIp.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    }
  }
  if (cleanIp.includes(':')) {
    const parts = cleanIp.split(':');
    return `${parts.slice(0, 3).join(':')}::`;
  }
  return '0.0.0.0';
}

function serializeUrl(url) {
  return {
    id: url._id.toString(),
    owner: url.owner.toString(),
    originalUrl: url.originalUrl,
    shortCode: url.shortCode,
    title: url.title,
    description: url.description,
    expiresAt: url.expiresAt,
    clickCount: url.clickCount,
    isActive: url.isActive,
    createdAt: url.createdAt,
    updatedAt: url.updatedAt,
  };
}

class UrlService {
  constructor(urlRepository, generateShortCode, analyticsPublisher) {
    this.urlRepository = urlRepository;
    this.generateShortCode = generateShortCode;
    this.analyticsPublisher = analyticsPublisher;
  }

  async createUrl(ownerId, urlData) {
    const { customAlias, ...cleanUrlData } = urlData;

    if (customAlias) {
      const exists = await this.urlRepository.existsByShortCode(customAlias);
      if (exists) {
        throw new AppError(`Alias '${customAlias}' is already in use.`, 409);
      }

      try {
        const url = await this.urlRepository.create({
          ...cleanUrlData,
          owner: ownerId,
          shortCode: customAlias,
        });

        return serializeUrl(url);
      } catch (error) {
        if (error.code === 11000 || error.code === 11001) {
          throw new AppError(`Alias '${customAlias}' is already in use.`, 409);
        }
        throw error;
      }
    }

    for (let attempt = 0; attempt < MAX_SHORT_CODE_ATTEMPTS; attempt += 1) {
      const shortCode = this.generateShortCode();
      const shortCodeExists = await this.urlRepository.existsByShortCode(shortCode);

      if (shortCodeExists) {
        continue;
      }

      try {
        const url = await this.urlRepository.create({
          ...cleanUrlData,
          owner: ownerId,
          shortCode,
        });

        return serializeUrl(url);
      } catch (error) {
        if (error.code !== 11000 && error.code !== 11001) {
          throw error;
        }
      }
    }

    throw new AppError('Unable to generate a unique short code. Please try again.', 503);
  }

  async getUserUrls(ownerId) {
    const urls = await this.urlRepository.findByOwner(ownerId);

    return urls.map(serializeUrl);
  }

  async getUrlById(ownerId, urlId) {
    const url = await this.urlRepository.findByIdForOwner(urlId, ownerId);

    return this.getRequiredUrl(url);
  }

  async updateUrl(ownerId, urlId, updates) {
    const url = await this.urlRepository.updateByIdForOwner(urlId, ownerId, updates);

    return this.getRequiredUrl(url);
  }

  async deleteUrl(ownerId, urlId) {
    const url = await this.urlRepository.softDeleteByIdForOwner(urlId, ownerId);

    if (!url) {
      throw new AppError('URL not found.', 404);
    }
  }

  async getUrlByShortCode(shortCode, requestInfo = {}) {
    const url = await this.urlRepository.findByShortCode(shortCode);

    if (!url || url.isDeleted || !url.isActive) {
      throw new AppError('URL not found.', 404);
    }

    if (url.expiresAt && url.expiresAt < new Date()) {
      throw new AppError('URL has expired.', 404);
    }

    await this.urlRepository.incrementClickCount(url._id);

    this.analyticsPublisher.publishClickEvent({
      eventId: crypto.randomUUID(),
      urlId: url._id,
      shortCode: url.shortCode,
      timestamp: new Date(),
      anonymizedIp: anonymizeIp(requestInfo.ip),
      userAgent: requestInfo.userAgent || 'unknown',
      referrer: requestInfo.referrer || null,
      userId: url.owner || null,
      metadata: {},
    });

    return url.originalUrl;
  }

  getRequiredUrl(url) {
    if (!url) {
      throw new AppError('URL not found.', 404);
    }

    return serializeUrl(url);
  }
}

module.exports = UrlService;
