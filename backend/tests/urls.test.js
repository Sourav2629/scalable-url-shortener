const generateShortCode = require('../src/modules/urls/application/short-code.generator');
const UrlService = require('../src/modules/urls/application/url.service');
const AppError = require('../src/shared/errors/app-error');
const { validateCreateUrl, validateCreatePublicUrl, validateUpdateUrl } = require('../src/modules/urls/presentation/validators/url.validator');
const UrlRepository = require('../src/modules/urls/infrastructure/repositories/url.repository');

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

    test('validateCreatePublicUrl accepts valid originalUrl', () => {
      const req = { body: { originalUrl: 'https://example.com/public' } };
      const next = jest.fn();
      validateCreatePublicUrl(req, {}, next);
      expect(req.body.originalUrl).toBe('https://example.com/public');
      expect(req.body.customAlias).toBeUndefined();
      expect(next).toHaveBeenCalledWith();
    });

    test('validateCreatePublicUrl strips unsupported fields', () => {
      const req = { body: { originalUrl: 'https://example.com/public', customAlias: 'should-be-ignored', title: 'ignored' } };
      const next = jest.fn();
      validateCreatePublicUrl(req, {}, next);
      expect(req.body.originalUrl).toBe('https://example.com/public');
      expect(req.body.customAlias).toBeUndefined();
      expect(req.body.title).toBeUndefined();
      expect(next).toHaveBeenCalledWith();
    });

    test('validateCreatePublicUrl rejects invalid URL', () => {
      const req = { body: { originalUrl: 'not-a-url' } };
      const next = jest.fn();
      validateCreatePublicUrl(req, {}, next);
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

    test('createPublicUrl creates URL with owner: null', async () => {
      mockUrlRepo.existsByShortCode.mockResolvedValue(false);
      mockUrlRepo.create.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        owner: null,
        originalUrl: 'https://example.com/public',
        shortCode: 'pub12345',
        clickCount: 0,
        isActive: true,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await urlService.createPublicUrl({
        originalUrl: 'https://example.com/public',
      });

      expect(mockUrlRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ owner: null, originalUrl: 'https://example.com/public' })
      );
      expect(result.owner).toBeNull();
      expect(result.shortCode).toBe('pub12345');
    });

    test('createPublicUrl ignores customAlias and other authenticated-only fields', async () => {
      mockUrlRepo.existsByShortCode.mockResolvedValue(false);
      mockUrlRepo.create.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        owner: null,
        originalUrl: 'https://example.com/public',
        shortCode: 'pub12345',
        clickCount: 0,
        isActive: true,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await urlService.createPublicUrl({
        originalUrl: 'https://example.com/public',
        customAlias: 'ignored-alias',
        title: 'ignored title',
      });

      expect(mockUrlRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ owner: null, originalUrl: 'https://example.com/public' })
      );
      expect(mockUrlRepo.create.mock.calls[0][0]).not.toHaveProperty('customAlias');
      expect(mockUrlRepo.create.mock.calls[0][0]).not.toHaveProperty('title');
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

    describe('getUserUrls - search and sort forwarding', () => {
      test('forwards search param to repository', async () => {
        mockUrlRepo.findByOwner.mockResolvedValue({ urls: [], total: 0 });

        await urlService.getUserUrls('user1', { search: 'test query' });

        expect(mockUrlRepo.findByOwner).toHaveBeenCalledWith('user1', {
          page: 1,
          limit: 20,
          search: 'test query',
          sortBy: 'createdAt',
          sortOrder: 'desc',
        });
      });

      test('forwards sortBy and sortOrder params to repository', async () => {
        mockUrlRepo.findByOwner.mockResolvedValue({ urls: [], total: 0 });

        await urlService.getUserUrls('user1', { sortBy: 'clickCount', sortOrder: 'asc' });

        expect(mockUrlRepo.findByOwner).toHaveBeenCalledWith('user1', {
          page: 1,
          limit: 20,
          search: undefined,
          sortBy: 'clickCount',
          sortOrder: 'asc',
        });
      });

      test('defaults to createdAt desc when no sort provided', async () => {
        mockUrlRepo.findByOwner.mockResolvedValue({ urls: [], total: 0 });

        await urlService.getUserUrls('user1', {});

        expect(mockUrlRepo.findByOwner).toHaveBeenCalledWith('user1', {
          page: 1,
          limit: 20,
          search: undefined,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        });
      });

      test('returns serialized urls and correct pagination metadata', async () => {
        mockUrlRepo.findByOwner.mockResolvedValue({
          urls: [
            { _id: 'url1', owner: 'user1', shortCode: 'abc', originalUrl: 'https://a.com', clickCount: 5, isActive: true, isDeleted: false, createdAt: new Date(), updatedAt: new Date() },
          ],
          total: 1,
        });

        const result = await urlService.getUserUrls('user1', { page: 1, limit: 20, search: 'abc' });

        expect(result.urls).toHaveLength(1);
        expect(result.urls[0].shortCode).toBe('abc');
        expect(result.page).toBe(1);
        expect(result.total).toBe(1);
        expect(result.totalPages).toBe(1);
      });

      test('returns empty results for empty search', async () => {
        mockUrlRepo.findByOwner.mockResolvedValue({ urls: [], total: 0 });

        const result = await urlService.getUserUrls('user1', { search: 'zzz no match' });

        expect(result.urls).toHaveLength(0);
        expect(result.total).toBe(0);
        expect(result.totalPages).toBe(0);
      });
    });
  });

  describe('UrlRepository - search and sort', () => {
    let mockQuery;
    let mockCountQuery;
    let originalFind;
    let originalCountDocuments;

    beforeEach(() => {
      // Create chainable mock query
      mockQuery = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        collation: jest.fn().mockReturnThis(),
        then: jest.fn((resolve) => resolve([])),
      };
      mockCountQuery = {
        then: jest.fn((resolve) => resolve(0)),
      };

      const UrlModel = require('../src/modules/urls/infrastructure/models/url.model');
      originalFind = UrlModel.find;
      originalCountDocuments = UrlModel.countDocuments;
      UrlModel.find = jest.fn().mockReturnValue(mockQuery);
      UrlModel.countDocuments = jest.fn().mockReturnValue(mockCountQuery);
    });

    afterEach(() => {
      const UrlModel = require('../src/modules/urls/infrastructure/models/url.model');
      UrlModel.find = originalFind;
      UrlModel.countDocuments = originalCountDocuments;
    });

    test('search by title applies $or regex filter', async () => {
      const repo = new UrlRepository();
      await repo.findByOwner('user1', { search: 'my title' });

      const UrlModel = require('../src/modules/urls/infrastructure/models/url.model');
      const findCall = UrlModel.find.mock.calls[0][0];
      expect(findCall.$or).toEqual([
        { shortCode: expect.any(RegExp) },
        { originalUrl: expect.any(RegExp) },
        { title: expect.any(RegExp) },
      ]);
      expect(findCall.$or[2].title.test('my title')).toBe(true);
      expect(findCall.$or[2].title.test('MY TITLE')).toBe(true);
    });

    test('search by short code matches via regex', async () => {
      const repo = new UrlRepository();
      await repo.findByOwner('user1', { search: 'abc123' });

      const UrlModel = require('../src/modules/urls/infrastructure/models/url.model');
      const findCall = UrlModel.find.mock.calls[0][0];
      expect(findCall.$or[0].shortCode.test('abc123')).toBe(true);
      expect(findCall.$or[0].shortCode.test('ABC123')).toBe(true);
      expect(findCall.$or[0].shortCode.test('xyz789')).toBe(false);
    });

    test('search by destination URL matches via regex', async () => {
      const repo = new UrlRepository();
      await repo.findByOwner('user1', { search: 'example.com' });

      const UrlModel = require('../src/modules/urls/infrastructure/models/url.model');
      const findCall = UrlModel.find.mock.calls[0][0];
      expect(findCall.$or[1].originalUrl.test('https://example.com/page')).toBe(true);
      expect(findCall.$or[1].originalUrl.test('https://other.com')).toBe(false);
    });

    test('empty search does not add $or filter', async () => {
      const repo = new UrlRepository();
      await repo.findByOwner('user1', { search: '' });

      const UrlModel = require('../src/modules/urls/infrastructure/models/url.model');
      const findCall = UrlModel.find.mock.calls[0][0];
      expect(findCall.$or).toBeUndefined();
    });

    test('empty/whitespace search does not add $or filter', async () => {
      const repo = new UrlRepository();
      await repo.findByOwner('user1', { search: '   ' });

      const UrlModel = require('../src/modules/urls/infrastructure/models/url.model');
      const findCall = UrlModel.find.mock.calls[0][0];
      expect(findCall.$or).toBeUndefined();
    });

    test('sorting by clickCount ascending', async () => {
      const repo = new UrlRepository();
      await repo.findByOwner('user1', { sortBy: 'clickCount', sortOrder: 'asc' });

      const UrlModel = require('../src/modules/urls/infrastructure/models/url.model');
      expect(mockQuery.sort).toHaveBeenCalledWith({ clickCount: 1 });
    });

    test('sorting by clickCount descending', async () => {
      const repo = new UrlRepository();
      await repo.findByOwner('user1', { sortBy: 'clickCount', sortOrder: 'desc' });

      expect(mockQuery.sort).toHaveBeenCalledWith({ clickCount: -1 });
    });

    test('sorting by title ascending with case-insensitive collation', async () => {
      const repo = new UrlRepository();
      await repo.findByOwner('user1', { sortBy: 'title', sortOrder: 'asc' });

      expect(mockQuery.sort).toHaveBeenCalledWith({ title: 1 });
      expect(mockQuery.collation).toHaveBeenCalledWith({ locale: 'en', strength: 2 });
    });

    test('sorting by title descending', async () => {
      const repo = new UrlRepository();
      await repo.findByOwner('user1', { sortBy: 'title', sortOrder: 'desc' });

      expect(mockQuery.sort).toHaveBeenCalledWith({ title: -1 });
      expect(mockQuery.collation).toHaveBeenCalledWith({ locale: 'en', strength: 2 });
    });

    test('sorting by createdAt ascending', async () => {
      const repo = new UrlRepository();
      await repo.findByOwner('user1', { sortBy: 'createdAt', sortOrder: 'asc' });

      expect(mockQuery.sort).toHaveBeenCalledWith({ createdAt: 1 });
    });

    test('sorting by createdAt descending (default)', async () => {
      const repo = new UrlRepository();
      await repo.findByOwner('user1', {});

      expect(mockQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    test('sorting by shortCode', async () => {
      const repo = new UrlRepository();
      await repo.findByOwner('user1', { sortBy: 'shortCode', sortOrder: 'asc' });

      expect(mockQuery.sort).toHaveBeenCalledWith({ shortCode: 1 });
    });

    test('invalid sortBy falls back to createdAt', async () => {
      const repo = new UrlRepository();
      await repo.findByOwner('user1', { sortBy: 'maliciousField', sortOrder: 'asc' });

      expect(mockQuery.sort).toHaveBeenCalledWith({ createdAt: 1 });
    });

    test('invalid sortOrder falls back to desc (-1)', async () => {
      const repo = new UrlRepository();
      await repo.findByOwner('user1', { sortBy: 'clickCount', sortOrder: 'invalid' });

      expect(mockQuery.sort).toHaveBeenCalledWith({ clickCount: -1 });
    });

    test('pagination with search uses same query for count', async () => {
      const repo = new UrlRepository();
      await repo.findByOwner('user1', { page: 2, limit: 10, search: 'test' });

      const UrlModel = require('../src/modules/urls/infrastructure/models/url.model');
      expect(UrlModel.find).toHaveBeenCalled();
      expect(UrlModel.countDocuments).toHaveBeenCalled();
      expect(mockQuery.skip).toHaveBeenCalledWith(10);
      expect(mockQuery.limit).toHaveBeenCalledWith(10);
    });
  });
});
