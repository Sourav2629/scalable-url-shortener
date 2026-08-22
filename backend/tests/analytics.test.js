const AnalyticsService = require('../src/modules/analytics/application/analytics.service');
const AnalyticsPublisher = require('../src/modules/analytics/application/analytics.publisher');
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

      test('User B cannot access User A analytics — ownership enforced', async () => {
        // User A owns the URL — their query returns the document
        mockUrlRepo.findByIdForOwner.mockImplementation((id, ownerId) => {
          if (ownerId === 'userA') {
            return Promise.resolve({ _id: id, owner: 'userA', clickCount: 10 });
          }
          // User B queries the same ID — wrong owner, returns null
          return Promise.resolve(null);
        });

        mockAnalyticsRepo.getSummary.mockResolvedValue([
          {
            totalClicks: 10,
            topBrowsers: ['Chrome'],
            topOS: ['Windows'],
            topDevices: ['Desktop'],
            topSources: ['Direct'],
          },
        ]);

        // User A can get their analytics
        const summary = await analyticsService.getSummary('userA', 'url1');
        expect(summary.totalClicks).toBe(10);
        expect(summary.topBrowsers).toEqual([{ name: 'Chrome', clicks: 1 }]);

        // User B cannot get User A's analytics — throws 404
        await expect(analyticsService.getSummary('userB', 'url1')).rejects.toThrow(
          expect.objectContaining({ statusCode: 404 })
        );

        // User B's query must have been called with the correct params
        expect(mockUrlRepo.findByIdForOwner).toHaveBeenCalledWith('url1', 'userB');
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
        // totalClicks always comes from the URL document's clickCount
        mockUrlRepo.findByIdForOwner.mockResolvedValue({ _id: 'url1', owner: 'user1', clickCount: 5 });
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
        expect(summary.totalClicks).toBe(5);
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

      test('User B cannot access User A timeseries — ownership enforced', async () => {
        mockUrlRepo.findByIdForOwner.mockImplementation((id, ownerId) => {
          if (ownerId === 'userA') {
            return Promise.resolve({ _id: id, owner: 'userA' });
          }
          return Promise.resolve(null);
        });

        mockAnalyticsRepo.getTimeseries.mockResolvedValue([
          { _id: '2026-08-20', clicks: 5 },
        ]);

        // User A can get timeseries
        const ts = await analyticsService.getTimeseries('userA', 'url1', '2026-08-20', '2026-08-21', 'day');
        expect(ts.data).toHaveLength(1);

        // User B cannot
        await expect(
          analyticsService.getTimeseries('userB', 'url1', '2026-08-20', '2026-08-21', 'day')
        ).rejects.toThrow(expect.objectContaining({ statusCode: 404 }));
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

    describe('Worker Processing — Enrichment & Idempotency', () => {
      test('processClickEvent enriches event with browser/os/device/traffic source', async () => {
        const event = {
          eventId: 'evt-enrich-1',
          urlId: 'url1',
          shortCode: 'abc',
          timestamp: new Date(),
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          referrer: 'https://google.com/search?q=test',
        };
        mockAnalyticsRepo.create.mockResolvedValue(event);

        await analyticsService.processClickEvent(event);

        expect(mockAnalyticsRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            eventId: 'evt-enrich-1',
            metadata: expect.objectContaining({
              browser: 'Chrome',
              os: 'Windows',
              deviceType: 'Desktop',
              trafficSource: 'Search',
            }),
          })
        );
      });

      test('processClickEvent is idempotent — duplicate eventId is silently ignored', async () => {
        const event = { eventId: 'evt-dup-1', urlId: 'url1', shortCode: 'abc' };
        const dupError = new Error('E11000 duplicate key error');
        dupError.code = 11000;

        mockAnalyticsRepo.create
          .mockResolvedValueOnce(event) // first call succeeds
          .mockRejectedValueOnce(dupError); // second call is duplicate

        // First call succeeds
        await analyticsService.processClickEvent(event);
        expect(mockAnalyticsRepo.create).toHaveBeenCalledTimes(1);

        // Second call with same eventId does NOT throw
        await expect(analyticsService.processClickEvent(event)).resolves.toBeUndefined();
        expect(mockAnalyticsRepo.create).toHaveBeenCalledTimes(2);
      });

      test('processClickEvent re-throws non-duplicate MongoDB errors', async () => {
        const event = { eventId: 'evt-fail-1', urlId: 'url1', shortCode: 'abc' };
        mockAnalyticsRepo.create.mockRejectedValue(new Error('MongoServerSelectionError'));

        await expect(analyticsService.processClickEvent(event)).rejects.toThrow('MongoServerSelectionError');
      });

      test('processClickEvent handles events with no referrer (Direct traffic)', async () => {
        const event = {
          eventId: 'evt-direct-1',
          urlId: 'url1',
          shortCode: 'abc',
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X)',
          referrer: null,
        };
        mockAnalyticsRepo.create.mockResolvedValue(event);

        await analyticsService.processClickEvent(event);

        expect(mockAnalyticsRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({
              os: 'iOS',
              deviceType: 'Mobile',
              trafficSource: 'Direct',
            }),
          })
        );
      });
    });

    describe('API Resilience — clickCount vs AnalyticsEvent', () => {
      test('getSummary uses clickCount as authoritative total, not AnalyticsEvent count', async () => {
        // Simulate: 16 total clicks, but only 5 analytics events processed
        mockUrlRepo.findByIdForOwner.mockResolvedValue({ _id: 'url1', owner: 'user1', clickCount: 16 });
        mockAnalyticsRepo.getSummary.mockResolvedValue([{
          totalClicks: 5,
          topBrowsers: ['Chrome', 'Chrome', 'Chrome', 'Chrome', 'Chrome'],
          topOS: ['Windows', 'Windows', 'Windows', 'Windows', 'Windows'],
          topDevices: ['Desktop', 'Desktop', 'Desktop', 'Desktop', 'Desktop'],
          topSources: ['Direct', 'Direct', 'Direct', 'Direct', 'Direct'],
        }]);

        const summary = await analyticsService.getSummary('user1', 'url1');

        // totalClicks must be 16 (from Url.clickCount), NOT 5 (from AnalyticsEvent)
        expect(summary.totalClicks).toBe(16);
        // But breakdowns come from the 5 tracked events
        expect(summary.topBrowsers).toEqual([{ name: 'Chrome', clicks: 5 }]);
      });

      test('getSummary returns empty breakdowns when no analytics events exist', async () => {
        mockUrlRepo.findByIdForOwner.mockResolvedValue({ _id: 'url1', owner: 'user1', clickCount: 10 });
        mockAnalyticsRepo.getSummary.mockResolvedValue([]);

        const summary = await analyticsService.getSummary('user1', 'url1');

        expect(summary.totalClicks).toBe(10);
        expect(summary.topBrowsers).toEqual([]);
        expect(summary.topDevices).toEqual([]);
        expect(summary.topTrafficSources).toEqual([]);
      });
    });
  });

  describe('AnalyticsPublisher — Redis Failure Isolation', () => {
    test('publishClickEvent does NOT throw when queue.add fails (Redis unavailable)', async () => {
      const publisher = new AnalyticsPublisher();
      const { analyticsQueue } = require('../src/infrastructure/queue/analytics.queue');
      const spy = jest.spyOn(analyticsQueue, 'add').mockRejectedValue(new Error('ECONNREFUSED'));

      // Must NOT throw — the redirect flow is isolated from queue failures
      await expect(publisher.publishClickEvent({
        eventId: 'test-event-1',
        urlId: 'url1',
        shortCode: 'abc',
        timestamp: new Date(),
        userAgent: 'test',
      })).resolves.toBeUndefined();

      spy.mockRestore();
    });

    test('publishClickEvent passes correct job configuration', async () => {
      const publisher = new AnalyticsPublisher();
      const { analyticsQueue } = require('../src/infrastructure/queue/analytics.queue');
      const spy = jest.spyOn(analyticsQueue, 'add').mockResolvedValue({});

      const event = { eventId: 'evt-123', urlId: 'url1', shortCode: 'abc', timestamp: new Date(), userAgent: 'test' };
      await publisher.publishClickEvent(event);

      expect(spy).toHaveBeenCalledWith('click-event', event, {
        jobId: 'evt-123',
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: 100,
      });

      spy.mockRestore();
    });
  });
});
