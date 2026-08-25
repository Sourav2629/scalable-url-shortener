const mongoose = require('mongoose');

// Mock the AnalyticsEvent Mongoose model at file level so it's hoisted before
// any require() of the repository.  This avoids a real MongoDB connection while
// still allowing us to inspect the aggregate pipeline.
const mockAggregate = jest.fn();
jest.mock('../src/modules/analytics/infrastructure/models/analytics-event.model', () => ({
  aggregate: mockAggregate,
  create: jest.fn(),
  deleteMany: jest.fn(),
  schema: { index: jest.fn() },
}));

const AnalyticsService = require('../src/modules/analytics/application/analytics.service');
const AnalyticsPublisher = require('../src/modules/analytics/application/analytics.publisher');
const { parseUserAgent } = require('../src/modules/analytics/utils/ua-parser');
const { classifyReferrer } = require('../src/modules/analytics/utils/referrer-classifier');
const AppError = require('../src/shared/errors/app-error');

// ---- helpers: build repository-grouped mock shapes ----

function groupedRows(pairs) {
  return pairs.map(([value, clicks]) => ({ _id: value, clicks }));
}

function emptyBreakdown() {
  return {
    browsers: [],
    operatingSystems: [],
    devices: [],
    trafficSources: [],
  };
}

function richBreakdown() {
  return {
    browsers: groupedRows([['Chrome', 3], ['Firefox', 1]]),
    operatingSystems: groupedRows([['Windows', 3], ['MacOS', 1]]),
    devices: groupedRows([['Desktop', 3], ['Mobile', 1]]),
    trafficSources: groupedRows([['Search', 2], ['Direct', 1], ['Social', 1]]),
  };
}

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
        mockUrlRepo.findByIdForOwner.mockImplementation((id, ownerId) => {
          if (ownerId === 'userA') {
            return Promise.resolve({ _id: id, owner: 'userA', clickCount: 10 });
          }
          return Promise.resolve(null);
        });

        // Repository now returns the grouped shape
        mockAnalyticsRepo.getSummary.mockResolvedValue({
          browsers: groupedRows([['Chrome', 10]]),
          operatingSystems: groupedRows([['Windows', 10]]),
          devices: groupedRows([['Desktop', 10]]),
          trafficSources: groupedRows([['Direct', 10]]),
        });

        // User A can get their analytics
        const summary = await analyticsService.getSummary('userA', 'url1');
        expect(summary.totalClicks).toBe(10);
        expect(summary.topBrowsers).toEqual([{ name: 'Chrome', clicks: 10 }]);

        // User B cannot get User A's analytics — throws 404
        await expect(analyticsService.getSummary('userB', 'url1')).rejects.toThrow(
          expect.objectContaining({ statusCode: 404 })
        );

        expect(mockUrlRepo.findByIdForOwner).toHaveBeenCalledWith('url1', 'userB');
      });

      test('returns default empty summary when no analytics data exists', async () => {
        mockUrlRepo.findByIdForOwner.mockResolvedValue({ _id: 'url1', owner: 'user1' });
        mockAnalyticsRepo.getSummary.mockResolvedValue(emptyBreakdown());

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

      test('formats server-side grouped results correctly', async () => {
        mockUrlRepo.findByIdForOwner.mockResolvedValue({ _id: 'url1', owner: 'user1', clickCount: 5 });
        mockAnalyticsRepo.getSummary.mockResolvedValue(richBreakdown());

        const summary = await analyticsService.getSummary('user1', 'url1');
        expect(summary.totalClicks).toBe(5);
        expect(summary.topBrowsers).toEqual([
          { name: 'Chrome', clicks: 3 },
          { name: 'Firefox', clicks: 1 },
        ]);
        expect(summary.topTrafficSources).toEqual([
          { name: 'Search', clicks: 2 },
          { name: 'Direct', clicks: 1 },
          { name: 'Social', clicks: 1 },
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

        const ts = await analyticsService.getTimeseries('userA', 'url1', '2026-08-20', '2026-08-21', 'day');
        expect(ts.data).toHaveLength(1);

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
          .mockResolvedValueOnce(event)
          .mockRejectedValueOnce(dupError);

        await analyticsService.processClickEvent(event);
        expect(mockAnalyticsRepo.create).toHaveBeenCalledTimes(1);

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
        mockUrlRepo.findByIdForOwner.mockResolvedValue({ _id: 'url1', owner: 'user1', clickCount: 16 });
        mockAnalyticsRepo.getSummary.mockResolvedValue({
          browsers: groupedRows([['Chrome', 5]]),
          operatingSystems: groupedRows([['Windows', 5]]),
          devices: groupedRows([['Desktop', 5]]),
          trafficSources: groupedRows([['Direct', 5]]),
        });

        const summary = await analyticsService.getSummary('user1', 'url1');

        // totalClicks must be 16 (from Url.clickCount), NOT 5 (from AnalyticsEvent)
        expect(summary.totalClicks).toBe(16);
        expect(summary.topBrowsers).toEqual([{ name: 'Chrome', clicks: 5 }]);
      });

      test('getSummary returns empty breakdowns when no analytics events exist', async () => {
        mockUrlRepo.findByIdForOwner.mockResolvedValue({ _id: 'url1', owner: 'user1', clickCount: 10 });
        mockAnalyticsRepo.getSummary.mockResolvedValue(emptyBreakdown());

        const summary = await analyticsService.getSummary('user1', 'url1');

        expect(summary.totalClicks).toBe(10);
        expect(summary.topBrowsers).toEqual([]);
        expect(summary.topDevices).toEqual([]);
        expect(summary.topTrafficSources).toEqual([]);
      });

      test('_format correctly converts grouped rows [{_id, clicks}] to API shape [{name, clicks}]', async () => {
        mockUrlRepo.findByIdForOwner.mockResolvedValue({ _id: 'url1', owner: 'user1', clickCount: 10 });
        mockAnalyticsRepo.getSummary.mockResolvedValue(richBreakdown());

        const summary = await analyticsService.getSummary('user1', 'url1');

        expect(summary.topBrowsers).toEqual([
          { name: 'Chrome', clicks: 3 },
          { name: 'Firefox', clicks: 1 },
        ]);
        expect(summary.topOperatingSystems).toEqual([
          { name: 'Windows', clicks: 3 },
          { name: 'MacOS', clicks: 1 },
        ]);
        expect(summary.topDevices).toEqual([
          { name: 'Desktop', clicks: 3 },
          { name: 'Mobile', clicks: 1 },
        ]);
        expect(summary.topTrafficSources).toEqual([
          { name: 'Search', clicks: 2 },
          { name: 'Direct', clicks: 1 },
          { name: 'Social', clicks: 1 },
        ]);
      });
    });
  });

  describe('AnalyticsPublisher — Redis Failure Isolation', () => {
    test('publishClickEvent does NOT throw when queue.add fails (Redis unavailable)', async () => {
      const publisher = new AnalyticsPublisher();
      const { analyticsQueue } = require('../src/infrastructure/queue/analytics.queue');
      const spy = jest.spyOn(analyticsQueue, 'add').mockRejectedValue(new Error('ECONNREFUSED'));

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

  // ========================================================================
  // Repository — Server-Side Aggregation Pipeline Tests
  // ========================================================================

  describe('AnalyticsRepository — Server-Side Aggregation Pipeline', () => {
    const { analyticsRepository } = require('../src/modules/analytics/infrastructure/repositories/analytics.repository');

    beforeEach(() => {
      mockAggregate.mockReset();
    });

    test('getSummary uses $facet with 4 server-side grouped dimensions', async () => {
      mockAggregate.mockResolvedValue([{
        browsers: [{ _id: 'Chrome', clicks: 5 }],
        operatingSystems: [{ _id: 'Windows', clicks: 5 }],
        devices: [{ _id: 'Desktop', clicks: 5 }],
        trafficSources: [{ _id: 'Direct', clicks: 5 }],
      }]);

      await analyticsRepository.getSummary('507f1f77bcf86cd799439011');

      // Aggregate called once (single DB round-trip)
      expect(mockAggregate).toHaveBeenCalledTimes(1);

      const pipeline = mockAggregate.mock.calls[0][0];

      // Pipeline starts with $match on urlId
      expect(pipeline[0]).toHaveProperty('$match');

      // Pipeline uses $facet — NOT $push
      const facetStage = pipeline.find(s => s.$facet);
      expect(facetStage).toBeDefined();

      // $facet contains exactly 4 dimensions
      const dimensions = Object.keys(facetStage.$facet);
      expect(dimensions).toEqual(
        expect.arrayContaining(['browsers', 'operatingSystems', 'devices', 'trafficSources'])
      );

      // Each dimension pipeline: $group + $sort + $limit: 5
      for (const dim of dimensions) {
        const dimPipeline = facetStage.$facet[dim];
        expect(dimPipeline.some(s => s.$group)).toBe(true);
        expect(dimPipeline.some(s => s.$sort)).toBe(true);
        const limitStage = dimPipeline.find(s => s.$limit);
        expect(limitStage).toBeDefined();
        expect(limitStage.$limit).toBe(5);
      }
    });

    test('getSummary pipeline does NOT contain $push anywhere', async () => {
      mockAggregate.mockResolvedValue([emptyBreakdown()]);

      await analyticsRepository.getSummary('507f1f77bcf86cd799439011');

      const pipeline = mockAggregate.mock.calls[0][0];
      const pipelineStr = JSON.stringify(pipeline);
      expect(pipelineStr).not.toContain('$push');
    });

    test('getSummary returns empty breakdowns when no documents match', async () => {
      // Aggregate returns empty array (no matching events)
      mockAggregate.mockResolvedValue([]);

      const result = await analyticsRepository.getSummary('507f1f77bcf86cd799439011');

      expect(result).toEqual({
        browsers: [],
        operatingSystems: [],
        devices: [],
        trafficSources: [],
      });
    });

    test('getSummary returns grouped result from MongoDB as-is', async () => {
      const mongoResult = {
        browsers: [{ _id: 'Chrome', clicks: 10 }, { _id: 'Firefox', clicks: 3 }],
        operatingSystems: [{ _id: 'Windows', clicks: 12 }],
        devices: [{ _id: 'Mobile', clicks: 8 }, { _id: 'Desktop', clicks: 5 }],
        trafficSources: [{ _id: 'Search', clicks: 7 }, { _id: 'Social', clicks: 4 }],
      };
      mockAggregate.mockResolvedValue([mongoResult]);

      const result = await analyticsRepository.getSummary('507f1f77bcf86cd799439011');

      expect(result).toEqual(mongoResult);
    });

    test('getSummary converts string urlId to ObjectId in $match', async () => {
      mockAggregate.mockResolvedValue([emptyBreakdown()]);

      const urlIdStr = '507f1f77bcf86cd799439011';
      await analyticsRepository.getSummary(urlIdStr);

      const pipeline = mockAggregate.mock.calls[0][0];
      const matchStage = pipeline[0].$match;
      expect(matchStage.urlId).toBeInstanceOf(mongoose.Types.ObjectId);
      expect(matchStage.urlId.toString()).toBe(urlIdStr);
    });

    // ====================================================================
    // Scalability Tests — Large Event Volume
    // ====================================================================

    test('scalability: large event volume returns only top-5 per dimension (bounded memory)', async () => {
      // Simulate what MongoDB returns after server-side grouping:
      // even with 1,000,000 clicks and 200 distinct browser values,
      // MongoDB's $group + $sort + $limit: 5 returns at most 5 rows.
      const largeVolumeResult = {
        browsers: [
          { _id: 'Chrome', clicks: 500000 },
          { _id: 'Safari', clicks: 200000 },
          { _id: 'Firefox', clicks: 150000 },
          { _id: 'Edge', clicks: 100000 },
          { _id: 'Opera', clicks: 50000 },
        ],
        operatingSystems: [
          { _id: 'Windows', clicks: 400000 },
          { _id: 'iOS', clicks: 250000 },
          { _id: 'Android', clicks: 200000 },
          { _id: 'MacOS', clicks: 100000 },
          { _id: 'Linux', clicks: 50000 },
        ],
        devices: [
          { _id: 'Desktop', clicks: 500000 },
          { _id: 'Mobile', clicks: 400000 },
          { _id: 'Tablet', clicks: 100000 },
        ],
        trafficSources: [
          { _id: 'Direct', clicks: 300000 },
          { _id: 'Search', clicks: 250000 },
          { _id: 'Social', clicks: 200000 },
          { _id: 'Referral', clicks: 150000 },
          { _id: 'Other', clicks: 100000 },
        ],
      };

      mockAggregate.mockResolvedValue([largeVolumeResult]);

      const result = await analyticsRepository.getSummary('507f1f77bcf86cd799439011');

      // Each dimension is bounded
      expect(result.browsers).toHaveLength(5);
      expect(result.operatingSystems).toHaveLength(5);
      expect(result.devices).toHaveLength(3); // only 3 distinct device types
      expect(result.trafficSources).toHaveLength(5);

      // Pipeline enforces $limit: 5 at the DB level
      const pipeline = mockAggregate.mock.calls[0][0];
      const facetStage = pipeline.find(s => s.$facet);
      for (const dim of Object.keys(facetStage.$facet)) {
        const limitStage = facetStage.$facet[dim].find(s => s.$limit);
        expect(limitStage.$limit).toBe(5);
      }
    });

    test('scalability: application never receives unbounded arrays from repository', async () => {
      // The repository contract: return structured [{_id, clicks}], NOT raw pushed arrays
      mockAggregate.mockResolvedValue([{
        browsers: groupedRows([['Chrome', 100]]),
        operatingSystems: groupedRows([['Windows', 100]]),
        devices: groupedRows([['Desktop', 100]]),
        trafficSources: groupedRows([['Direct', 100]]),
      }]);

      const result = await analyticsRepository.getSummary('507f1f77bcf86cd799439011');

      for (const dim of ['browsers', 'operatingSystems', 'devices', 'trafficSources']) {
        expect(Array.isArray(result[dim])).toBe(true);
        for (const row of result[dim]) {
          expect(row).toHaveProperty('_id');
          expect(row).toHaveProperty('clicks');
          expect(typeof row.clicks).toBe('number');
        }
      }
    });


  });
});
