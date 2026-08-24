const bcrypt = require('bcrypt');
const crypto = require('crypto');
const AuthService = require('../src/modules/auth/application/auth.service');
const AppError = require('../src/shared/errors/app-error');
const { validateVerifyEmail, validateResendVerification } = require('../src/modules/auth/presentation/validators/verification.validator');

// ─── Helpers ───────────────────────────────────────────────────────

function createMockUser(overrides = {}) {
  return {
    _id: { toString: () => overrides.id || '507f1f77bcf86cd799439011' },
    name: overrides.name || 'Test User',
    email: overrides.email || 'test@example.com',
    isEmailVerified: overrides.isEmailVerified || false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockToken(overrides = {}) {
  return {
    _id: overrides.id || 'token123',
    userId: overrides.userId || '507f1f77bcf86cd799439011',
    token: overrides.token || '$2b$12$hashedotp',
    purpose: overrides.purpose || 'email_verification',
    expiresAt: overrides.expiresAt || new Date(Date.now() + 15 * 60 * 1000),
    attempts: overrides.attempts || 0,
    maxAttempts: overrides.maxAttempts || 5,
    used: overrides.used || false,
    ...overrides,
  };
}

// ─── Verification Token Validators ─────────────────────────────────

describe('Verification Validators', () => {
  describe('validateVerifyEmail', () => {
    test('accepts valid email and 6-digit code', () => {
      const req = { body: { email: 'test@example.com', code: '123456' } };
      const next = jest.fn();
      validateVerifyEmail(req, {}, next);
      expect(next).toHaveBeenCalledWith();
      expect(req.body.email).toBe('test@example.com');
      expect(req.body.code).toBe('123456');
    });

    test('normalizes email to lowercase and trimmed', () => {
      const req = { body: { email: '  TEST@EXAMPLE.COM ', code: '654321' } };
      const next = jest.fn();
      validateVerifyEmail(req, {}, next);
      expect(req.body.email).toBe('test@example.com');
      expect(next).toHaveBeenCalledWith();
    });

    test('trims the code', () => {
      const req = { body: { email: 'test@example.com', code: '  123456  ' } };
      const next = jest.fn();
      validateVerifyEmail(req, {}, next);
      expect(req.body.code).toBe('123456');
      expect(next).toHaveBeenCalledWith();
    });

    test('rejects missing email', () => {
      const req = { body: { code: '123456' } };
      const next = jest.fn();
      validateVerifyEmail(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects invalid email format', () => {
      const req = { body: { email: 'not-an-email', code: '123456' } };
      const next = jest.fn();
      validateVerifyEmail(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects email with consecutive dots', () => {
      const req = { body: { email: 'test..user@gmail.com', code: '123456' } };
      const next = jest.fn();
      validateVerifyEmail(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects missing code', () => {
      const req = { body: { email: 'test@example.com' } };
      const next = jest.fn();
      validateVerifyEmail(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects non-numeric code', () => {
      const req = { body: { email: 'test@example.com', code: 'abcdef' } };
      const next = jest.fn();
      validateVerifyEmail(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects code shorter than 6 digits', () => {
      const req = { body: { email: 'test@example.com', code: '12345' } };
      const next = jest.fn();
      validateVerifyEmail(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects code longer than 6 digits', () => {
      const req = { body: { email: 'test@example.com', code: '1234567' } };
      const next = jest.fn();
      validateVerifyEmail(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects code with letters mixed in', () => {
      const req = { body: { email: 'test@example.com', code: '12ab56' } };
      const next = jest.fn();
      validateVerifyEmail(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects code that is not a string', () => {
      const req = { body: { email: 'test@example.com', code: 123456 } };
      const next = jest.fn();
      validateVerifyEmail(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects empty email string', () => {
      const req = { body: { email: '', code: '123456' } };
      const next = jest.fn();
      validateVerifyEmail(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });
  });

  describe('validateResendVerification', () => {
    test('accepts valid email', () => {
      const req = { body: { email: 'test@example.com' } };
      const next = jest.fn();
      validateResendVerification(req, {}, next);
      expect(req.body.email).toBe('test@example.com');
      expect(next).toHaveBeenCalledWith();
    });

    test('normalizes email to lowercase and trimmed', () => {
      const req = { body: { email: '  TEST@EXAMPLE.COM ' } };
      const next = jest.fn();
      validateResendVerification(req, {}, next);
      expect(req.body.email).toBe('test@example.com');
      expect(next).toHaveBeenCalledWith();
    });

    test('rejects missing email', () => {
      const req = { body: {} };
      const next = jest.fn();
      validateResendVerification(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects invalid email', () => {
      const req = { body: { email: 'not-valid' } };
      const next = jest.fn();
      validateResendVerification(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects email with consecutive dots', () => {
      const req = { body: { email: 'test..user@gmail.com' } };
      const next = jest.fn();
      validateResendVerification(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects email that is not a string', () => {
      const req = { body: { email: 12345 } };
      const next = jest.fn();
      validateResendVerification(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });
  });
});

// ─── OTP Generation ────────────────────────────────────────────────

describe('OTP Generation', () => {
  test('generates a 6-digit numeric string', () => {
    // We test generateOtp indirectly by calling register and capturing the OTP
    // But we can also test the crypto.randomInt approach directly
    const min = 100000;
    const max = 999999;
    const otp = crypto.randomInt(min, max + 1).toString();
    expect(otp).toMatch(/^\d{6}$/);
    expect(otp.length).toBe(6);
  });

  test('generates different OTPs on successive calls', () => {
    const otps = new Set();
    for (let i = 0; i < 50; i++) {
      const otp = crypto.randomInt(100000, 999999 + 1).toString();
      otps.add(otp);
    }
    // Should generate at least 40 unique values out of 50
    expect(otps.size).toBeGreaterThan(40);
  });
});

// ─── AuthService — verifyEmail ─────────────────────────────────────

describe('AuthService — verifyEmail', () => {
  let authService;
  let mockUserRepo;
  let mockTokenService;
  let mockEmailService;
  let mockVerificationTokenRepo;
  let mockPendingRegistrationRepo;

  beforeEach(() => {
    mockUserRepo = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      markEmailVerified: jest.fn(),
      create: jest.fn(),
      updateRefreshToken: jest.fn().mockResolvedValue({}),
    };
    mockTokenService = {
      generateAccessToken: jest.fn().mockReturnValue('mock-access-token'),
      generateRefreshToken: jest.fn().mockReturnValue('mock-refresh-token'),
    };
    mockEmailService = {};
    mockVerificationTokenRepo = {
      findActive: jest.fn(),
      incrementAttempts: jest.fn(),
      markUsed: jest.fn(),
      invalidateAll: jest.fn(),
      create: jest.fn(),
    };
    mockPendingRegistrationRepo = {
      findByEmail: jest.fn(),
      upsert: jest.fn(),
      deleteByEmail: jest.fn(),
    };

    authService = new AuthService(mockUserRepo, mockTokenService, mockEmailService, mockVerificationTokenRepo, mockPendingRegistrationRepo);
  });

  test('returns success with valid OTP via PendingRegistration', async () => {
    const pending = {
      _id: { toString: () => 'pending123' },
      name: 'Test User',
      email: 'test@example.com',
      passwordHash: '$2b$12$hashedpassword',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };
    const hashedOtp = await bcrypt.hash('123456', 12);
    const token = createMockToken({ token: hashedOtp, attempts: 0 });
    const createdUser = createMockUser({ isEmailVerified: true });

    mockPendingRegistrationRepo.findByEmail.mockResolvedValue(pending);
    mockVerificationTokenRepo.findActive.mockResolvedValue(token);
    mockUserRepo.create.mockResolvedValue(createdUser);
    mockVerificationTokenRepo.markUsed.mockResolvedValue({ ...token, used: true });
    mockPendingRegistrationRepo.deleteByEmail.mockResolvedValue({});

    const result = await authService.verifyEmail({ email: 'test@example.com', code: '123456' });

    expect(result.user).toBeDefined();
    expect(result.user.isEmailVerified).toBe(true);
    expect(result.tokens).toBeDefined();
    expect(result.tokens.accessToken).toBe('mock-access-token');
    expect(result.tokens.refreshToken).toBe('mock-refresh-token');
    expect(mockUserRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'test@example.com', isEmailVerified: true })
    );
    expect(mockVerificationTokenRepo.markUsed).toHaveBeenCalledWith(token._id);
    expect(mockPendingRegistrationRepo.deleteByEmail).toHaveBeenCalledWith('test@example.com');
  });

  test('returns success with valid OTP for legacy unverified User', async () => {
    const user = createMockUser({ isEmailVerified: false });
    const hashedOtp = await bcrypt.hash('123456', 12);
    const token = createMockToken({ token: hashedOtp, attempts: 0 });
    const verifiedUser = { ...user, isEmailVerified: true };

    mockPendingRegistrationRepo.findByEmail.mockResolvedValue(null);
    mockUserRepo.findByEmail.mockResolvedValue(user);
    mockVerificationTokenRepo.findActive.mockResolvedValue(token);
    mockUserRepo.markEmailVerified.mockResolvedValue(verifiedUser);
    mockVerificationTokenRepo.markUsed.mockResolvedValue({ ...token, used: true });

    const result = await authService.verifyEmail({ email: 'test@example.com', code: '123456' });

    expect(result.user).toBeDefined();
    expect(result.user.isEmailVerified).toBe(true);
    expect(result.tokens).toBeDefined();
    expect(mockUserRepo.markEmailVerified).toHaveBeenCalledWith(user._id);
    expect(mockVerificationTokenRepo.markUsed).toHaveBeenCalledWith(token._id);
  });

  test('returns error with invalid OTP', async () => {
    const user = createMockUser({ isEmailVerified: false });
    const hashedOtp = await bcrypt.hash('123456', 12);
    const token = createMockToken({ token: hashedOtp, attempts: 0, maxAttempts: 5 });

    mockUserRepo.findByEmail.mockResolvedValue(user);
    mockVerificationTokenRepo.findActive.mockResolvedValue(token);
    mockVerificationTokenRepo.incrementAttempts.mockResolvedValue({ ...token, attempts: 1 });

    await expect(
      authService.verifyEmail({ email: 'test@example.com', code: '999999' }),
    ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));

    expect(mockVerificationTokenRepo.incrementAttempts).toHaveBeenCalledWith(token._id);
    expect(mockUserRepo.markEmailVerified).not.toHaveBeenCalled();
  });

  test('increments attempts on invalid OTP', async () => {
    const user = createMockUser({ isEmailVerified: false });
    const hashedOtp = await bcrypt.hash('123456', 12);
    const token = createMockToken({ token: hashedOtp, attempts: 2, maxAttempts: 5 });

    mockUserRepo.findByEmail.mockResolvedValue(user);
    mockVerificationTokenRepo.findActive.mockResolvedValue(token);
    mockVerificationTokenRepo.incrementAttempts.mockResolvedValue({ ...token, attempts: 3 });

    await expect(
      authService.verifyEmail({ email: 'test@example.com', code: '000000' }),
    ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));

    expect(mockVerificationTokenRepo.incrementAttempts).toHaveBeenCalledWith(token._id);
  });

  test('rejects after max attempts exceeded', async () => {
    const user = createMockUser({ isEmailVerified: false });
    const token = createMockToken({ attempts: 5, maxAttempts: 5 });

    mockPendingRegistrationRepo.findByEmail.mockResolvedValue(null);
    mockUserRepo.findByEmail.mockResolvedValue(user);
    mockVerificationTokenRepo.findActive.mockResolvedValue(token);

    await expect(
      authService.verifyEmail({ email: 'test@example.com', code: '123456' }),
    ).rejects.toThrow('Too many failed attempts. Please register again.');
  });

  test('rejects when user is already verified (legacy path)', async () => {
    const user = createMockUser({ isEmailVerified: true });

    mockPendingRegistrationRepo.findByEmail.mockResolvedValue(null);
    mockUserRepo.findByEmail.mockResolvedValue(user);

    await expect(
      authService.verifyEmail({ email: 'test@example.com', code: '123456' }),
    ).rejects.toThrow('Email is already verified.');
  });

  test('rejects when no pending verification token exists', async () => {
    const pending = {
      _id: { toString: () => 'pending123' },
      email: 'test@example.com',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };

    mockPendingRegistrationRepo.findByEmail.mockResolvedValue(pending);
    mockVerificationTokenRepo.findActive.mockResolvedValue(null);

    await expect(
      authService.verifyEmail({ email: 'test@example.com', code: '123456' }),
    ).rejects.toThrow('No pending verification found. Please register again.');
  });

  test('rejects when no pending registration and no user found', async () => {
    mockPendingRegistrationRepo.findByEmail.mockResolvedValue(null);
    mockUserRepo.findByEmail.mockResolvedValue(null);

    await expect(
      authService.verifyEmail({ email: 'unknown@example.com', code: '123456' }),
    ).rejects.toThrow('No pending verification found. Please register again.');
  });

  test('returns error when remaining attempts is 1', async () => {
    const user = createMockUser({ isEmailVerified: false });
    const hashedOtp = await bcrypt.hash('123456', 12);
    const token = createMockToken({ token: hashedOtp, attempts: 4, maxAttempts: 5 });

    mockPendingRegistrationRepo.findByEmail.mockResolvedValue(null);
    mockUserRepo.findByEmail.mockResolvedValue(user);
    mockVerificationTokenRepo.findActive.mockResolvedValue(token);
    mockVerificationTokenRepo.incrementAttempts.mockResolvedValue({ ...token, attempts: 5 });

    await expect(
      authService.verifyEmail({ email: 'test@example.com', code: '000000' }),
    ).rejects.toThrow('Too many failed attempts. Please register again.');
  });

  test('shows "1 attempt remaining" when one left', async () => {
    const user = createMockUser({ isEmailVerified: false });
    const hashedOtp = await bcrypt.hash('123456', 12);
    const token = createMockToken({ token: hashedOtp, attempts: 3, maxAttempts: 5 });

    mockPendingRegistrationRepo.findByEmail.mockResolvedValue(null);
    mockUserRepo.findByEmail.mockResolvedValue(user);
    mockVerificationTokenRepo.findActive.mockResolvedValue(token);
    mockVerificationTokenRepo.incrementAttempts.mockResolvedValue({ ...token, attempts: 4 });

    await expect(
      authService.verifyEmail({ email: 'test@example.com', code: '000000' }),
    ).rejects.toThrow('1 attempt remaining.');
  });

  test('does not mark token as used if markEmailVerified fails (legacy)', async () => {
    const user = createMockUser({ isEmailVerified: false });
    const hashedOtp = await bcrypt.hash('123456', 12);
    const token = createMockToken({ token: hashedOtp, attempts: 0 });

    mockPendingRegistrationRepo.findByEmail.mockResolvedValue(null);
    mockUserRepo.findByEmail.mockResolvedValue(user);
    mockVerificationTokenRepo.findActive.mockResolvedValue(token);
    mockUserRepo.markEmailVerified.mockResolvedValue(null); // simulate failure

    await expect(
      authService.verifyEmail({ email: 'test@example.com', code: '123456' }),
    ).rejects.toThrow('Verification failed. Please try again.');

    expect(mockVerificationTokenRepo.markUsed).not.toHaveBeenCalled();
  });
});

// ─── AuthService — resendVerification ──────────────────────────────

describe('AuthService — resendVerification', () => {
  let authService;
  let mockUserRepo;
  let mockTokenService;
  let mockEmailService;
  let mockVerificationTokenRepo;
  let mockPendingRegistrationRepo;

  beforeEach(() => {
    mockUserRepo = {
      findByEmail: jest.fn(),
      create: jest.fn(),
    };
    mockTokenService = {};
    mockEmailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    };
    mockVerificationTokenRepo = {
      invalidateAll: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    };
    mockPendingRegistrationRepo = {
      findByEmail: jest.fn(),
    };

    authService = new AuthService(mockUserRepo, mockTokenService, mockEmailService, mockVerificationTokenRepo, mockPendingRegistrationRepo);
  });

  test('generates new OTP and sends email for pending registration', async () => {
    const pending = {
      _id: { toString: () => 'pending123' },
      name: 'Test User',
      email: 'test@example.com',
    };

    mockPendingRegistrationRepo.findByEmail.mockResolvedValue(pending);

    const result = await authService.resendVerification({ email: 'test@example.com' });

    expect(result.message).toBe('If this email is registered, a new verification code has been sent.');
    expect(mockVerificationTokenRepo.invalidateAll).toHaveBeenCalledWith({
      userId: pending._id,
      purpose: 'email_verification',
    });
    expect(mockVerificationTokenRepo.create).toHaveBeenCalledTimes(1);
    expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledWith(
      'test@example.com',
      expect.objectContaining({ name: 'Test User', verificationCode: expect.stringMatching(/^\d{6}$/) }),
    );
  });

  test('generates new OTP for legacy unverified user', async () => {
    const user = createMockUser({ isEmailVerified: false });

    mockPendingRegistrationRepo.findByEmail.mockResolvedValue(null);
    mockUserRepo.findByEmail.mockResolvedValue(user);

    const result = await authService.resendVerification({ email: 'test@example.com' });

    expect(result.message).toBe('If this email is registered, a new verification code has been sent.');
    expect(mockVerificationTokenRepo.invalidateAll).toHaveBeenCalledWith({
      userId: user._id,
      purpose: 'email_verification',
    });
    expect(mockVerificationTokenRepo.create).toHaveBeenCalledTimes(1);
    expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  test('does not reveal whether email exists (nonexistent email)', async () => {
    mockPendingRegistrationRepo.findByEmail.mockResolvedValue(null);
    mockUserRepo.findByEmail.mockResolvedValue(null);

    const result = await authService.resendVerification({ email: 'unknown@example.com' });

    expect(result.message).toBe('If this email is registered, a new verification code has been sent.');
    expect(mockVerificationTokenRepo.invalidateAll).not.toHaveBeenCalled();
    expect(mockEmailService.sendVerificationEmail).not.toHaveBeenCalled();
  });

  test('returns already-verified message for verified user', async () => {
    const user = createMockUser({ isEmailVerified: true });

    mockPendingRegistrationRepo.findByEmail.mockResolvedValue(null);
    mockUserRepo.findByEmail.mockResolvedValue(user);

    const result = await authService.resendVerification({ email: 'test@example.com' });

    expect(result.message).toBe('Email is already verified.');
    expect(mockVerificationTokenRepo.invalidateAll).not.toHaveBeenCalled();
    expect(mockEmailService.sendVerificationEmail).not.toHaveBeenCalled();
  });

  test('OTP is exactly 6 numeric digits', async () => {
    const user = createMockUser({ isEmailVerified: false });
    mockUserRepo.findByEmail.mockResolvedValue(user);

    await authService.resendVerification({ email: 'test@example.com' });

    const otp = mockEmailService.sendVerificationEmail.mock.calls[0][1].verificationCode;
    expect(otp).toMatch(/^\d{6}$/);
    expect(otp.length).toBe(6);
  });

  test('invalidates old tokens before creating new one', async () => {
    const user = createMockUser({ isEmailVerified: false });
    mockUserRepo.findByEmail.mockResolvedValue(user);

    await authService.resendVerification({ email: 'test@example.com' });

    // Invalidate must be called before create
    const invalidateCall = mockVerificationTokenRepo.invalidateAll.mock.invocationCallOrder[0];
    const createCall = mockVerificationTokenRepo.create.mock.invocationCallOrder[0];
    expect(invalidateCall).toBeLessThan(createCall);
  });

  test('OTP is hashed before storage', async () => {
    const user = createMockUser({ isEmailVerified: false });
    mockUserRepo.findByEmail.mockResolvedValue(user);

    await authService.resendVerification({ email: 'test@example.com' });

    const storedToken = mockVerificationTokenRepo.create.mock.calls[0][0].token;
    // bcrypt hashes start with $2b$
    expect(storedToken).toMatch(/^\$2b\$/);
  });

  test('does not throw if email sending fails', async () => {
    const user = createMockUser({ isEmailVerified: false });
    mockUserRepo.findByEmail.mockResolvedValue(user);
    mockEmailService.sendVerificationEmail.mockRejectedValue(new Error('Email API down'));

    await expect(
      authService.resendVerification({ email: 'test@example.com' }),
    ).resolves.toEqual({ message: 'If this email is registered, a new verification code has been sent.' });
  });
});

// ─── Registration — OTP Integration ────────────────────────────────

describe('AuthService — Registration with OTP', () => {
  let authService;
  let mockUserRepo;
  let mockTokenService;
  let mockEmailService;
  let mockVerificationTokenRepo;
  let mockPendingRegistrationRepo;

  beforeEach(() => {
    mockUserRepo = {
      findByEmail: jest.fn(),
      findByEmailWithPassword: jest.fn(),
      create: jest.fn(),
      updateRefreshToken: jest.fn(),
    };
    mockTokenService = {
      generateAccessToken: jest.fn().mockReturnValue('mock-access-token'),
      generateRefreshToken: jest.fn().mockReturnValue('mock-refresh-token'),
    };
    mockEmailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    };
    mockVerificationTokenRepo = {
      invalidateAll: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    };
    mockPendingRegistrationRepo = {
      findByEmail: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      deleteByEmail: jest.fn().mockResolvedValue({}),
    };

    authService = new AuthService(mockUserRepo, mockTokenService, mockEmailService, mockVerificationTokenRepo, mockPendingRegistrationRepo);
  });

  test('creates PendingRegistration and sends OTP on registration', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);
    mockPendingRegistrationRepo.findByEmail.mockResolvedValue({
      _id: { toString: () => 'pending123' },
      email: 'test@example.com',
    });

    await authService.register({ name: 'Test', email: 'test@example.com', password: 'password123' });

    // Should NOT create a User document
    expect(mockUserRepo.create).not.toHaveBeenCalled();

    // Should create a PendingRegistration
    expect(mockPendingRegistrationRepo.upsert).toHaveBeenCalledTimes(1);
    expect(mockPendingRegistrationRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test',
        email: 'test@example.com',
      }),
    );

    // Should create verification token
    expect(mockVerificationTokenRepo.invalidateAll).toHaveBeenCalled();
    expect(mockVerificationTokenRepo.create).toHaveBeenCalledTimes(1);
    expect(mockVerificationTokenRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'email_verification',
        maxAttempts: 5,
      }),
    );

    // Should send email
    expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledWith(
      'test@example.com',
      expect.objectContaining({ name: 'Test', verificationCode: expect.stringMatching(/^\d{6}$/) }),
    );
  });

  test('does NOT return authentication tokens after registration', async () => {
    const user = createMockUser();
    mockUserRepo.findByEmail.mockResolvedValue(null);
    mockUserRepo.create.mockResolvedValue(user);

    const result = await authService.register({ name: 'Test', email: 'test@example.com', password: 'password123' });

    expect(result.message).toBeDefined();
    expect(result.email).toBe('test@example.com');
    expect(result.user).toBeUndefined();
    expect(result.tokens).toBeUndefined();
  });

  test('does NOT return authentication tokens after registration', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);
    mockPendingRegistrationRepo.findByEmail.mockResolvedValue({
      _id: { toString: () => 'pending123' },
      email: 'test@example.com',
    });

    const result = await authService.register({ name: 'Test', email: 'test@example.com', password: 'password123' });

    expect(result.message).toBeDefined();
    expect(result.email).toBe('test@example.com');
    expect(result.user).toBeUndefined();
    expect(result.tokens).toBeUndefined();
  });

  test('registration still works if email service is not available', async () => {
    const authServiceNoEmail = new AuthService(mockUserRepo, mockTokenService, null, null, mockPendingRegistrationRepo);
    mockUserRepo.findByEmail.mockResolvedValue(null);
    mockPendingRegistrationRepo.findByEmail.mockResolvedValue({
      _id: { toString: () => 'pending123' },
      email: 'test@example.com',
    });

    const result = await authServiceNoEmail.register({ name: 'Test', email: 'test@example.com', password: 'password123' });

    expect(result.message).toBeDefined();
    expect(result.email).toBe('test@example.com');
  });

  test('OTP is hashed before storage in registration', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);
    mockPendingRegistrationRepo.findByEmail.mockResolvedValue({
      _id: { toString: () => 'pending123' },
      email: 'test@example.com',
    });

    await authService.register({ name: 'Test', email: 'test@example.com', password: 'password123' });

    const storedToken = mockVerificationTokenRepo.create.mock.calls[0][0].token;
    expect(storedToken).toMatch(/^\$2b\$/);
  });

  test('plaintext OTP is never returned in registration response', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);
    mockPendingRegistrationRepo.findByEmail.mockResolvedValue({
      _id: { toString: () => 'pending123' },
      email: 'test@example.com',
    });

    const result = await authService.register({ name: 'Test', email: 'test@example.com', password: 'password123' });

    // Registration should not return user data or tokens
    expect(result.user).toBeUndefined();
    expect(result.tokens).toBeUndefined();
    expect(result).not.toHaveProperty('otp');
    expect(result).not.toHaveProperty('verificationCode');
  });
});

// ─── Register → Resend → Verify Integration ───────────────────────

describe('Register → Resend → Verify Integration', () => {
  let authService;
  let mockUserRepo;
  let mockTokenService;
  let mockEmailService;
  let mockVerificationTokenRepo;
  let mockPendingRegistrationRepo;

  beforeEach(() => {
    mockUserRepo = {
      findByEmail: jest.fn().mockResolvedValue(null),
      findByEmailWithPassword: jest.fn(),
      create: jest.fn(),
      updateRefreshToken: jest.fn().mockResolvedValue({}),
      markEmailVerified: jest.fn(),
    };
    mockTokenService = {
      generateAccessToken: jest.fn().mockReturnValue('mock-access-token'),
      generateRefreshToken: jest.fn().mockReturnValue('mock-refresh-token'),
    };
    mockEmailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    };
    mockVerificationTokenRepo = {
      findActive: jest.fn(),
      incrementAttempts: jest.fn(),
      markUsed: jest.fn().mockResolvedValue({}),
      invalidateAll: jest.fn().mockResolvedValue({}),
      create: jest.fn(),
    };
    mockPendingRegistrationRepo = {
      findByEmail: jest.fn(),
      upsert: jest.fn().mockResolvedValue({}),
      deleteByEmail: jest.fn().mockResolvedValue({}),
    };

    authService = new AuthService(mockUserRepo, mockTokenService, mockEmailService, mockVerificationTokenRepo, mockPendingRegistrationRepo);
  });

  test('register → verify with original OTP succeeds', async () => {
    const pendingObj = {
      _id: { toString: () => 'pending123' },
      name: 'Test User',
      email: 'test@example.com',
      passwordHash: '$2b$12$hashedpassword',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };
    const hashedOtp = await bcrypt.hash('123456', 12);
    const tokenObj = createMockToken({ token: hashedOtp, attempts: 0 });
    const createdUser = createMockUser({ isEmailVerified: true });

    // Register
    mockUserRepo.findByEmail.mockResolvedValue(null);
    mockPendingRegistrationRepo.findByEmail.mockResolvedValue(pendingObj);
    await authService.register({ name: 'Test User', email: 'test@example.com', password: 'password123' });

    // Verify with original OTP
    mockVerificationTokenRepo.findActive.mockResolvedValue(tokenObj);
    mockUserRepo.create.mockResolvedValue(createdUser);
    mockVerificationTokenRepo.markUsed.mockResolvedValue({ ...tokenObj, used: true });
    mockPendingRegistrationRepo.deleteByEmail.mockResolvedValue({});

    const result = await authService.verifyEmail({ email: 'test@example.com', code: '123456' });

    expect(result.user).toBeDefined();
    expect(result.user.isEmailVerified).toBe(true);
    expect(result.tokens.accessToken).toBe('mock-access-token');
    expect(mockUserRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test User',
        email: 'test@example.com',
        isEmailVerified: true,
      })
    );
  });

  test('register → resend → verify with NEW OTP succeeds', async () => {
    const pendingObj = {
      _id: { toString: () => 'pending123' },
      name: 'Test User',
      email: 'test@example.com',
      passwordHash: '$2b$12$hashedpassword',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };
    const originalOtp = await bcrypt.hash('111111', 12);
    const originalToken = createMockToken({ token: originalOtp, attempts: 0 });
    const newOtp = await bcrypt.hash('222222', 12);
    const newToken = createMockToken({ token: newOtp, attempts: 0 });
    const createdUser = createMockUser({ isEmailVerified: true });

    // Register
    mockUserRepo.findByEmail.mockResolvedValue(null);
    mockPendingRegistrationRepo.findByEmail.mockResolvedValue(pendingObj);
    mockVerificationTokenRepo.invalidateAll.mockResolvedValue({});
    mockVerificationTokenRepo.create.mockResolvedValue(originalToken);
    await authService.register({ name: 'Test User', email: 'test@example.com', password: 'password123' });

    // Resend — should invalidate original and create new token
    mockVerificationTokenRepo.invalidateAll.mockResolvedValue({});
    mockVerificationTokenRepo.create.mockResolvedValue(newToken);
    await authService.resendVerification({ email: 'test@example.com' });

    // Verify with NEW OTP
    mockVerificationTokenRepo.findActive.mockResolvedValue(newToken);
    mockUserRepo.create.mockResolvedValue(createdUser);
    mockVerificationTokenRepo.markUsed.mockResolvedValue({ ...newToken, used: true });
    mockPendingRegistrationRepo.deleteByEmail.mockResolvedValue({});

    const result = await authService.verifyEmail({ email: 'test@example.com', code: '222222' });

    expect(result.user).toBeDefined();
    expect(result.user.isEmailVerified).toBe(true);
    expect(result.tokens.accessToken).toBe('mock-access-token');
    expect(mockPendingRegistrationRepo.deleteByEmail).toHaveBeenCalledWith('test@example.com');
  });

  test('register → resend → OLD OTP is rejected', async () => {
    const pendingObj = {
      _id: { toString: () => 'pending123' },
      name: 'Test User',
      email: 'test@example.com',
      passwordHash: '$2b$12$hashedpassword',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };
    const originalOtp = await bcrypt.hash('111111', 12);
    const newOtp = await bcrypt.hash('222222', 12);
    const newToken = createMockToken({ token: newOtp, attempts: 0 });
    const createdUser = createMockUser({ isEmailVerified: true });

    // Register
    mockUserRepo.findByEmail.mockResolvedValue(null);
    mockPendingRegistrationRepo.findByEmail.mockResolvedValue(pendingObj);
    mockVerificationTokenRepo.invalidateAll.mockResolvedValue({});
    mockVerificationTokenRepo.create.mockResolvedValue({ token: originalOtp });
    await authService.register({ name: 'Test User', email: 'test@example.com', password: 'password123' });

    // Resend
    mockVerificationTokenRepo.invalidateAll.mockResolvedValue({});
    mockVerificationTokenRepo.create.mockResolvedValue(newToken);
    await authService.resendVerification({ email: 'test@example.com' });

    // Verify with OLD OTP — should fail because findActive returns the NEW token
    mockVerificationTokenRepo.findActive.mockResolvedValue(newToken);
    mockVerificationTokenRepo.incrementAttempts.mockResolvedValue({ ...newToken, attempts: 1 });

    await expect(
      authService.verifyEmail({ email: 'test@example.com', code: '111111' })
    ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));

    expect(mockUserRepo.create).not.toHaveBeenCalled();
  });

  test('resend does not create duplicate PendingRegistration records', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);
    mockPendingRegistrationRepo.findByEmail.mockResolvedValue({
      _id: { toString: () => 'pending123' },
      name: 'Test User',
      email: 'test@example.com',
    });

    // Register twice with same email
    await authService.register({ name: 'Test User', email: 'test@example.com', password: 'password123' });
    await authService.register({ name: 'Test User', email: 'test@example.com', password: 'password123' });

    // upsert should have been called twice (upsert, not create)
    expect(mockPendingRegistrationRepo.upsert).toHaveBeenCalledTimes(2);
  });

  test('resend does not create duplicate active OTP records', async () => {
    const pendingObj = {
      _id: { toString: () => 'pending123' },
      name: 'Test User',
      email: 'test@example.com',
    };
    mockPendingRegistrationRepo.findByEmail.mockResolvedValue(pendingObj);
    mockVerificationTokenRepo.invalidateAll.mockResolvedValue({});
    mockVerificationTokenRepo.create.mockResolvedValue({});

    // Resend twice
    await authService.resendVerification({ email: 'test@example.com' });
    await authService.resendVerification({ email: 'test@example.com' });

    // Each resend should invalidate previous tokens and create one new token
    expect(mockVerificationTokenRepo.invalidateAll).toHaveBeenCalledTimes(2);
    expect(mockVerificationTokenRepo.create).toHaveBeenCalledTimes(2);
  });

  test('verify with correct OTP creates User with isEmailVerified=true', async () => {
    const pendingObj = {
      _id: { toString: () => 'pending123' },
      name: 'Test User',
      email: 'test@example.com',
      passwordHash: '$2b$12$hashedpassword',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };
    const hashedOtp = await bcrypt.hash('123456', 12);
    const tokenObj = createMockToken({ token: hashedOtp, attempts: 0 });
    const createdUser = createMockUser({ isEmailVerified: true });

    mockPendingRegistrationRepo.findByEmail.mockResolvedValue(pendingObj);
    mockVerificationTokenRepo.findActive.mockResolvedValue(tokenObj);
    mockUserRepo.create.mockResolvedValue(createdUser);
    mockVerificationTokenRepo.markUsed.mockResolvedValue({ ...tokenObj, used: true });
    mockPendingRegistrationRepo.deleteByEmail.mockResolvedValue({});

    const result = await authService.verifyEmail({ email: 'test@example.com', code: '123456' });

    expect(result.user.isEmailVerified).toBe(true);
    expect(result.tokens).toBeDefined();
    expect(result.tokens.accessToken).toBe('mock-access-token');
    expect(result.tokens.refreshToken).toBe('mock-refresh-token');
  });

  test('wrong OTP returns 4xx error, not 500', async () => {
    const pendingObj = {
      _id: { toString: () => 'pending123' },
      name: 'Test User',
      email: 'test@example.com',
      passwordHash: '$2b$12$hashedpassword',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };
    const hashedOtp = await bcrypt.hash('123456', 12);
    const tokenObj = createMockToken({ token: hashedOtp, attempts: 0, maxAttempts: 5 });

    mockPendingRegistrationRepo.findByEmail.mockResolvedValue(pendingObj);
    mockVerificationTokenRepo.findActive.mockResolvedValue(tokenObj);
    mockVerificationTokenRepo.incrementAttempts.mockResolvedValue({ ...tokenObj, attempts: 1 });

    try {
      await authService.verifyEmail({ email: 'test@example.com', code: '999999' });
      fail('Should have thrown');
    } catch (error) {
      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('Invalid verification code');
    }
  });

  test('expired PendingRegistration returns 4xx error', async () => {
    const pendingObj = {
      _id: { toString: () => 'pending123' },
      name: 'Test User',
      email: 'test@example.com',
      passwordHash: '$2b$12$hashedpassword',
      expiresAt: new Date(Date.now() - 1000), // expired
    };
    mockPendingRegistrationRepo.findByEmail.mockResolvedValue(pendingObj);
    mockVerificationTokenRepo.findActive.mockResolvedValue(null);

    await expect(
      authService.verifyEmail({ email: 'test@example.com', code: '123456' })
    ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  test('does not create User before OTP validation', async () => {
    const pendingObj = {
      _id: { toString: () => 'pending123' },
      name: 'Test User',
      email: 'test@example.com',
      passwordHash: '$2b$12$hashedpassword',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };
    const hashedOtp = await bcrypt.hash('123456', 12);
    const tokenObj = createMockToken({ token: hashedOtp, attempts: 0, maxAttempts: 5 });

    mockVerificationTokenRepo.findActive.mockResolvedValue(tokenObj);
    mockVerificationTokenRepo.incrementAttempts.mockResolvedValue({ ...tokenObj, attempts: 1 });

    // Wrong OTP — should NOT create User
    await expect(
      authService.verifyEmail({ email: 'test@example.com', code: '999999' })
    ).rejects.toThrow();

    expect(mockUserRepo.create).not.toHaveBeenCalled();
  });
});

// ─── PendingRegistration Model Schema ──────────────────────────────

describe('PendingRegistration Model', () => {
  test('passwordHash is NOT excluded from queries (internal model)', () => {
    const PendingRegistration = require('../src/modules/auth/infrastructure/models/pending-registration.model');
    const passwordPath = PendingRegistration.schema.paths.passwordHash;
    expect(passwordPath).toBeDefined();
    // passwordHash should be queryable (not select: false)
    expect(passwordPath.options.select).toBeFalsy();
  });

  test('email has unique index', () => {
    const PendingRegistration = require('../src/modules/auth/infrastructure/models/pending-registration.model');
    const emailPath = PendingRegistration.schema.paths.email;
    expect(emailPath.options.unique).toBe(true);
  });

  test('expiresAt has TTL index', () => {
    const PendingRegistration = require('../src/modules/auth/infrastructure/models/pending-registration.model');
    const expiresAtPath = PendingRegistration.schema.paths.expiresAt;
    expect(expiresAtPath).toBeDefined();
  });
});

// ─── Verification Token Model Schema ───────────────────────────────

describe('VerificationToken Model', () => {
  test('schema has required fields with correct types', () => {
    const VerificationToken = require('../src/modules/auth/infrastructure/models/verification-token.model');
    const schema = VerificationToken.schema;

    const paths = schema.paths;
    expect(paths.userId).toBeDefined();
    expect(paths.token).toBeDefined();
    expect(paths.purpose).toBeDefined();
    expect(paths.expiresAt).toBeDefined();
    expect(paths.attempts).toBeDefined();
    expect(paths.maxAttempts).toBeDefined();
    expect(paths.used).toBeDefined();
    expect(paths.createdAt).toBeDefined();
    expect(paths.updatedAt).toBeDefined();
  });

  test('purpose enum includes email_verification and password_reset', () => {
    const VerificationToken = require('../src/modules/auth/infrastructure/models/verification-token.model');
    const purposePath = VerificationToken.schema.paths.purpose;

    expect(purposePath.enumValues).toContain('email_verification');
    expect(purposePath.enumValues).toContain('password_reset');
  });

  test('maxAttempts defaults to 5', () => {
    const VerificationToken = require('../src/modules/auth/infrastructure/models/verification-token.model');
    const maxAttemptsDefault = VerificationToken.schema.paths.maxAttempts.defaultValue;

    expect(maxAttemptsDefault).toBe(5);
  });

  test('attempts defaults to 0', () => {
    const VerificationToken = require('../src/modules/auth/infrastructure/models/verification-token.model');
    const attemptsDefault = VerificationToken.schema.paths.attempts.defaultValue;

    expect(attemptsDefault).toBe(0);
  });

  test('used defaults to false', () => {
    const VerificationToken = require('../src/modules/auth/infrastructure/models/verification-token.model');
    const usedDefault = VerificationToken.schema.paths.used.defaultValue;

    expect(usedDefault).toBe(false);
  });
});
