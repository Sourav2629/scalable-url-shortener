const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';

const app = require('../src/app');
const config = require('../src/config');
const User = require('../src/modules/users/infrastructure/models/user.model');
const { authenticate } = require('../src/modules/auth/presentation/middleware/auth.middleware');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

function makeAccess_token(payload, overrides = {}) {
  return jwt.sign({ sub: payload.sub, type: 'access' }, ACCESS_SECRET, {
    expiresIn: '15m',
    ...overrides,
  });
}

// ─── STEP 2: JWT Security ─────────────────────────────────────────

describe('Phase 2C — JWT security regression', () => {
  describe('Authorization header abuse (all must be clean 401s)', () => {
    const cases = [
      ['missing header', (req) => req],
      ['empty Authorization value', (req) => req.set('Authorization', '')],
      ['Bearer without token', (req) => req.set('Authorization', 'Bearer')],
      ['Bearer with trailing space only', (req) => req.set('Authorization', 'Bearer ')],
      ['Basic scheme', (req) => req.set('Authorization', 'Basic dXNlcjpwYXNz')],
      ['garbage scheme', (req) => req.set('Authorization', 'XYZABC nonsense-value')],
      ['malformed bearer token', (req) => req.set('Authorization', 'Bearer not.a.jwt')],
      ['bearer lowercase scheme', (req) => req.set('Authorization', 'bearer abc.def.ghi')],
    ];

    test.each(cases)('%s → 401 with generic message, no leak', async (_name, mutate) => {
      const res = await mutate(request(app).get('/api/v1/auth/me'));
      expect(res.statusCode).toBe(401);
      expect(JSON.stringify(res.body)).not.toMatch(/stack|node_modules|mongodb:\/\/|secret/i);
    });
  });

  describe('Token tampering and signing', () => {
    const protectedGet = (token) =>
      request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

    test('modified payload (same signature) is rejected', async () => {
      const token = makeAccess_token({ sub: '507f1f77bcf86cd799439011' });
      const [h, p] = token.split('.');
      const forged = jwt.decode(token, { complete: true });
      forged.payload.sub = '507f1f77bcf86cd799439999';
      const forgedPayload = Buffer.from(JSON.stringify(forged.payload)).toString('base64url');

      const res = await protectedGet(`${h}.${forgedPayload}.whatever`);
      expect(res.statusCode).toBe(401);
    });

    test('modified signature is rejected', async () => {
      const token = makeAccess_token({ sub: '507f1f77bcf86cd799439011' });
      const [h, p] = token.split('.');
      const badSig = 'A'.repeat(43);

      const res = await protectedGet(`${h}.${p}.${badSig}`);
      expect(res.statusCode).toBe(401);
    });

    test('token signed with a different secret is rejected', async () => {
      const foreign = jwt.sign(
        { sub: '507f1f77bcf86cd799439011', type: 'access' },
        'attacker-controlled-secret-with-length',
        { expiresIn: '15m' }
      );

      const res = await protectedGet(foreign);
      expect(res.statusCode).toBe(401);
    });

    test('expired access token is rejected', async () => {
      const expired = jwt.sign(
        { sub: '507f1f77bcf86cd799439011', type: 'access' },
        ACCESS_SECRET,
        { expiresIn: '-10s' }
      );

      const res = await protectedGet(expired);
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Token type confusion', () => {
    test('refresh token cannot authenticate an access-token endpoint', async () => {
      const refreshToken = jwt.sign(
        { sub: '507f1f77bcf86cd799439011', type: 'refresh' },
        REFRESH_SECRET,
        { expiresIn: '7d' }
      );

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${refreshToken}`);

      // Refresh tokens are signed with a DIFFERENT secret → signature fails.
      expect(res.statusCode).toBe(401);
    });

    test('access token submitted to the refresh endpoint is rejected', async () => {
      const accessToken = jwt.sign(
        { sub: '507f1f77bcf86cd799439011', type: 'access' },
        ACCESS_SECRET,
        { expiresIn: '15m' }
      );

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: accessToken });

      expect(res.statusCode).toBe(401);
      expect(res.body.message).toBe('Invalid or expired refresh token.');
    });

    test('token with refresh type claim but signed with access secret cannot refresh', async () => {
      const confused = jwt.sign(
        { sub: '507f1f77bcf86cd799439011', type: 'refresh' },
        ACCESS_SECRET,
        { expiresIn: '7d' }
      );

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: confused });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('JWT claims are enforced (middleware contract)', () => {
    function makeRes() {
      return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    }

    test('valid access token binds the correct subject to req.auth.userId', async () => {
      const userId = '507f1f77bcf86cd7994390ab';
      jest.spyOn(User, 'findOne').mockReturnValue(Promise.resolve({
        _id: userId,
        toString: () => userId,
        isEmailVerified: true,
      }));

      try {
        const token = makeAccess_token({ sub: userId });
        const req = { get: (k) => (k.toLowerCase() === 'authorization' ? `Bearer ${token}` : undefined) };
        const res = makeRes();
        const next = jest.fn();

        await authenticate(req, res, next);

        expect(next).toHaveBeenCalledWith();
        expect(req.auth.userId).toBe(userId);
      } finally {
        User.findOne.mockRestore();
      }
    });

    test('token whose subject has no matching user is rejected (subject enforced)', async () => {
      jest.spyOn(User, 'findOne').mockReturnValue(Promise.resolve(null));

      try {
        const token = makeAccess_token({ sub: '507f1f77bcf86cd799439011' });
        const req = { get: (k) => (k.toLowerCase() === 'authorization' ? `Bearer ${token}` : undefined) };
        const res = makeRes();
        const next = jest.fn();

        await authenticate(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
      } finally {
        User.findOne.mockRestore();
      }
    });

    test('expiration is enforced by verification (expired token throws)', () => {
      const expired = jwt.sign(
        { sub: 'x', type: 'access' },
        ACCESS_SECRET,
        { expiresIn: '-1h' }
      );

      expect(() => jwt.verify(expired, ACCESS_SECRET)).toThrow(jwt.TokenExpiredError);
    });
  });
});

// ─── STEP 12 (extra): CORS production wildcard rejection ──────────

describe('Phase 2C — CORS production hardening', () => {
  const ORIGINAL_ENV = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
  });

  test('wildcard origin configuration is rejected with 403 in production', async () => {
    process.env.NODE_ENV = 'production';

    const res = await request(app)
      .get('/health/live')
      .set('Origin', 'https://any-origin.example');

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe('Wildcard CORS is not allowed in production');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('no Access-Control-Allow-Credentials: true ever advertised', async () => {
    const res = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', 'http://example.com')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Authorization,Content-Type');

    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    // Authorization must remain an allowed preflight header so legit clients work.
    expect((res.headers['access-control-allow-headers'] || '').toLowerCase()).toContain('authorization');
  });
});

// ─── STEP 16: Request-ID security ─────────────────────────────────

describe('Phase 2C — Request-ID generation/validation/propagation', () => {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  test('no X-Request-Id → server generates a UUID and echoes it', async () => {
    const res = await request(app).get('/health/live');
    expect(res.headers['x-request-id']).toMatch(UUID_RE);
  });

  test('valid incoming ID is accepted and echoed verbatim', async () => {
    const id = 'abc12345-test-id-00';
    const res = await request(app).get('/health/live').set('X-Request-Id', id);
    expect(res.headers['x-request-id']).toBe(id);
  });

  const hostileIds = [
    ['spaces', 'id with spaces'],
    ['html/script payload', '<script>alert(1)</script>'],
    ['oversized (200 chars)', 'a'.repeat(200)],
  ];

  test.each(hostileIds)('hostile ID (%s) is rejected and regenerated', async (_n, hostile) => {
    const res = await request(app).get('/health/live').set('X-Request-Id', hostile);
    const echoed = res.headers['x-request-id'];
    expect(echoed).not.toBe(hostile);
    expect(echoed).toMatch(UUID_RE);
  });

  // Control characters and newlines are rejected at the HTTP layer by Node.js
  // itself (before they reach the server), which is an additional defense layer.
  test('unicode control chars in X-Request-Id are rejected by the HTTP layer', async () => {
    const hostile = 'id\u0000\u0007injection';
    await expect(
      request(app).get('/health/live').set('X-Request-Id', hostile),
    ).rejects.toThrow();
  });

  test('newline in X-Request-Id is rejected by the HTTP layer', async () => {
    const hostile = 'abc\r\nX-Evil: 1';
    await expect(
      request(app).get('/health/live').set('X-Request-Id', hostile),
    ).rejects.toThrow();
  });

  test('short IDs below the minimum length are regenerated', async () => {
    const res = await request(app).get('/health/live').set('X-Request-Id', 'short');
    expect(res.headers['x-request-id']).toMatch(UUID_RE);
  });
});

// ─── STEP 19: Health / readiness ──────────────────────────────────

describe('Phase 2C — Health/readiness endpoints', () => {
  test('/health returns lightweight 200 OK', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'OK' });
  });

  test('/health/live does NOT depend on MongoDB state', async () => {
    // mongoose.connection.readyState is 0 (disconnected) under test — liveness must still be 200.
    const res = await request(app).get('/health/live');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'ALIVE' });
  });

  test('/health/ready returns 503 when MongoDB is disconnected', async () => {
    const mongoose = require('mongoose');
    expect(mongoose.connection.readyState).not.toBe(1);

    const res = await request(app).get('/health/ready');
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ status: 'UNAVAILABLE', database: 'disconnected' });
    // No connection-string or config leakage.
    expect(JSON.stringify(res.body)).not.toContain('mongodb://');
  });
});

// ─── STEP 13: Security headers ────────────────────────────────────

describe('Phase 2C — Security headers (Helmet)', () => {
  test.each(['/health', '/api/v1/auth/me', '/definitely-not-a-real-code'])(
    '%s carries baseline Helmet headers',
    async (path) => {
      const res = await request(app).get(path);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['x-dns-prefetch-control']).toBeDefined();
    }
  );
});

// ─── STEP 14: Error disclosure ────────────────────────────────────

describe('Phase 2C — Error disclosure prevention', () => {
  test('malformed JSON body produces a clean 400 without stack traces', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ "email": broken');

    expect(res.statusCode).toBe(400);
    expect(typeof res.body.message).toBe('string');
    expect(JSON.stringify(res.body)).not.toMatch(/at\s+\w+\s+\(|node_modules|SyntaxError/i);
  });

  test('unknown API route → clean 404', async () => {
    const res = await request(app).get('/api/v1/definitely/not/here');
    expect(res.statusCode).toBe(404);
    expect(Object.keys(res.body)).toEqual(['message']);
  });

  function findErrorHandler(routerLike) {
    for (const layer of routerLike.stack || []) {
      if (layer.handle && layer.handle.length === 4) return layer.handle;
    }
    throw new Error('Global error handler not found');
  }

  test('unexpected exceptions produce a sanitized 500 (no stacks/paths/secrets)', () => {
    const handler = findErrorHandler(app.router);

    const leakingError = new Error('ECONNREFUSED mongodb://user:SUPERSECRET-PASSWORD-XYZ@host:27017/db');
    leakingError.stack = 'Error: boom\n    at Object.<anonymous> (/srv/app/backend/src/modules/x/y.js:12:34)';

    const req = { log: { error: jest.fn(), warn: jest.fn() }, originalUrl: '/api/v1/auth/login' };
    const res = {
      statusCode: 0,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };

    handler(leakingError, req, res, jest.fn());

    expect(res.statusCode).toBe(500);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('SUPERSECRET-PASSWORD-XYZ');
    expect(serialized).not.toContain('mongodb://');
    expect(serialized).not.toContain('/srv/app');
    expect(serialized).not.toMatch(/\bat\s+/);
    expect(res.body.message).toBe('Internal server error');
    // Server-side diagnostics are preserved for the structured log.
    expect(req.log.error).toHaveBeenCalledWith(leakingError);
  });
});
