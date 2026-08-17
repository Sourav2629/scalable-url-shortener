const mongoose = require('mongoose');
const AppError = require('../../../../shared/errors/app-error');

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;

const RESERVED_ALIASES = new Set([
  'api',
  'v1',
  'health',
  'live',
  'ready',
  'auth',
  'urls',
  'analytics',
  'login',
  'register',
  'logout',
  'me',
  'summary',
  'timeseries',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  'static',
  'assets',
  'public',
  'index.html',
  'admin',
  'dashboard',
]);

function validateCustomAlias(value) {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new AppError('customAlias must be a string.', 400);
  }

  const alias = value.trim();

  if (!alias) {
    return undefined;
  }

  if (alias.length < 3 || alias.length > 30) {
    throw new AppError('Custom alias must be between 3 and 30 characters long.', 400);
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(alias)) {
    throw new AppError('Custom alias can only contain letters, numbers, hyphens, and underscores.', 400);
  }

  if (RESERVED_ALIASES.has(alias.toLowerCase())) {
    throw new AppError('This custom alias is reserved and cannot be used.', 400);
  }

  return alias;
}

function validateOriginalUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError('A valid original URL is required.', 400);
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(value.trim());
  } catch {
    throw new AppError('A valid original URL is required.', 400);
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new AppError('Original URL must use HTTP or HTTPS.', 400);
  }

  return parsedUrl.toString();
}

function normalizeOptionalText(value, fieldName, maxLength) {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new AppError(`${fieldName} must be a string.`, 400);
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length > maxLength) {
    throw new AppError(`${fieldName} must be at most ${maxLength} characters long.`, 400);
  }

  return normalizedValue || null;
}

function normalizeExpiresAt(value) {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new AppError('expiresAt must be a valid ISO 8601 date string.', 400);
  }

  const expiresAt = new Date(value);

  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
    throw new AppError('expiresAt must be a future date.', 400);
  }

  return expiresAt;
}

function requireBodyObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError('Request body must be a JSON object.', 400);
  }
}

function validateCreateUrl(req, res, next) {
  try {
    requireBodyObject(req.body);

    const urlData = {
      originalUrl: validateOriginalUrl(req.body.originalUrl),
    };

    if (Object.hasOwn(req.body, 'customAlias') && req.body.customAlias !== undefined) {
      const customAlias = validateCustomAlias(req.body.customAlias);
      if (customAlias) {
        urlData.customAlias = customAlias;
      }
    }

    if (Object.hasOwn(req.body, 'title')) {
      urlData.title = normalizeOptionalText(req.body.title, 'title', MAX_TITLE_LENGTH);
    }

    if (Object.hasOwn(req.body, 'description')) {
      urlData.description = normalizeOptionalText(
        req.body.description,
        'description',
        MAX_DESCRIPTION_LENGTH,
      );
    }

    if (Object.hasOwn(req.body, 'expiresAt')) {
      urlData.expiresAt = normalizeExpiresAt(req.body.expiresAt);
    }

    req.body = urlData;
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateUpdateUrl(req, res, next) {
  try {
    requireBodyObject(req.body);

    const updates = {};

    if (Object.hasOwn(req.body, 'originalUrl')) {
      updates.originalUrl = validateOriginalUrl(req.body.originalUrl);
    }

    if (Object.hasOwn(req.body, 'title')) {
      updates.title = normalizeOptionalText(req.body.title, 'title', MAX_TITLE_LENGTH);
    }

    if (Object.hasOwn(req.body, 'description')) {
      updates.description = normalizeOptionalText(
        req.body.description,
        'description',
        MAX_DESCRIPTION_LENGTH,
      );
    }

    if (Object.hasOwn(req.body, 'expiresAt')) {
      updates.expiresAt = normalizeExpiresAt(req.body.expiresAt);
    }

    if (Object.hasOwn(req.body, 'isActive')) {
      if (typeof req.body.isActive !== 'boolean') {
        throw new AppError('isActive must be a boolean.', 400);
      }

      updates.isActive = req.body.isActive;
    }

    if (!Object.keys(updates).length) {
      throw new AppError('At least one supported field is required for update.', 400);
    }

    req.body = updates;
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateUrlId(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return next(new AppError('A valid URL ID is required.', 400));
  }

  return next();
}

module.exports = {
  validateCreateUrl,
  validateUpdateUrl,
  validateUrlId,
};
