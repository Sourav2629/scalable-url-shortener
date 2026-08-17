const generateShortCode = require('../src/modules/urls/application/short-code.generator');
const UrlService = require('../src/modules/urls/application/url.service');
const AppError = require('../src/shared/errors/app-error');
const { validateCreateUrl, validateUpdateUrl } = require('../src/modules/urls/presentation/validators/url.validator');

describe('URL Service & Public Redirect Logic', () => {
  describe('Short Code Generator', () => {
    test('generates an 8-character string by default', () => {
      const code = generateShortCode();
      expect(typeof code).toBe('string');
      expect(code.length).toBe(8);
    });

    test('generates custom length code', () => {
      const code = generateShortCode(12);
      expect(code.length).toBe(12);
    });
  });

  describe('URL Validators', () => {
    test('validateCreateUrl rejects invalid URL', () => {
      const req = { body: { originalUrl: 'not-a-url' } };
      const next = jest.fn();
      validateCreateUrl(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('validateCreateUrl accepts valid http/https URL', () => {
      const req = { body: { originalUrl: 'https://example.com/test' } };
      const next = jest.fn();
      validateCreateUrl(req, {}, next);
      expect(req.body.originalUrl).toBe('https://example.com/test');
      expect(next).toHaveBeenCalledWith();
    });

    test('validateCreateUrl accepts valid customAlias', () => {
      const req = { body: { originalUrl: 'https://example.com/test', customAlias: 'my-custom-link' } };
      const next = jest.fn();
      validateCreateUrl(req, {}, next);
      expect(req.body.customAlias).toBe('my-custom-link');
      expect(next).toHaveBeenCalledWith();
    });

    test('validateCreateUrl rejects short customAlias (< 3 chars)', () => {
      const req = { body: { originalUrl: 'https://example.com/test', customAlias: 'ab' } };
      const next = jest.fn();
      validateCreateUrl(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('validateCreateUrl rejects long customAlias (> 30 chars)', () => {
      const req = { body: { originalUrl: 'https://example.com/test', customAlias: 'a'.repeat(31) } };
      const next = jest.fn();
      validateCreateUrl(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('validateCreateUrl rejects invalid characters in customAlias', () => {
      const req = { body: { originalUrl: 'https://example.com/test', customAlias: 'invalid alias!' } };
      const next = jest.fn();
      validateCreateUrl(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('validateCreateUrl rejects reserved customAlias', () => {
      const req = { body: { originalUrl: 'https://example.com/test', customAlias: 'analytics' } };
      const next = jest.fn();
      validateCreateUrl(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('validateCreateUrl rejects non-http/https schemes (e.g. ftp://)', () => {
      const req = { body: { originalUrl: 'ftp://example.com/file' } };
      const next = jest.fn();
      validateCreateUrl(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('validateUpdateUrl requires at least one field', () => {
      const req = { body: {} };
      const next = jest.fn();
      validateUpdateUrl(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });
  });

  describe('UrlService Business Logic', () => {
    let mockUrlRepo;
    let mockAnalyticsPublisher;
    let mockGenerateShortCode;
    let urlService;

    beforeEach(() => {
      mockUrlRepo = {
        create: jest.fn(),
        findByOwner: jest.fn(),
        findByIdForOwner: jest.fn(),
        updateByIdForOwner: jest.fn(),
        softDeleteByIdForOwner: jest.fn(),
        existsByShortCode: jest.fn(),
        findByShortCode: jest.fn(),
        incrementClickCount: jest.fn(),
      };
      mockAnalyticsPublisher = {
        publishClickEvent: jest.fn(),
      };
      mockGenerateShortCode = jest.fn().mockReturnValue('abc12345');
      urlService = new UrlService(mockUrlRepo, mockGenerateShortCode, mockAnalyticsPublisher);
    });

    test('createUrl generates shortcode and handles collision retry', async () => {
      mockUrlRepo.existsByShortCode
        .mockResolvedValueOnce(true) // collision
        .mockResolvedValueOnce(false); // unique

      mockUrlRepo.create.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        owner: '507f1f77bcf86cd799439012',
        originalUrl: 'https://example.com',
        shortCode: 'abc12345',
        clickCount: 0,
        isActive: true,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await urlService.createUrl('507f1f77bcf86cd799439012', {
        originalUrl: 'https://example.com',
      });

      expect(mockUrlRepo.existsByShortCode).toHaveBeenCalledTimes(2);
      expect(result.shortCode).toBe('abc12345');
    });

    test('createUrl uses customAlias when provided and available', async () => {
      mockUrlRepo.existsByShortCode.mockResolvedValue(false);
      mockUrlRepo.create.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        owner: '507f1f77bcf86cd799439012',
        originalUrl: 'https://example.com',
        shortCode: 'my-custom-alias',
        clickCount: 0,
        isActive: true,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await urlService.createUrl('507f1f77bcf86cd799439012', {
        originalUrl: 'https://example.com',
        customAlias: 'my-custom-alias',
      });

      expect(mockUrlRepo.existsByShortCode).toHaveBeenCalledWith('my-custom-alias');
      expect(result.shortCode).toBe('my-custom-alias');
    });

    test('createUrl throws 409 Conflict if customAlias is already taken', async () => {
      mockUrlRepo.existsByShortCode.mockResolvedValue(true);

      await expect(
        urlService.createUrl('507f1f77bcf86cd799439012', {
          originalUrl: 'https://example.com',
          customAlias: 'already-taken',
        }),
      ).rejects.toThrow(expect.objectContaining({ statusCode: 409 }));
    });

    test('getUrlById enforces ownership and throws 404 if not owned by user', async () => {
      mockUrlRepo.findByIdForOwner.mockResolvedValue(null);

      await expect(urlService.getUrlById('user1', 'url1')).rejects.toThrow(
        expect.objectContaining({ statusCode: 404, message: 'URL not found.' })
      );
      expect(mockUrlRepo.findByIdForOwner).toHaveBeenCalledWith('url1', 'user1');
    });

    test('deleteUrl soft deletes URL', async () => {
      mockUrlRepo.softDeleteByIdForOwner.mockResolvedValue({ _id: 'url1' });

      await urlService.deleteUrl('user1', 'url1');
      expect(mockUrlRepo.softDeleteByIdForOwner).toHaveBeenCalledWith('url1', 'user1');
    });

    test('getUrlByShortCode fails if URL is nonexistent, deleted, or inactive', async () => {
      mockUrlRepo.findByShortCode.mockResolvedValue(null);
      await expect(urlService.getUrlByShortCode('nonexistent')).rejects.toThrow(
        expect.objectContaining({ statusCode: 404, message: 'URL not found.' })
      );

      mockUrlRepo.findByShortCode.mockResolvedValue({ isDeleted: true });
      await expect(urlService.getUrlByShortCode('deleted')).rejects.toThrow(
        expect.objectContaining({ statusCode: 404, message: 'URL not found.' })
      );

      mockUrlRepo.findByShortCode.mockResolvedValue({ isDeleted: false, isActive: false });
      await expect(urlService.getUrlByShortCode('inactive')).rejects.toThrow(
        expect.objectContaining({ statusCode: 404, message: 'URL not found.' })
      );
    });

    test('getUrlByShortCode fails if URL has expired', async () => {
      const pastDate = new Date(Date.now() - 10000);
      mockUrlRepo.findByShortCode.mockResolvedValue({
        _id: 'url1',
        isDeleted: false,
        isActive: true,
        expiresAt: pastDate,
      });

      await expect(urlService.getUrlByShortCode('expired')).rejects.toThrow(
        expect.objectContaining({ statusCode: 404, message: 'URL has expired.' })
      );
    });

    test('getUrlByShortCode increments clickCount and publishes analytics asynchronously', async () => {
      const mockUrl = {
        _id: 'url1',
        shortCode: 'valid123',
        originalUrl: 'https://destination.com',
        isDeleted: false,
        isActive: true,
        owner: 'user1',
      };
      mockUrlRepo.findByShortCode.mockResolvedValue(mockUrl);
      mockUrlRepo.incrementClickCount.mockResolvedValue({});

      const originalUrl = await urlService.getUrlByShortCode('valid123', {
        ip: '127.0.0.1',
        userAgent: 'JestTest',
        referrer: 'https://google.com',
      });

      expect(originalUrl).toBe('https://destination.com');
      expect(mockUrlRepo.incrementClickCount).toHaveBeenCalledWith('url1');
      expect(mockAnalyticsPublisher.publishClickEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          urlId: 'url1',
          shortCode: 'valid123',
          anonymizedIp: '127.0.0.0',
          userAgent: 'JestTest',
          referrer: 'https://google.com',
        })
      );
    });

    test('analytics publishing failure does NOT fail the redirect', async () => {
      const mockUrl = {
        _id: 'url1',
        shortCode: 'valid123',
        originalUrl: 'https://destination.com',
        isDeleted: false,
        isActive: true,
      };
      mockUrlRepo.findByShortCode.mockResolvedValue(mockUrl);
      mockUrlRepo.incrementClickCount.mockResolvedValue({});
      
      const AnalyticsPublisher = require('../src/modules/analytics/application/analytics.publisher');
      const publisher = new AnalyticsPublisher();
      
      // Force queue add to throw
      const { analyticsQueue } = require('../src/infrastructure/queue/analytics.queue');
      jest.spyOn(analyticsQueue, 'add').mockRejectedValue(new Error('Redis Connection Error'));

      const serviceWithFailingPublisher = new UrlService(mockUrlRepo, mockGenerateShortCode, publisher);

      const result = await serviceWithFailingPublisher.getUrlByShortCode('valid123', { ip: '127.0.0.1' });
      expect(result).toBe('https://destination.com');
    });
  });
});
