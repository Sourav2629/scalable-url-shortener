const request = require('supertest');
const bcrypt = require('bcrypt');

process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';

const app = require('../src/app');
const { logger, isValidRequestId } = require('../src/shared/logger');
const AuthService = require('../src/modules/auth/application/auth.service');

// Low bcrypt cost for TEST SETUP ONLY — production code keeps cost 12.
// bcrypt.compare derives the cost from the stored hash automatically.
const TEST_SALT_ROUNDS = 4;

// Fake values designed to make accidental log leakage obvious
const SECRET_PASSWORD = 'SUPERSECRET-PASSWORD-XYZ';
const SECRET_OTP = '999999';
const SECRET_REFRESH_TOKEN = 'SECRET_REFRESH_TOKEN_ABC123';
const SECRET_RESET_CODE = '777777';

// ─── Mock repositories ──────────────────────────────────────────
const mockUserRepo = {
  findByEmail: jest.fn(),
  findByEmailWithPassword: jest.fn(),
  findByIdWithPassword: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  markEmailVerified: jest.fn(),
  updatePassword: jest.fn(),
  updateRefreshToken: jest.fn(),
  clearRefreshToken: jest.fn(),
  deleteById: jest.fn(),
};

const mockTokenService = {
  generateAccessToken: jest.fn().mockReturnValue('mock-access-token'),
  generateRefreshToken: jest.fn().mockReturnValue('mock-refresh-token'),
  verifyRefreshToken: jest.fn(),
  getRefreshTokenExpiryDate: jest.fn().mockReturnValue(new Date(Date.now() + 86400000)),
};

const mockEmailService = {
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
};

const mockVerificationTokenRepo = {
  invalidateAll: jest.fn().mockResolvedValue({}),
  create: jest.fn().mockResolvedValue({}),
  findActive: jest.fn(),
  incrementAttempts: jest.fn(),
  markUsed: jest.fn().mockResolvedValue({}),
  deleteByUser: jest.fn().mockResolvedValue({}),
};

const mockPendingRegistrationRepo = {
  findByEmail: jest.fn(),
  upsert: jest.fn().mockResolvedValue({}),
  deleteByEmail: jest.fn().mockResolvedValue({}),
};

const mockUrlRepo = {
  findIdsByOwner: jest.fn().mockResolvedValue([]),
  hardDeleteByOwner: jest.fn().mockResolvedValue({}),
};

const mockAnalyticsRepo = {
  deleteByUser: jest.fn().mockResolvedValue({}),
  deleteByUrls: jest.fn().mockResolvedValue({}),
};

const authService = new AuthService(
  mockUserRepo,
  mockTokenService,
  mockEmailService,
  mockVerificationTokenRepo,
  mockPendingRegistrationRepo,
  mockUrlRepo,
  mockAnalyticsRepo,
);

// ─── Log capture helpers ────────────────────────────────────────
let captured;

function startCapture() {
  captured = [];
  for (const level of ['info', 'warn', 'error', 'debug']) {
    jest.spyOn(logger, level).mockImplementation((...args) => {
      captured.push({ level, args });
    });
  }
}

function serializeCapturedLogs() {
  return JSON.stringify(captured, (_key, value) => {
    if (value instanceof Error) return { message: value.message };
    if (typeof value === 'bigint') return value.toString();
    return value;
  });
}

function eventsEmitted(name) {
  return captured.filter(({ args }) =>
    args.some((a) => a && typeof a === 'object' && !Array.isArray(a) && a.event === name),
  );
}

function expectEvent(name) {
  const found = eventsEmitted(name);
  if (found.length === 0) {
    throw new Error(`Expected security event "${name}" but it was not emitted. Captured: ${serializeCapturedLogs()}`);
  }
  return found[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  startCapture();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Request ID validation unit tests ───────────────────────────

describe('Request ID validation', () => {
  test('accepts a well-formed request ID', () => {
    expect(isValidRequestId('abc123XYZ-def_456')).toBe(true);
  });

  test('accepts a UUID-style request ID', () => {
    expect(isValidRequestId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  test('rejects values with spaces', () => {
    expect(isValidRequestId('bad id with spaces')).toBe(false);
  });

  test('rejects HTML/script injection', () => {
    expect(isValidRequestId('<script>alert(1)</script>')).toBe(false);
  });

  test('rejects oversized values (> 64 chars)', () => {
    expect(isValidRequestId('a'.repeat(65))).toBe(false);
    expect(isValidRequestId('a'.repeat(64))).toBe(true);
  });

  test('rejects non-string and empty values', () => {
    expect(isValidRequestId(null)).toBe(false);
    expect(isValidRequestId(undefined)).toBe(false);
    expect(isValidRequestId('')).toBe(false);
    expect(isValidRequestId({})).toBe(false);
  });
});

// ─── Request ID HTTP behavior ───────────────────────────────────

describe('Request ID HTTP behavior', () => {
  const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{7,63}$/;

  test('generates an X-Request-Id when none is provided', async () => {
    const res = await request(app).get('/health/live');

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).toMatch(REQUEST_ID_PATTERN);
  });

  test('generates unique IDs across requests', async () => {
    const res1 = await request(app).get('/health/live');
    const res2 = await request(app).get('/health/live');

    expect(res1.headers['x-request-id']).not.toBe(res2.headers['x-request-id']);
  });

  test('preserves a valid incoming X-Request-Id', async () => {
    const res = await request(app)
      .get('/health/live')
      .set('X-Request-Id', 'valid-trace-id-12345');

    expect(res.headers['x-request-id']).toBe('valid-trace-id-12345');
  });

  test('replaces a malformed X-Request-Id (spaces/HTML)', async () => {
    const malicious = '<script>alert(1)</script>';
    const res = await request(app)
      .get('/health/live')
      .set('X-Request-Id', malicious);

    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).not.toBe(malicious);
    expect(res.headers['x-request-id']).toMatch(REQUEST_ID_PATTERN);
  });

  test('replaces an oversized X-Request-Id', async () => {
    const oversized = 'x'.repeat(200);
    const res = await request(app)
      .get('/health/live')
      .set('X-Request-Id', oversized);

    expect(res.headers['x-request-id']).not.toBe(oversized);
    expect(res.headers['x-request-id'].length).toBeLessThanOrEqual(64);
  });
});

// ─── Auth security events ───────────────────────────────────────

describe('Auth security events', () => {
  describe('auth.login.failed / auth.login.success', () => {
    test('failed login emits auth.login.failed with reason', async () => {
      mockUserRepo.findByEmailWithPassword.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'nobody@example.com', password: SECRET_PASSWORD }),
      ).rejects.toThrow();

      const event = expectEvent('auth.login.failed');
      expect(event.args[0]).toEqual(
        expect.objectContaining({
          event: 'auth.login.failed',
          email: 'nobody@example.com',
          reason: 'invalid_credentials',
        }),
      );
    });

    test('unverified-user login emits auth.login.failed with reason', async () => {
      mockUserRepo.findByEmailWithPassword.mockResolvedValue({
        _id: 'user1',
        email: 'unverified@example.com',
        password: await bcrypt.hash('correct-pass', TEST_SALT_ROUNDS),
        isEmailVerified: false,
        name: 'U',
        isDeleted: false,
      });

      await expect(
        authService.login({ email: 'unverified@example.com', password: 'correct-pass' }),
      ).rejects.toThrow();

      expectEvent('auth.login.failed');
    });

    test('successful login emits auth.login.success with userId/email', async () => {
      mockUserRepo.findByEmailWithPassword.mockResolvedValue({
        _id: 'user1',
        email: 'verified@example.com',
        password: await bcrypt.hash('correct-pass', TEST_SALT_ROUNDS),
        isEmailVerified: true,
        name: 'V',
        isDeleted: false,
      });
      mockUserRepo.updateRefreshToken.mockResolvedValue({});

      await authService.login({ email: 'verified@example.com', password: 'correct-pass' });

      const event = expectEvent('auth.login.success');
      expect(event.args[0]).toEqual(
        expect.objectContaining({
          event: 'auth.login.success',
          userId: 'user1',
          email: 'verified@example.com',
        }),
      );
    });
  });

  describe('auth.register.success', () => {
    test('registration emits auth.register.success', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(null);
      mockPendingRegistrationRepo.upsert.mockResolvedValue({});
      // Pending registration path sends OTP via email service
      mockPendingRegistrationRepo.findByEmail.mockResolvedValue({
        _id: 'pending1',
        email: 'newuser@example.com',
        name: 'New User',
        expiresAt: new Date(Date.now() + 3600000),
      });
      mockVerificationTokenRepo.create.mockResolvedValue({});

      await authService.register({
        name: 'New User',
        email: 'newuser@example.com',
        password: 'password123',
      });

      expectEvent('auth.register.success');
    });
  });

  describe('verification events', () => {
    function setupPending() {
      mockPendingRegistrationRepo.findByEmail.mockResolvedValue({
        _id: 'pending1',
        email: 'pending@example.com',
        name: 'Pending User',
        expiresAt: new Date(Date.now() + 3600000),
      });
    }

    function makeOtpHash(code) {
      return bcrypt.hash(code, TEST_SALT_ROUNDS);
    }

    test('wrong OTP emits auth.verification.failed', async () => {
      setupPending();
      mockVerificationTokenRepo.findActive.mockResolvedValue({
        _id: 'tok1',
        token: await makeOtpHash(SECRET_OTP),
        attempts: 0,
        maxAttempts: 5,
      });
      mockVerificationTokenRepo.incrementAttempts.mockResolvedValue({
        maxAttempts: 5,
        attempts: 1,
      });

      await expect(
        authService.verifyEmail({ email: 'pending@example.com', code: '111111' }),
      ).rejects.toThrow();

      const event = expectEvent('auth.verification.failed');
      expect(event.args[0]).toMatchObject({ event: 'auth.verification.failed', remainingAttempts: 4 });
    });

    test('max-attempt lockout emits auth.verification.locked', async () => {
      setupPending();
      mockVerificationTokenRepo.findActive.mockResolvedValue({
        _id: 'tok1',
        token: await makeOtpHash(SECRET_OTP),
        attempts: 5,
        maxAttempts: 5,
      });

      await expect(
        authService.verifyEmail({ email: 'pending@example.com', code: '111111' }),
      ).rejects.toThrow();

      expectEvent('auth.verification.locked');
    });

    test('successful verification emits auth.verification.success', async () => {
      setupPending();
      mockVerificationTokenRepo.findActive.mockResolvedValue({
        _id: 'tok1',
        token: await makeOtpHash(SECRET_OTP),
        attempts: 0,
        maxAttempts: 5,
      });
      mockUserRepo.create.mockResolvedValue({
        _id: 'user2',
        email: 'pending@example.com',
        name: 'Pending User',
        isEmailVerified: true,
        passwordChangedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
      });
      mockUserRepo.updateRefreshToken.mockResolvedValue({});

      await authService.verifyEmail({ email: 'pending@example.com', code: SECRET_OTP });

      expectEvent('auth.verification.success');
    });

    test('resending verification OTP emits auth.verification.otp_resent', async () => {
      setupPending();
      mockVerificationTokenRepo.create.mockResolvedValue({});

      await authService.resendVerification({ email: 'pending@example.com' });

      expectEvent('auth.verification.otp_resent');
    });
  });

  describe('password reset events', () => {
    test('forgot password emits auth.password_reset.requested', async () => {
      mockUserRepo.findByEmail.mockResolvedValue({
        _id: 'user1',
        email: 'reset@example.com',
        name: 'R',
        isEmailVerified: true,
      });

      await authService.forgotPassword({ email: 'reset@example.com' });

      expectEvent('auth.password_reset.requested');
    });

    test('successful reset emits auth.password_reset.success', async () => {
      mockUserRepo.findByEmail.mockResolvedValue({
        _id: 'user1',
        email: 'reset@example.com',
        isEmailVerified: true,
      });
      mockVerificationTokenRepo.findActive.mockResolvedValue({
        _id: 'tok1',
        token: await bcrypt.hash(SECRET_RESET_CODE, TEST_SALT_ROUNDS),
        attempts: 0,
        maxAttempts: 5,
      });

      await authService.resetPassword({
        email: 'reset@example.com',
        code: SECRET_RESET_CODE,
        newPassword: 'newpassword123',
      });

      expectEvent('auth.password_reset.success');
    });
  });

  describe('other auth lifecycle events', () => {
    test('logout emits auth.logout.success', async () => {
      mockUserRepo.clearRefreshToken.mockResolvedValue({});

      await authService.logout('user1');

      expectEvent('auth.logout.success');
    });

    test('password change emits auth.password_change.success', async () => {
      mockUserRepo.findByIdWithPassword.mockResolvedValue({
        _id: 'user1',
        email: 'cp@example.com',
        password: await bcrypt.hash('old-password', TEST_SALT_ROUNDS),
      });

      await authService.changePassword('user1', {
        currentPassword: 'old-password',
        newPassword: 'brand-new-pass-123',
      });

      expectEvent('auth.password_change.success');
    });

    test('account deletion emits auth.account.deleted', async () => {
      mockUserRepo.findByIdWithPassword.mockResolvedValue({
        _id: 'user1',
        email: 'delete-me@example.com',
        password: await bcrypt.hash('my-password', TEST_SALT_ROUNDS),
      });

      await authService.deleteAccount('user1', { password: 'my-password' });

      const event = expectEvent('auth.account.deleted');
      expect(event.args[0]).toMatchObject({
        event: 'auth.account.deleted',
        userId: 'user1',
        email: 'delete-me@example.com',
      });
    });

    test('refresh-token reuse detection emits auth.refresh_token.reuse_detected', async () => {
      mockTokenService.verifyRefreshToken.mockReturnValue({ sub: 'user1', type: 'refresh' });
      mockUserRepo.findByIdWithPassword.mockResolvedValue({
        _id: 'user1',
        email: 'victim@example.com',
        isEmailVerified: true,
        refreshToken: await bcrypt.hash('a-completely-different-token', TEST_SALT_ROUNDS),
        refreshTokenExpiresAt: new Date(Date.now() + 86400000),
      });

      await expect(
        authService.refreshToken({ refreshToken: SECRET_REFRESH_TOKEN }),
      ).rejects.toThrow();

      const event = expectEvent('auth.refresh_token.reuse_detected');
      expect(event.args[0]).toMatchObject({
        event: 'auth.refresh_token.reuse_detected',
        userId: 'user1',
      });
      // Token invalidation still happens (existing security behavior preserved)
      expect(mockUserRepo.clearRefreshToken).toHaveBeenCalledWith('user1');
    });
  });

  describe('security.rate_limit.exceeded', () => {
    test('rate-limit rejection emits security.rate_limit.exceeded', async () => {
      // loginLimiter default: 10 requests / 15 min. Fire 10 requests that are
      // counted (validators reject them with 400 — they still consume quota).
      for (let i = 0; i < 10; i += 1) {
        await request(app).post('/api/v1/auth/login').send({});
      }
      const res = await request(app).post('/api/v1/auth/login').send({});

      expect(res.statusCode).toBe(429);
      expect(res.body.message).toContain('Too many login attempts');

      const found = eventsEmitted('security.rate_limit.exceeded');
      expect(found.length).toBeGreaterThan(0);

      const meta = found[found.length - 1].args[0];
      expect(meta).toEqual(
        expect.objectContaining({
          method: 'POST',
          path: '/api/v1/auth/login',
        }),
      );
      // requestId may be undefined in raw supertest calls without pino-http
      // context binding on this limiter instance — ip must always be present.
      expect(meta.ip).toBeDefined();
    }, 15000);
  });
});

// ─── Secret leakage prevention ──────────────────────────────────

describe('Security logging never leaks secrets', () => {
  test('no password, OTP, or refresh token appears in any captured log', async () => {
    // Exercise flows that handle secrets end-to-end:
    // 1. Failed login with a fake password
    mockUserRepo.findByEmailWithPassword.mockResolvedValue(null);
    await authService
      .login({ email: 'leak-check@example.com', password: SECRET_PASSWORD })
      .catch(() => {});

    // 2. Verification failure with a fake OTP
    mockPendingRegistrationRepo.findByEmail.mockResolvedValue({
      _id: 'p1',
      email: 'leak-check@example.com',
      name: 'L',
      expiresAt: new Date(Date.now() + 3600000),
    });
    mockVerificationTokenRepo.findActive.mockResolvedValue({
      _id: 'tok1',
      token: await bcrypt.hash(SECRET_OTP, TEST_SALT_ROUNDS),
      attempts: 0,
      maxAttempts: 5,
    });
    mockVerificationTokenRepo.incrementAttempts.mockResolvedValue({ maxAttempts: 5, attempts: 1 });
    await authService.verifyEmail({ email: 'leak-check@example.com', code: SECRET_OTP }).catch(() => {});

    // 3. Refresh-token reuse with a fake refresh token
    mockTokenService.verifyRefreshToken.mockReturnValue({ sub: 'user1', type: 'refresh' });
    mockUserRepo.findByIdWithPassword.mockResolvedValue({
      _id: 'user1',
      email: 'leak-check@example.com',
      isEmailVerified: true,
      refreshToken: await bcrypt.hash('different-token', TEST_SALT_ROUNDS),
      refreshTokenExpiresAt: new Date(Date.now() + 86400000),
    });
    await authService.refreshToken({ refreshToken: SECRET_REFRESH_TOKEN }).catch(() => {});

    const output = serializeCapturedLogs();

    expect(output).not.toContain(SECRET_PASSWORD);
    expect(output).not.toContain(SECRET_OTP);
    expect(output).not.toContain(SECRET_REFRESH_TOKEN);
    expect(output.toLowerCase()).not.toContain('authorization');
    expect(output.toLowerCase()).not.toContain('bearer ');
    expect(output).not.toContain('password":"SUPERSECRET');
  });

  test('logSecurityEvent omits undefined/null metadata fields', () => {
    const { logSecurityEvent } = require('../src/shared/logger/security-event');

    logSecurityEvent('auth.test.event', { userId: 'u1', email: undefined, ip: null });

    const event = expectEvent('auth.test.event');
    expect(event.args[0].userId).toBe('u1');
    expect(event.args[0]).not.toHaveProperty('email');
    expect(event.args[0]).not.toHaveProperty('ip');
  });
});
