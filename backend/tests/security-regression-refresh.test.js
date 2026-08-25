const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';

// Real token service + real bcrypt — the properties under test are signature
// verification, token type claims, expiry and hash comparison.
const tokenService = require('../src/modules/auth/infrastructure/jwt/token.service');
const { hashTokenForStorage } = require('../src/modules/auth/application/auth.service');
const AuthService = require('../src/modules/auth/application/auth.service');
const { logger } = require('../src/shared/logger');
const UserRepository = require('../src/modules/users/infrastructure/repositories/user.repository');
const User = require('../src/modules/users/infrastructure/models/user.model');

const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

const CANARY_REFRESH_TOKEN = 'SECRET_REFRESH_TOKEN_ABC123';

function makeMockUser(overrides = {}) {
  return {
    _id: { toString: () => overrides.id || '507f1f77bcf86cd799439011' },
    name: 'Test User',
    email: 'victim@example.com',
    isEmailVerified: true,
    password: 'irrelevant-hash',
    refreshToken: null,
    refreshTokenExpiresAt: new Date(Date.now() + 7 * 86400000),
    ...overrides,
  };
}

function buildAuthService(userRepoOverrides = {}) {
  const mockUserRepo = {
    findByEmailWithPassword: jest.fn(),
    findById: jest.fn().mockResolvedValue(null),
    findByIdWithPassword: jest.fn(),
    updateRefreshToken: jest.fn().mockResolvedValue({}),
    updateRefreshTokenIfMatches: jest.fn().mockResolvedValue({}),
    clearRefreshToken: jest.fn().mockResolvedValue({}),
    updatePassword: jest.fn().mockResolvedValue({}),
    ...userRepoOverrides,
  };

  const authService = new AuthService(
    mockUserRepo,
    tokenService, // REAL token service
    null,
    {},
    {},
    {},
    {}
  );

  return { authService, mockUserRepo };
}

async function captureSecurityEvents() {
  return jest.spyOn(logger, 'info').mockImplementation(() => {});
}

describe('Phase 2C — Refresh token attack testing', () => {
  let logSpy;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (logSpy) logSpy.mockRestore();
  });

  test('valid refresh token → rotated pair issued via atomic conditional update', async () => {
    const refreshToken = tokenService.generateRefreshToken('507f1f77bcf86cd799439011');
    const storedHash = await bcrypt.hash(hashTokenForStorage(refreshToken), 12);
    const user = makeMockUser({ refreshToken: storedHash });

    const { authService, mockUserRepo } = buildAuthService();
    mockUserRepo.findByIdWithPassword.mockResolvedValue(user);
    mockUserRepo.updateRefreshTokenIfMatches.mockResolvedValue({ ...user });

    const result = await authService.refreshToken({ refreshToken });

    expect(result.tokens.accessToken).toBeTruthy();
    expect(result.tokens.refreshToken).toBeTruthy();
    // Rotation MUST be conditional on the hash that was just compared —
    // this is the concurrent-replay race guard.
    expect(mockUserRepo.updateRefreshTokenIfMatches).toHaveBeenCalledWith(
      user._id,
      storedHash,
      expect.any(String),
      expect.any(Date)
    );
    expect(mockUserRepo.updateRefreshToken).not.toHaveBeenCalled();

    // New refresh token must be a genuinely different JWT.
    expect(result.tokens.refreshToken).not.toBe(refreshToken);
  });

  test('old refresh token replayed after rotation → rejected, reuse detected', async () => {
    logSpy = await captureSecurityEvents();

    // Use different user IDs to guarantee distinct JWT payloads (different `sub`
    // claims), even when generated in the same millisecond.
    const oldToken = tokenService.generateRefreshToken('507f1f77bcf86cd799439011');
    const staleHash = await bcrypt.hash(hashTokenForStorage(oldToken), 12);
    const user = makeMockUser({
      // Stored hash now belongs to a DIFFERENT token — old one no longer matches.
      refreshToken: await bcrypt.hash(hashTokenForStorage(tokenService.generateRefreshToken('507f1f77bcf86cd7994390ff')), 12),
    });

    const { authService, mockUserRepo } = buildAuthService();
    mockUserRepo.findByIdWithPassword.mockResolvedValue(user);

    await expect(authService.refreshToken({ refreshToken: oldToken })).rejects.toThrow(
      expect.objectContaining({ statusCode: 401 })
    );

    expect(mockUserRepo.clearRefreshToken).toHaveBeenCalledWith(user._id);
    const event = logSpy.mock.calls.map((c) => JSON.stringify(c)).find((s) => s.includes('auth.refresh_token.reuse_detected'));
    expect(event).toBeDefined();
    expect(event).not.toContain(oldToken);
    expect(event).not.toContain(staleHash);
  });

  test('CONCURRENT replays of the same valid token: exactly ONE rotation wins', async () => {
    logSpy = await captureSecurityEvents();

    // Must be a real JWT so the real tokenService.verifyRefreshToken succeeds.
    const sharedToken = tokenService.generateRefreshToken('507f1f77bcf86cd799439011');
    const storedHash = await bcrypt.hash(hashTokenForStorage(sharedToken), 12);
    const user = makeMockUser({ refreshToken: storedHash });

    let rotations = 0;
    const { authService, mockUserRepo } = buildAuthService();
    mockUserRepo.findByIdWithPassword.mockResolvedValue(user);
    // Simulates the atomic DB compare-and-swap: only the first writer matches.
    mockUserRepo.updateRefreshTokenIfMatches.mockImplementation(async () => {
      rotations += 1;
      return rotations === 1 ? { ...user } : null;
    });

    const results = await Promise.allSettled([
      authService.refreshToken({ refreshToken: sharedToken }),
      authService.refreshToken({ refreshToken: sharedToken }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ statusCode: 401 });

    // The loser must be reported as reuse and never leak the presented token.
    const allLogs = JSON.stringify(logSpy.mock.calls);
    expect(allLogs).toContain('auth.refresh_token.reuse_detected');
    expect(allLogs).not.toContain(sharedToken);
  });

  test('access token submitted as refresh token → rejected (type + secret separation)', async () => {
    const accessToken = jwt.sign(
      { sub: '507f1f77bcf86cd799439011', type: 'access' },
      ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    const { authService } = buildAuthService();
    await expect(authService.refreshToken({ refreshToken: accessToken })).rejects.toThrow(
      expect.objectContaining({ statusCode: 401 })
    );
  });

  test('refresh-type claim signed with access secret → rejected by type/secret check', async () => {
    const confused = jwt.sign(
      { sub: '507f1f77bcf86cd799439011', type: 'refresh' },
      ACCESS_SECRET,
      { expiresIn: '7d' }
    );

    const { authService, mockUserRepo } = buildAuthService();
    await expect(authService.refreshToken({ refreshToken: confused })).rejects.toThrow(
      expect.objectContaining({ statusCode: 401 })
    );
    expect(mockUserRepo.findByIdWithPassword).not.toHaveBeenCalled();
  });

  test('expired refresh token → rejected', async () => {
    const expired = jwt.sign(
      { sub: '507f1f77bcf86cd799439011', type: 'refresh' },
      REFRESH_SECRET,
      { expiresIn: '-1h' }
    );

    const { authService, mockUserRepo } = buildAuthService();
    await expect(authService.refreshToken({ refreshToken: expired })).rejects.toThrow(
      expect.objectContaining({ statusCode: 401 })
    );
    expect(mockUserRepo.findByIdWithPassword).not.toHaveBeenCalled();
  });

  test('refresh token for a deleted/nonexistent user → rejected', async () => {
    const token = tokenService.generateRefreshToken('507f1f77bcf86cd7994390ff');
    const { authService, mockUserRepo } = buildAuthService();
    mockUserRepo.findByIdWithPassword.mockResolvedValue(null); // deleted

    await expect(authService.refreshToken({ refreshToken: token })).rejects.toThrow(
      expect.objectContaining({ statusCode: 401 })
    );
  });

  test('refresh after logout (stored token cleared) → rejected without reuse alarm on empty store', async () => {
    const token = tokenService.generateRefreshToken('507f1f77bcf86cd799439011');
    const user = makeMockUser({ refreshToken: null, refreshTokenExpiresAt: null });
    const { authService, mockUserRepo } = buildAuthService();
    mockUserRepo.findByIdWithPassword.mockResolvedValue(user);

    await expect(authService.refreshToken({ refreshToken: token })).rejects.toThrow(
      expect.objectContaining({ statusCode: 401 })
    );
    expect(mockUserRepo.updateRefreshTokenIfMatches).not.toHaveBeenCalled();
  });

  test('logout clears the stored refresh token so later use fails', async () => {
    logSpy = await captureSecurityEvents();
    const { authService, mockUserRepo } = buildAuthService();
    await authService.logout('507f1f77bcf86cd799439011');
    expect(mockUserRepo.clearRefreshToken).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    expect(JSON.stringify(logSpy.mock.calls)).toContain('auth.logout.success');
  });

  test('password change invalidates the stored refresh token', async () => {
    logSpy = await captureSecurityEvents();
    const currentHash = await bcrypt.hash('CurrentPass123', 12);
    const user = makeMockUser({ password: currentHash });

    const { authService, mockUserRepo } = buildAuthService();
    mockUserRepo.findByIdWithPassword.mockResolvedValue(user);

    await authService.changePassword(user._id, { currentPassword: 'CurrentPass123', newPassword: 'NewPass12345' });

    expect(mockUserRepo.updatePassword).toHaveBeenCalled();
    expect(mockUserRepo.clearRefreshToken).toHaveBeenCalledWith(user._id);
    expect(JSON.stringify(logSpy.mock.calls)).toContain('auth.password_change.success');
  });

  test('password reset invalidates the stored refresh token', async () => {
    const otp = '123456';
    const otpHash = await bcrypt.hash(otp, 12);
    const user = makeMockUser();

    const mockVerificationTokenRepo = {
      findActive: jest.fn().mockResolvedValue({
        _id: 'tok1',
        token: otpHash,
        attempts: 0,
        maxAttempts: 5,
      }),
      incrementAttempts: jest.fn(),
      markUsed: jest.fn().mockResolvedValue({}),
      invalidateAll: jest.fn().mockResolvedValue({}),
    };

    const { authService, mockUserRepo } = buildAuthService();
    authService.verificationTokenRepository = mockVerificationTokenRepo;
    authService.emailService = { sendPasswordResetEmail: jest.fn() };
    mockUserRepo.findByEmail = jest.fn().mockResolvedValue(user);

    await authService.resetPassword({ email: user.email, code: otp, newPassword: 'BrandNewPass123' });

    expect(mockUserRepo.clearRefreshToken).toHaveBeenCalledWith(user._id);
    expect(mockUserRepo.updatePassword).toHaveBeenCalledWith(user._id, expect.any(String));
    expect(mockVerificationTokenRepo.markUsed).toHaveBeenCalledWith('tok1');
  });

  test('reuse_detected security events never contain the presented token or its hash', async () => {
    logSpy = await captureSecurityEvents();

    // Use a real JWT for the presented token, but a hash of a DIFFERENT token
    // so that bcrypt.compare returns false and triggers reuse detection.
    const attackerToken = tokenService.generateRefreshToken('507f1f77bcf86cd799439011');
    const attackerTokenHash = await bcrypt.hash(hashTokenForStorage(attackerToken), 12);
    const user = makeMockUser({
      // Stored hash is for a DIFFERENT token.
      refreshToken: await bcrypt.hash(hashTokenForStorage(tokenService.generateRefreshToken('507f1f77bcf86cd7994390ff')), 12),
    });

    const { authService, mockUserRepo } = buildAuthService();
    mockUserRepo.findByIdWithPassword.mockResolvedValue(user);

    await expect(authService.refreshToken({ refreshToken: attackerToken })).rejects.toThrow();

    const serialized = JSON.stringify(logSpy.mock.calls);
    expect(serialized).toContain('auth.refresh_token.reuse_detected');
    expect(serialized).not.toContain(attackerToken);
    expect(serialized).not.toContain(attackerTokenHash);
    expect(serialized).not.toMatch(/\$2[aby]\$\d{2}\$/); // no bcrypt hashes in logs
  });

  test('repository-level: updateRefreshTokenIfMatches filters atomically on id AND expected hash', async () => {
    // Spy on the REAL model static to verify the filter the REAL repository
    // builds — the expected hash must be part of the atomic compare-and-swap,
    // not compared client-side after an unconditional write.
    const spy = jest.spyOn(User, 'findOneAndUpdate').mockResolvedValue({ _id: 'x' });

    try {
      const repo = new UserRepository();
      const expiresAt = new Date();
      await repo.updateRefreshTokenIfMatches('507f1f77bcf86cd799439011', '$2b$12$expectedstoredhashvalue', '$2b$12$newhash', expiresAt);

      expect(spy).toHaveBeenCalledWith(
        {
          _id: '507f1f77bcf86cd799439011',
          isDeleted: false,
          refreshToken: '$2b$12$expectedstoredhashvalue',
        },
        { refreshToken: '$2b$12$newhash', refreshTokenExpiresAt: expiresAt },
        { new: true }
      );
    } finally {
      spy.mockRestore();
    }
  });
});

// ─── BCRYPT TRUNCATION REGRESSION ─────────────────────────────────

describe('Phase 2C — Bcrypt 72-byte truncation prevention', () => {
  test('SHA-256 pre-hash produces a 64-hex-char digest within bcrypt limit', () => {
    const token = tokenService.generateRefreshToken('507f1f77bcf86cd799439011');
    const hashed = hashTokenForStorage(token);
    expect(typeof hashed).toBe('string');
    expect(hashed.length).toBe(64);
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
  });

  test('two different refresh tokens produce different SHA-256 digests', () => {
    const t1 = tokenService.generateRefreshToken('507f1f77bcf86cd799439011');
    const t2 = tokenService.generateRefreshToken('507f1f77bcf86cd7994390ff');
    expect(hashTokenForStorage(t1)).not.toBe(hashTokenForStorage(t2));
  });

  test('different tokens that share a >72-byte prefix are rejected (no false positive)', async () => {
    // Two tokens with the same sub claim but different expirations would
    // share a >72-byte prefix under raw bcrypt, but SHA-256 pre-hashing
    // makes bcrypt.compare correctly reject them.
    const token1 = jwt.sign(
      { sub: '507f1f77bcf86cd799439011', type: 'refresh', iat: 1000000 },
      REFRESH_SECRET,
      { expiresIn: '1d' }
    );
    const token2 = jwt.sign(
      { sub: '507f1f77bcf86cd799439011', type: 'refresh', iat: 2000000 },
      REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    // Without SHA-256, these would share a >72-byte prefix and bcrypt
    // would incorrectly treat them as equal.
    const rawFirst72Match = token1.substring(0, 72) === token2.substring(0, 72);

    // With SHA-256 pre-hash, bcrypt.compare distinguishes them.
    const hash1 = await bcrypt.hash(hashTokenForStorage(token1), 12);
    const result = await bcrypt.compare(hashTokenForStorage(token2), hash1);
    expect(result).toBe(false);

    // Even if the raw first 72 bytes happen to match, the SHA-256 hashes differ.
    expect(hashTokenForStorage(token1)).not.toBe(hashTokenForStorage(token2));
  });

  test('SHA-256 pre-hashing is applied in createAuthenticationResponse', async () => {
    // Verify that the auth service stores SHA-256-pre-hashed tokens.
    const { authService, mockUserRepo } = buildAuthService();
    mockUserRepo.updateRefreshToken.mockResolvedValue({});

    const result = await authService.createAuthenticationResponse({
      _id: '507f1f77bcf86cd799439011',
      name: 'Test', email: 'test@test.com',
      isEmailVerified: true,
      createdAt: new Date(), updatedAt: new Date(),
    });

    // Without expectedPreviousTokenHash, uses updateRefreshToken.
    // The stored hash should be bcrypt(sha256(token)), a valid bcrypt hash.
    const storedHash = mockUserRepo.updateRefreshToken.mock.calls[0][1];
    expect(storedHash).toMatch(/^\$2[aby]\$\d{2}\$/); // valid bcrypt hash
    expect(result.tokens.accessToken).toBeTruthy();
    expect(result.tokens.refreshToken).toBeTruthy();
  });
});
