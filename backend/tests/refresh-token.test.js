const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';

const tokenService = require('../src/modules/auth/infrastructure/jwt/token.service');
const { hashTokenForStorage } = require('../src/modules/auth/application/auth.service');
const AuthService = require('../src/modules/auth/application/auth.service');
const UserRepository = require('../src/modules/users/infrastructure/repositories/user.repository');
const VerificationTokenRepository = require('../src/modules/auth/infrastructure/repositories/verification-token.repository');
const PendingRegistrationRepository = require('../src/modules/auth/infrastructure/repositories/pending-registration.repository');
const { validateRefreshToken } = require('../src/modules/auth/presentation/validators/auth.validator');
const { refreshLimiter } = require('../src/shared/middleware/rate-limiter.middleware');

// ─── Mock repositories ──────────────────────────────────────────
const mockUserRepo = {
  findByEmailWithPassword: jest.fn(),
  findById: jest.fn(),
  findByIdWithPassword: jest.fn(),
  updateRefreshToken: jest.fn(),
  clearRefreshToken: jest.fn(),
  updatePassword: jest.fn(),
};

const mockTokenService = {
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
  verifyAccessToken: jest.fn(),
  verifyRefreshToken: jest.fn(),
  getRefreshTokenExpiryDate: jest.fn(),
};

const mockVerificationTokenRepo = {};
const mockPendingRegistrationRepo = {};
const mockUrlRepo = {};
const mockAnalyticsRepo = {};

const authService = new AuthService(
  mockUserRepo,
  mockTokenService,
  null, // no email service needed for tests
  mockVerificationTokenRepository = mockVerificationTokenRepo,
  mockPendingRegistrationRepo,
  mockUrlRepo,
  mockAnalyticsRepo,
);

const PASSWORD_SALT_ROUNDS = 12;

describe('Refresh Token Lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default token service implementations
    mockTokenService.generateAccessToken.mockImplementation(
      (userId) => `access_token_${userId}_${Date.now()}`
    );
    mockTokenService.generateRefreshToken.mockImplementation(
      (userId) => `refresh_token_${userId}_${Date.now()}`
    );
    mockTokenService.verifyRefreshToken.mockImplementation(
      (token) => {
        if (token === 'invalid_token') throw new Error('invalid token');
        if (token === 'wrong_type_token') {
          return { sub: 'user1', type: 'access' };
        }
        return { sub: 'user1', type: 'refresh' };
      }
    );
    mockTokenService.getRefreshTokenExpiryDate.mockReturnValue(
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    );
  });

  // ─── Validator Tests ──────────────────────────────────────────

  describe('validateRefreshToken', () => {
    test('rejects missing refreshToken', () => {
      const req = { body: {} };
      const next = jest.fn();
      validateRefreshToken(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects empty refreshToken', () => {
      const req = { body: { refreshToken: '' } };
      const next = jest.fn();
      validateRefreshToken(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects non-string refreshToken', () => {
      const req = { body: { refreshToken: 123 } };
      const next = jest.fn();
      validateRefreshToken(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('accepts valid refreshToken', () => {
      const req = { body: { refreshToken: 'valid.token.here' } };
      const next = jest.fn();
      validateRefreshToken(req, {}, next);
      expect(req.body.refreshToken).toBe('valid.token.here');
      expect(next).toHaveBeenCalledWith();
    });

    test('trims whitespace from refreshToken', () => {
      const req = { body: { refreshToken: '  token  ' } };
      const next = jest.fn();
      validateRefreshToken(req, {}, next);
      expect(req.body.refreshToken).toBe('token');
      expect(next).toHaveBeenCalledWith();
    });
  });

  // ─── Token Service Tests ──────────────────────────────────────

  describe('Token Service', () => {
    test('generateAccessToken produces a JWT with type "access"', () => {
      const token = tokenService.generateAccessToken('user123');
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      expect(decoded.sub).toBe('user123');
      expect(decoded.type).toBe('access');
    });

    test('generateRefreshToken produces a JWT with type "refresh"', () => {
      const token = tokenService.generateRefreshToken('user123');
      const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
      expect(decoded.sub).toBe('user123');
      expect(decoded.type).toBe('refresh');
    });

    test('verifyRefreshToken rejects access token used as refresh', () => {
      const accessToken = tokenService.generateAccessToken('user123');
      expect(() => tokenService.verifyRefreshToken(accessToken)).toThrow();
    });

    test('verifyRefreshToken rejects token with wrong type claim', () => {
      const token = jwt.sign(
        { sub: 'user1', type: 'access' },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
      );
      expect(() => tokenService.verifyRefreshToken(token)).toThrow('Invalid token type');
    });

    test('verifyRefreshToken accepts valid refresh token', () => {
      const token = tokenService.generateRefreshToken('user123');
      const decoded = tokenService.verifyRefreshToken(token);
      expect(decoded.sub).toBe('user123');
      expect(decoded.type).toBe('refresh');
    });

    test('verifyRefreshToken rejects expired token', () => {
      const token = jwt.sign(
        { sub: 'user1', type: 'refresh' },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: '-1s' }
      );
      expect(() => tokenService.verifyRefreshToken(token)).toThrow();
    });

    test('getRefreshTokenExpiryDate returns a future Date', () => {
      const expiry = tokenService.getRefreshTokenExpiryDate();
      expect(expiry).toBeInstanceOf(Date);
      expect(expiry.getTime()).toBeGreaterThan(Date.now());
    });
  });

  // ─── AuthService.refreshToken Tests ───────────────────────────

  describe('AuthService.refreshToken', () => {
    test('rejects missing refresh token', async () => {
      await expect(authService.refreshToken({ refreshToken: null }))
        .rejects.toThrow(expect.objectContaining({ statusCode: 401 }));
    });

    test('rejects invalid refresh token JWT', async () => {
      mockTokenService.verifyRefreshToken.mockImplementation(() => {
        throw new Error('invalid token');
      });

      await expect(authService.refreshToken({ refreshToken: 'invalid_token' }))
        .rejects.toThrow(expect.objectContaining({ statusCode: 401 }));
    });

    test('rejects refresh token with wrong type claim', async () => {
      mockTokenService.verifyRefreshToken.mockImplementation(() => {
        throw new Error('Invalid token type');
      });

      await expect(authService.refreshToken({ refreshToken: 'wrong_type_token' }))
        .rejects.toThrow(expect.objectContaining({ statusCode: 401 }));
    });

    test('rejects when user not found', async () => {
      mockUserRepo.findByIdWithPassword.mockResolvedValue(null);

      await expect(authService.refreshToken({ refreshToken: 'valid_refresh' }))
        .rejects.toThrow(expect.objectContaining({ statusCode: 401 }));
    });

    test('rejects when user email is not verified', async () => {
      mockUserRepo.findByIdWithPassword.mockResolvedValue({
        _id: 'user1',
        isEmailVerified: false,
        refreshToken: 'hash',
        refreshTokenExpiresAt: new Date(Date.now() + 3600000),
      });

      await expect(authService.refreshToken({ refreshToken: 'valid_refresh' }))
        .rejects.toThrow(expect.objectContaining({ statusCode: 401 }));
    });

    test('rejects when stored refreshToken hash is null', async () => {
      mockUserRepo.findByIdWithPassword.mockResolvedValue({
        _id: 'user1',
        isEmailVerified: true,
        refreshToken: null,
        refreshTokenExpiresAt: null,
      });

      await expect(authService.refreshToken({ refreshToken: 'valid_refresh' }))
        .rejects.toThrow(expect.objectContaining({ statusCode: 401 }));
    });

    test('rejects when refreshTokenExpiresAt is expired', async () => {
      mockUserRepo.findByIdWithPassword.mockResolvedValue({
        _id: 'user1',
        isEmailVerified: true,
        refreshToken: 'somehash',
        refreshTokenExpiresAt: new Date(Date.now() - 3600000), // expired
      });

      await expect(authService.refreshToken({ refreshToken: 'valid_refresh' }))
        .rejects.toThrow(expect.objectContaining({ statusCode: 401 }));

      // Should have cleared the token
      expect(mockUserRepo.clearRefreshToken).toHaveBeenCalledWith('user1');
    });

    test('rejects when refresh token hash does not match', async () => {
      mockUserRepo.findByIdWithPassword.mockResolvedValue({
        _id: 'user1',
        isEmailVerified: true,
        refreshToken: 'different_hash',
        refreshTokenExpiresAt: new Date(Date.now() + 3600000),
      });

      // bcrypt.compare returns false (no match)
      await expect(authService.refreshToken({ refreshToken: 'valid_refresh' }))
        .rejects.toThrow(expect.objectContaining({ statusCode: 401 }));

      // Should have cleared all tokens (potential reuse attack)
      expect(mockUserRepo.clearRefreshToken).toHaveBeenCalledWith('user1');
    });

    test('returns new tokens on valid refresh', async () => {
      const realHash = await bcrypt.hash(hashTokenForStorage('valid_refresh'), PASSWORD_SALT_ROUNDS);

      mockUserRepo.findByIdWithPassword.mockResolvedValue({
        _id: 'user1',
        isEmailVerified: true,
        refreshToken: realHash,
        refreshTokenExpiresAt: new Date(Date.now() + 3600000),
      });
      mockUserRepo.updateRefreshToken.mockResolvedValue({});

      const result = await authService.refreshToken({ refreshToken: 'valid_refresh' });

      expect(result.user).toBeDefined();
      expect(result.tokens).toBeDefined();
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();

      // Should have been called to rotate the refresh token
      expect(mockUserRepo.updateRefreshToken).toHaveBeenCalledWith(
        'user1',
        expect.any(String), // new hash
        expect.any(Date),   // new expiry
      );
    });

    test('rotated refresh token is different from the original', async () => {
      const realHash = await bcrypt.hash(hashTokenForStorage('original_refresh'), PASSWORD_SALT_ROUNDS);

      mockUserRepo.findByIdWithPassword.mockResolvedValue({
        _id: 'user1',
        isEmailVerified: true,
        refreshToken: realHash,
        refreshTokenExpiresAt: new Date(Date.now() + 3600000),
      });
      mockUserRepo.updateRefreshToken.mockResolvedValue({});

      const result = await authService.refreshToken({ refreshToken: 'original_refresh' });

      expect(result.tokens.refreshToken).not.toBe('original_refresh');
    });

    test('refresh token reuse is rejected (old token fails after rotation)', async () => {
      const realHash = await bcrypt.hash(hashTokenForStorage('token_A'), PASSWORD_SALT_ROUNDS);

      mockUserRepo.findByIdWithPassword.mockResolvedValue({
        _id: 'user1',
        isEmailVerified: true,
        refreshToken: realHash,
        refreshTokenExpiresAt: new Date(Date.now() + 3600000),
      });
      mockUserRepo.updateRefreshToken.mockResolvedValue({});

      // First refresh with token_A should succeed
      const result = await authService.refreshToken({ refreshToken: 'token_A' });
      expect(result.tokens).toBeDefined();

      // Simulate that DB now has the NEW hash from rotation
      const newRealHash = await bcrypt.hash(hashTokenForStorage(result.tokens.refreshToken), PASSWORD_SALT_ROUNDS);
      mockUserRepo.findByIdWithPassword.mockResolvedValue({
        _id: 'user1',
        isEmailVerified: true,
        refreshToken: newRealHash,
        refreshTokenExpiresAt: new Date(Date.now() + 3600000),
      });

      // Second attempt with the OLD token_A should fail
      await expect(authService.refreshToken({ refreshToken: 'token_A' }))
        .rejects.toThrow(expect.objectContaining({ statusCode: 401 }));
    });

    test('multiple sequential refreshes work correctly', async () => {
      // NOTE: This test performs 3 iterations × 3 bcrypt operations (setup hash,
      // service compare, service rotation hash). At the production cost factor
      // (12) that takes > 5s and exceeds Jest's default timeout.
      //
      // We therefore run REAL bcrypt at a reduced cost factor for this test
      // only. Hashing/comparison semantics are fully preserved (compare still
      // verifies against the stored hash, rotation still produces a new valid
      // token) — only the work factor is lowered. The production implementation
      // and its cost factor of 12 are NOT modified.
      const realBcryptHash = bcrypt.hash.bind(bcrypt);
      const fastHashSpy = jest.spyOn(bcrypt, 'hash').mockImplementation(
        (data, saltOrRounds) =>
          realBcryptHash(data, typeof saltOrRounds === 'number' ? 4 : saltOrRounds)
      );

      try {
        let currentRefreshToken = 'initial_token';

        // Create a chain of refreshes
        for (let i = 0; i < 3; i++) {
          const realHash = await bcrypt.hash(hashTokenForStorage(currentRefreshToken), PASSWORD_SALT_ROUNDS);

          mockUserRepo.findByIdWithPassword.mockResolvedValue({
            _id: 'user1',
            isEmailVerified: true,
            refreshToken: realHash,
            refreshTokenExpiresAt: new Date(Date.now() + 3600000),
          });
          mockUserRepo.updateRefreshToken.mockResolvedValue({});

          const result = await authService.refreshToken({ refreshToken: currentRefreshToken });
          expect(result.tokens.refreshToken).toBeDefined();
          currentRefreshToken = result.tokens.refreshToken;
        }

        // The final token should be valid and different from the initial one
        expect(currentRefreshToken).not.toBe('initial_token');

        // Each iteration rotated the stored hash (updateRefreshToken called once per refresh)
        expect(mockUserRepo.updateRefreshToken).toHaveBeenCalledTimes(3);
      } finally {
        fastHashSpy.mockRestore();
      }
    });
  });

  // ─── Integration: Logout invalidates refresh ─────────────────

  describe('Logout invalidates refresh token', () => {
    test('clearRefreshToken is called during logout', async () => {
      mockUserRepo.clearRefreshToken.mockResolvedValue({});
      await authService.logout('user1');
      expect(mockUserRepo.clearRefreshToken).toHaveBeenCalledWith('user1');
    });
  });

  // ─── Integration: Password change invalidates refresh ────────

  describe('Password change invalidates refresh token', () => {
    test('changePassword clears refresh token', async () => {
      const hashedPassword = await bcrypt.hash('oldpass123', PASSWORD_SALT_ROUNDS);
      mockUserRepo.findByIdWithPassword.mockResolvedValue({
        _id: 'user1',
        password: hashedPassword,
      });
      mockUserRepo.updatePassword.mockResolvedValue({});
      mockUserRepo.clearRefreshToken.mockResolvedValue({});

      await authService.changePassword('user1', {
        currentPassword: 'oldpass123',
        newPassword: 'newpass123',
      });

      expect(mockUserRepo.clearRefreshToken).toHaveBeenCalledWith('user1');
    });
  });

  // ─── createAuthenticationResponse stores refreshTokenExpiresAt ──

  describe('createAuthenticationResponse stores refreshTokenExpiresAt', () => {
    test('updateRefreshToken is called with both hash and expiry', async () => {
      mockUserRepo.updateRefreshToken.mockResolvedValue({});

      const result = await authService.createAuthenticationResponse({
        _id: 'user1',
        name: 'Test User',
        email: 'test@example.com',
        isEmailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(mockUserRepo.updateRefreshToken).toHaveBeenCalledWith(
        'user1',
        expect.any(String),
        expect.any(Date),
      );
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
    });
  });

  // ─── Rate limiter has independent bucket ─────────────────────

  describe('Refresh rate limiter', () => {
    test('refreshLimiter exists and is a function', () => {
      expect(typeof refreshLimiter).toBe('function');
    });

    test('refreshLimiter is separate from loginLimiter', () => {
      const { loginLimiter } = require('../src/shared/middleware/rate-limiter.middleware');
      expect(refreshLimiter).not.toBe(loginLimiter);
    });
  });

  // ─── Refresh endpoint validation via auth routes source ──────

  describe('Refresh route configuration', () => {
    test('auth routes file includes refresh endpoint', () => {
      const fs = require('fs');
      const path = require('path');
      const routesPath = path.join(__dirname, '../src/modules/auth/presentation/routes/auth.routes.js');
      const content = fs.readFileSync(routesPath, 'utf-8');
      expect(content).toContain("'/refresh'");
      expect(content).toContain('refreshLimiter');
      expect(content).toContain('validateRefreshToken');
      expect(content).toContain('authController.refresh');
    });
  });
});
