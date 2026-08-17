const AnalyticsService = require('../src/modules/analytics/application/analytics.service');
const { parseUserAgent } = require('../src/modules/analytics/utils/ua-parser');
const { classifyReferrer } = require('../src/modules/analytics/utils/referrer-classifier');
const AppError = require('../src/shared/errors/app-error');

describe('Analytics Module', () => {
  describe('User Agent Parser Utility', () => {
    test('parses Chrome desktop user agent', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      const result = parseUserAgent(ua);
      expect(result.browser).toBe('Chrome');
      expect(result.os).toBe('Windows');
      expect(result.deviceType).toBe('Desktop');
    });

    test('parses iPhone mobile user agent', () => {
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
      const result = parseUserAgent(ua);
      expect(result.os).toBe('iOS');
      expect(result.deviceType).toBe('Mobile');
    });

    test('returns Unknown for empty or null user agent', () => {
      const result = parseUserAgent('');
      expect(result.browser).toBe('Unknown');
      expect(result.os).toBe('Unknown');
      expect(result.deviceType).toBe('Desktop');
    });
  });

  describe('Referrer Classifier Utility', () => {
    test('classifies empty or null referrer as Direct', () => {
      expect(classifyReferrer('')).toBe('Direct');
      expect(classifyReferrer(null)).toBe('Direct');
    });

    test('classifies Google as Search', () => {
      expect(classifyReferrer('https://www.google.com/search?q=test')).toBe('Search');
      expect(classifyReferrer('https://bing.com')).toBe('Search');
    });

    test('classifies Twitter/X, Facebook, LinkedIn as Social', () => {
      expect(classifyReferrer('https://t.co/xyz')).toBe('Social');
      expect(classifyReferrer('https://facebook.com/post')).toBe('Social');
      expect(classifyReferrer('https://linkedin.com')).toBe('Social');
    });

    test('classifies unknown websites as Referral', () => {
      expect(classifyReferrer('https://someblog.org/article')).toBe('Referral');
    });

    test('classifies malformed URLs as Other', () => {
      expect(classifyReferrer('not-a-valid-url')).toBe('Other');
    });
  });

  describe('Analytics Service', () => {
    let mockAnalyticsRepo;
    let mockUrlRepo;
    let analyticsService;

    beforeEach(() => {
      mockAnalyticsRepo = {
        create: jest.fn(),
        getSummary: jest.fn(),
        getTimeseries: jest.fn(),
      };
      mockUrlRepo = {
        findByIdForOwner: jest.fn(),
      };
      analyticsService = new AnalyticsService(mockAnalyticsRepo, mockUrlRepo);
    });

    describe('processClickEvent (Worker Processing & Idempotency)', () => {
      test('enriches event and persists to repository', async () => {
        const event = {
          eventId: 'evt-123',
          urlId: 'url-1',
          shortCode: 'abc',
          anonymizedIp: '127.0.0.1',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          referrer: 'https://google.com',
        };

        mockAnalyticsRepo.create.mockResolvedValue(event);

        await analyticsService.processClickEvent(event);

        expect(mockAnalyticsRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            eventId: 'evt-123',
            metadata: expect.objectContaining({
              browser: 'Chrome',
              os: 'Windows',
              deviceType: 'Desktop',
              trafficSource: 'Search',
            }),
          })
        );
      });

      test('ignores duplicate event (E11000 duplicate key error) gracefully', async () => {
        const event = { eventId: 'evt-123', urlId: 'url-1' };
        const duplicateError = new Error('E11000 duplicate key error');
        duplicateError.code = 11000;

        mockAnalyticsRepo.create.mockRejectedValue(duplicateError);

        await expect(analyticsService.processClickEvent(event)).resolves.not.toThrow();
      });

      test('re-throws non-duplicate database errors', async () => {
        const event = { eventId: 'evt-123', urlId: 'url-1' };
        const dbError = new Error('Database connection failed');

        mockAnalyticsRepo.create.mockRejectedValue(dbError);

        await expect(analyticsService.processClickEvent(event)).rejects.toThrow('Database connection failed');
      });
    });

    describe('getSummary', () => {
      test('enforces ownership and throws 404 if user does not own URL', async () => {
        mockUrlRepo.findByIdForOwner.mockResolvedValue(null);

        await expect(analyticsService.getSummary('user1', 'url1')).rejects.toThrow(
          expect.objectContaining({ statusCode: 404, message: 'URL not found or unauthorized' })
        );
      });

      test('returns default empty summary when no analytics data exists', async () => {
        mockUrlRepo.findByIdForOwner.mockResolvedValue({ _id: 'url1', owner: 'user1' });
        mockAnalyticsRepo.getSummary.mockResolvedValue([]);

        const summary = await analyticsService.getSummary('user1', 'url1');
        expect(summary).toEqual({
          urlId: 'url1',
          totalClicks: 0,
          topBrowsers: [],
          topOperatingSystems: [],
          topDevices: [],
          topTrafficSources: [],
        });
      });

      test('formats top-N aggregation counts correctly', async () => {
        mockUrlRepo.findByIdForOwner.mockResolvedValue({ _id: 'url1', owner: 'user1' });
        mockAnalyticsRepo.getSummary.mockResolvedValue([
          {
            totalClicks: 3,
            topBrowsers: ['Chrome', 'Chrome', 'Firefox'],
            topOS: ['Windows', 'Windows', 'MacOS'],
            topDevices: ['Desktop', 'Desktop', 'Mobile'],
            topSources: ['Search', 'Direct', 'Search'],
          },
        ]);

        const summary = await analyticsService.getSummary('user1', 'url1');
        expect(summary.totalClicks).toBe(3);
        expect(summary.topBrowsers).toEqual([
          { name: 'Chrome', clicks: 2 },
          { name: 'Firefox', clicks: 1 },
        ]);
        expect(summary.topTrafficSources).toEqual([
          { name: 'Search', clicks: 2 },
          { name: 'Direct', clicks: 1 },
        ]);
      });
    });

    describe('getTimeseries', () => {
      test('validates date inputs and range', async () => {
        mockUrlRepo.findByIdForOwner.mockResolvedValue({ _id: 'url1', owner: 'user1' });

        await expect(
          analyticsService.getTimeseries('user1', 'url1', 'invalid-date', '2026-08-16')
        ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));

        await expect(
          analyticsService.getTimeseries('user1', 'url1', '2026-08-16', '2026-08-15')
        ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));

        await expect(
          analyticsService.getTimeseries('user1', 'url1', '2026-08-15', '2026-08-16', 'invalid-interval')
        ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
      });

      test('returns timeseries data for valid date range', async () => {
        mockUrlRepo.findByIdForOwner.mockResolvedValue({ _id: 'url1', owner: 'user1' });
        mockAnalyticsRepo.getTimeseries.mockResolvedValue([
          { _id: '2026-08-15', clicks: 10 },
          { _id: '2026-08-16', clicks: 15 },
        ]);

        const res = await analyticsService.getTimeseries(
          'user1',
          'url1',
          '2026-08-15T00:00:00.000Z',
          '2026-08-16T23:59:59.000Z',
          'day'
        );

        expect(res.urlId).toBe('url1');
        expect(res.interval).toBe('day');
        expect(res.data).toHaveLength(2);
      });
    });
  });
});
