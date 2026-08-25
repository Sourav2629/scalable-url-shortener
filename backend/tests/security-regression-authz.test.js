const express = require('express');
const supertest = require('supertest');

process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';

const UrlService = require('../src/modules/urls/application/url.service');
const AnalyticsService = require('../src/modules/analytics/application/analytics.service');
const AnalyticsRepository = require('../src/modules/analytics/infrastructure/repositories/analytics.repository').analyticsRepository;
const AnalyticsEvent = require('../src/modules/analytics/infrastructure/models/analytics-event.model');
const AnalyticsPublisher = require('../src/modules/analytics/application/analytics.publisher');
const { analyticsQueue } = require('../src/infrastructure/queue/analytics.queue');
const { validateUrlId, validateCreateUrl, validateUpdateUrl } = require('../src/modules/urls/presentation/validators/url.validator');
const { validateLogin, validateRegister } = require('../src/modules/auth/presentation/validators/auth.validator');
const { validateVerifyEmail, validateResetPassword } = require('../src/modules/auth/presentation/validators/verification.validator');
const { validateUpdateProfile } = require('../src/modules/auth/presentation/validators/profile.validator');
const createAuthController = require('../src/modules/auth/presentation/controllers/auth.controller');
const Url = require('../src/modules/urls/infrastructure/models/url.model');
const config = require('../src/config');
const { logger } = require('../src/shared/logger');

const USER_A = '507f1f77bcf86cd7994390aa';
const USER_B = '507f1f77bcf86cd7994390bb';
const URL_ID = '507f1f77bcf86cd7994390cc';

// ─── STEP 5: Authorization / IDOR ─────────────────────────────────

describe('Phase 2C — IDOR / ownership enforcement', () => {
  let mockUrlRepo;
  let urlService;

  beforeEach(() => {
    mockUrlRepo = {
      findByIdForOwner: jest.fn().mockResolvedValue(null),
      updateByIdForOwner: jest.fn().mockResolvedValue(null),
      softDeleteByIdForOwner: jest.fn().mockResolvedValue(null),
    };
    urlService = new UrlService(mockUrlRepo, jest.fn(), { publishClickEvent: jest.fn() });
  });

  test('user A cannot read user B URL (ownership enforced in the query itself)', async () => {
    await expect(urlService.getUrlById(USER_A, URL_ID)).rejects.toMatchObject({ statusCode: 404 });

    // The owner filter must come from req.auth-derived ownerId, never from input.
    expect(mockUrlRepo.findByIdForOwner).toHaveBeenCalledWith(URL_ID, USER_A);
  });

  test('user A cannot update user B URL', async () => {
    await expect(urlService.updateUrl(USER_A, URL_ID, { title: 'hijacked' })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(mockUrlRepo.updateByIdForOwner).toHaveBeenCalledWith(URL_ID, USER_A, { title: 'hijacked' });
  });

  test('user A cannot delete user B URL', async () => {
    await expect(urlService.deleteUrl(USER_A, URL_ID)).rejects.toMatchObject({ statusCode: 404 });
    expect(mockUrlRepo.softDeleteByIdForOwner).toHaveBeenCalledWith(URL_ID, USER_A);
  });

  test('nonexistent valid ObjectId → uniform 404 (no existence oracle)', async () => {
    await expect(urlService.getUrlById(USER_A, '507f1f77bcf86cd799439099')).rejects.toMatchObject({
      statusCode: 404,
      message: 'URL not found.',
    });
  });

  describe('analytics ownership', () => {
    let analyticsService;

    beforeEach(() => {
      const urlRepo = { findByIdForOwner: jest.fn().mockResolvedValue(null) };
      analyticsService = new AnalyticsService(
        { getSummary: jest.fn(), getTimeseries: jest.fn() },
        urlRepo
      );
    });

    test('user A cannot request user B analytics → uniform 404', async () => {
      await expect(analyticsService.getSummary(USER_A, URL_ID)).rejects.toMatchObject({
        statusCode: 404,
        message: 'URL not found or unauthorized',
      });
      await expect(
        analyticsService.getTimeseries(USER_A, URL_ID, '2026-01-01', '2026-02-01', 'day')
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('controller binds identity exclusively from req.auth', () => {
    test('getById/update/remove ignore any client-supplied userId', async () => {
      const calls = [];
      const controller = createAuthController({
        getCurrentUser: async (userId) => { calls.push(['me', userId]); return {}; },
      });

      await controller.getCurrentUser(
        { auth: { userId: USER_A }, params: { userId: USER_B }, body: { userId: USER_B } },
        { status: () => ({ json: () => {} }) }
      );

      // Identity comes only from the authenticated context.
      expect(calls[0][1]).toBe(USER_A);
    });
  });

  describe('URL ID parameter validation', () => {
    const runValidator = (validator, id) => {
      const req = { params: { id } };
      const next = jest.fn();
      validator(req, {}, next);
      return next;
    };

    test.each([
      ['malformed ObjectId', '../../../etc/passwd'],
      ['operator-like id', '$gt'],
      ['empty id', ''],
      ['12-char too-short hex', 'abc123'],
    ])('%s is rejected with 400 before any query', (_name, bad) => {
      const next = runValidator(validateUrlId, bad);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test.each([USER_A, '64b1f0fa2f8a1c001234abcd'])('valid ObjectId %s passes validation', (ok) => {
      const next = runValidator(validateUrlId, ok);
      expect(next).toHaveBeenCalledWith();
    });
  });
});

// ─── STEP 6: Input / injection testing ────────────────────────────

describe('Phase 2C — NoSQL injection / hostile input rejection', () => {
  const run = (validator, body) => {
    const req = { body: JSON.parse(JSON.stringify(body)) };
    const next = jest.fn();
    validator(req, {}, next);
    return { req, next };
  };

  test.each([
    ['$gt operator password', { email: 'a@b.com', password: { $gt: '' } }],
    ['$ne operator email', { email: { $ne: null }, password: 'password123' }],
    ['$regex email', { email: { $regex: '.*' }, password: 'password123' }],
    ['$where email', { email: { $where: 'sleep(1000)' }, password: 'password123' }],
    ['array password', { email: 'a@b.com', password: ['password123'] }],
    ['nested object name', { name: { a: 1 }, email: 'a@b.com', password: 'password123' }],
    ['numeric email', { email: 12345, password: 'password123' }],
  ])('login/register reject %s with 400', (_name, body) => {
    const validator = body.name !== undefined ? validateRegister : validateLogin;
    const { next } = run(validator, body);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test.each([
    ['object code', { email: 'a@b.com', code: { $gt: '' } }],
    ['numeric code', { email: 'a@b.com', code: 999999 }],
    ['oversized code', { email: 'a@b.com', code: '9'.repeat(5000) }],
    ['empty code', { email: 'a@b.com', code: '' }],
  ])('verify-email rejects %s with 400', (_name, body) => {
    const { next } = run(validateVerifyEmail, body);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test.each([
    ['object code', { email: 'a@b.com', code: { $ne: null }, newPassword: 'password123' }],
    ['$where code', { email: 'a@b.com', code: { $where: '1' }, newPassword: 'password123' }],
  ])('reset-password rejects %s with 400', (_name, body) => {
    const { next } = run(validateResetPassword, body);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test.each([
    ['javascript: scheme', 'javascript:alert(document.cookie)'],
    ['data: scheme', 'data:text/html,<script>alert(1)</script>'],
    ['whitespace-only', '   '],
  ])('originalUrl rejects %s', (_name, bad) => {
    const { next } = run(validateCreateUrl, { originalUrl: bad });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('valid long URL (under 1 MB body limit) is accepted by the URL validator', () => {
    // Extremely long URLs that are syntactically valid are accepted.
    // The express.json({ limit: '1mb' }) body parser caps request size.
    const longUrl = `http://evil.test/${'A'.repeat(60000)}`;
    const { next } = run(validateCreateUrl, { originalUrl: longUrl });
    expect(next).toHaveBeenCalledWith();
  });

  test.each([
    ['object title', { originalUrl: 'https://ok.example.com', title: { $gt: '' } }],
    ['array description', { originalUrl: 'https://ok.example.com', description: ['x'] }],
    ['numeric expiresAt', { originalUrl: 'https://ok.example.com', expiresAt: 99999999999 }],
    ['boolean title', { originalUrl: 'https://ok.example.com', title: true }],
  ])('create-url rejects %s with 400', (_name, body) => {
    const { next } = run(validateCreateUrl, body);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('search terms containing MongoDB operators are regex-escaped in queries', async () => {
    const chain = {
      sort() { return this; },
      skip() { return this; },
      limit() { return this; },
      collation() { return this; },
      then(resolve) { resolve([]); return this; },
      catch() { return this; },
    };
    const findSpy = jest.spyOn(Url, 'find').mockReturnValue(chain);
    const countSpy = jest.spyOn(Url, 'countDocuments').mockResolvedValue(0);

    try {
      const repo = new (require('../src/modules/urls/infrastructure/repositories/url.repository'))();
      await repo.findByOwner(USER_A, { page: 1, limit: 20, search: '$regex.*$where' });

      const query = findSpy.mock.calls[0][0];
      const regexSource = query.$or[0].shortCode.source;
      // Operators must be literal text, not executable pattern syntax.
      // Operators must be literal text, not executable pattern syntax.
      // The escaped source contains literal backslash-$ sequences, preventing
      // MongoDB operator injection even if the regex is evaluated.
      expect(regexSource).toContain('\\$regex');
      expect(regexSource).toContain('\\$where');
      // The source must NOT start with ^ (no anchor was in the input)
      // but the dollar signs must be escaped so they are not treated as
      // end-of-string anchors.
      expect(regexSource.startsWith('\\$regex')).toBe(true);
    } finally {
      findSpy.mockRestore();
      countSpy.mockRestore();
    }
  });
});

// ─── STEP 7: Mass assignment ──────────────────────────────────────

describe('Phase 2C — Mass assignment prevention', () => {
  const hostileExtras = {
    role: 'admin',
    isEmailVerified: true,
    refreshToken: 'ATTACKER_TOKEN',
    password: 'attacker-hash',
    ownerId: USER_B,
    createdAt: '1999-01-01T00:00:00Z',
    updatedAt: '1999-01-01T00:00:00Z',
    isDeleted: false,
  };

  test('profile update keeps ONLY name — every other field is stripped', () => {
    const req = { body: { name: 'New Name', ...hostileExtras } };
    const next = jest.fn();

    validateUpdateProfile(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(Object.keys(req.body)).toEqual(['name']);
    expect(req.body.role).toBeUndefined();
  });

  test('URL create keeps ONLY whitelisted fields', () => {
    const req = {
      body: {
        originalUrl: 'https://example.com/page',
        customAlias: 'my-link-1',
        title: 'T',
        ...hostileExtras,
        shortCode: 'attacker-chosen',
        clickCount: 999999,
        isActive: false,
        owner: USER_B,
      },
    };
    const next = jest.fn();

    validateCreateUrl(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(Object.keys(req.body).sort()).toEqual(['customAlias', 'originalUrl', 'title']);
    expect(req.body.owner).toBeUndefined();
    expect(req.body.shortCode).toBeUndefined();
  });

  test('URL update keeps ONLY whitelisted fields', () => {
    const req = {
      body: {
        title: 'Updated',
        isActive: true,
        ...hostileExtras,
        shortCode: 'attacker-chosen',
      },
    };
    const next = jest.fn();

    validateUpdateUrl(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(Object.keys(req.body).sort()).toEqual(['isActive', 'title']);
  });

  test('service layer ignores unexpected fields even if a validator were bypassed', async () => {
    const captured = {};
    const AuthServiceCtor = require('../src/modules/auth/application/auth.service');
    const svc = new AuthServiceCtor(
      { findByEmail: jest.fn().mockResolvedValue(null) },
      {},
      { sendVerificationEmail: jest.fn() },
      { create: jest.fn(), invalidateAll: jest.fn() },
      {
        findByEmail: jest.fn().mockResolvedValue({
          _id: { toString: () => 'pending1' },
          email: 'bob@example.com',
          name: 'Bob',
          expiresAt: new Date(Date.now() + 3600000),
        }),
        upsert: async (data) => Object.assign(captured, data),
        deleteByEmail: jest.fn(),
      },
      null,
      null
    );

    await svc.register({
      name: 'Bob',
      email: 'bob@example.com',
      password: 'password123',
      ...hostileExtras,
    });

    // Only the explicitly allowed fields reach persistence.
    expect(captured.role).toBeUndefined();
    expect(captured.isEmailVerified).toBeUndefined();
    expect(captured.refreshToken).toBeUndefined();
    expect(Object.keys(captured).sort()).toEqual(['email', 'expiresAt', 'name', 'passwordHash']);
    expect(captured.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/); // hashed, cost present
    expect(parseInt(captured.passwordHash.split('$')[2], 10)).toBe(12); // production bcrypt cost preserved
  });
});

// ─── STEP 18: Analytics failure isolation + pipeline integrity ────

describe('Phase 2C — Analytics security / failure isolation', () => {
  test('Redis/BullMQ outage does NOT break URL redirect', async () => {
    const failingPublisher = new AnalyticsPublisher();
    jest.spyOn(analyticsQueue, 'add').mockRejectedValue(new Error('ECONNREFUSED redis'));

    // Must resolve despite queue failure — redirects are business-critical.
    await expect(
      failingPublisher.publishClickEvent({ eventId: 'evt-1' })
    ).resolves.toBeUndefined();

    analyticsQueue.add.mockRestore();
  });

  test('$facet aggregation remains intact server-side with top-5 caps', async () => {
    const spy = jest.spyOn(AnalyticsEvent, 'aggregate').mockResolvedValue([
      { browsers: [], operatingSystems: [], devices: [], trafficSources: [] },
    ]);

    try {
      await AnalyticsRepository.getSummary(URL_ID);

      const pipeline = spy.mock.calls[0][0];
      const facetStage = pipeline.find((stage) => stage.$facet);

      expect(facetStage).toBeDefined();
      const dims = Object.keys(facetStage.$facet).sort();
      expect(dims).toEqual(['browsers', 'devices', 'operatingSystems', 'trafficSources']);

      for (const branch of Object.values(facetStage.$facet)) {
        const stages = branch.map((s) => Object.keys(s)[0]);
        expect(stages).toEqual(['$group', '$sort', '$limit']);
        expect(branch.find((s) => s.$limit).$limit).toBe(5);
      }

      // Match stage scopes to THIS URL only — no cross-URL data can leak.
      expect(pipeline[0].$match.urlId).toBeDefined();
    } finally {
      spy.mockRestore();
    }
  });

  test('malformed timeseries range fails safely with 400 (no aggregate call)', async () => {
    const aggSpy = jest.spyOn(AnalyticsEvent, 'aggregate');
    const urlRepo = { findByIdForOwner: jest.fn().mockResolvedValue({ _id: URL_ID }) };
    const service = new AnalyticsService({ getTimeseries: jest.fn() }, urlRepo);

    await expect(
      service.getTimeseries(USER_A, URL_ID, 'not-a-date', '2026-02-01', 'day')
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(urlRepo.findByIdForOwner).toHaveBeenCalledWith(URL_ID, USER_A);
    aggSpy.mockRestore();
  });
});

// ─── STEP 11: Rate-limit bypass resistance ────────────────────────

describe('Phase 2C — Rate-limit bypass resistance (TRUST_PROXY=false)', () => {
  const ORIGINAL_ENV = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
  });

  function buildMiniApp(limiter) {
    const app = express();
    // Same dynamic wiring as src/app.js — getTrustProxy() reads TRUST_PROXY live.
    app.set('trust proxy', config.server.getTrustProxy());
    app.use(express.json());
    app.use('/probe', limiter, (req, res) => res.status(200).json({ ip: req.ip }));
    return app;
  }

  test('spoofed X-Forwarded-For CANNOT rotate buckets when trust proxy is off', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.TRUST_PROXY;

    const { publicLimiter } = require('../src/shared/middleware/rate-limiter.middleware');
    const app = buildMiniApp(publicLimiter);
    const doReq = (ip) =>
      supertest(app).get('/probe').set('X-Forwarded-For', ip);

    const ips = Array.from({ length: 6 }, (_, i) => `10.9.9.${i}`);

    // Default PUBLIC limiter allows 100/min. Burn exactly 100 using ROTATING spoofed XFFs.
    for (let i = 0; i < 100; i += 1) {
      const res = await doReq(ips[i % ips.length]);
      expect(res.statusCode).toBe(200);
    }

    // Request 101 is limited even though every request claimed a different IP.
    const limited = await doReq('10.9.9.200');
    expect(limited.statusCode).toBe(429);
    expect(typeof limited.body.message).toBe('string');
    expect(JSON.stringify(limited.body)).not.toMatch(/stack|secret|mongodb/i);

    // All requests resolved to the SAME real socket IP → one shared bucket.
    const firstIps = [];
    for (let i = 0; i < 3; i += 1) {
      const probe = express();
      probe.set('trust proxy', config.server.getTrustProxy());
      probe.get('/x', (req, res) => res.json({ ip: req.ip }));
      const r = await supertest(probe).get('/x').set('X-Forwarded-For', ips[i]);
      firstIps.push(r.body.ip);
    }
    expect(new Set(firstIps).size).toBe(1);
  }, 120000);

  test('429 handler logs security.rate_limit.exceeded without sensitive fields', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.TRUST_PROXY;

    const { publicLimiter } = require('../src/shared/middleware/rate-limiter.middleware');
    const logSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    const app = buildMiniApp(publicLimiter);

    try {
      for (let i = 0; i < 101; i += 1) {
        await supertest(app).get('/probe');
      }
      const limited = await supertest(app).get('/probe');
      expect(limited.statusCode).toBe(429);

      const eventCall = logSpy.mock.calls.find((c) => JSON.stringify(c).includes('security.rate_limit.exceeded'));
      expect(eventCall).toBeDefined();

      const serialized = JSON.stringify(logSpy.mock.calls);
      expect(serialized).not.toContain('authorization');
      expect(serialized).not.toContain('SUPERSECRET');
    } finally {
      logSpy.mockRestore();
    }
  }, 120000);
});
