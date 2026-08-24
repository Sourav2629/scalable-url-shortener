const bcrypt = require('bcrypt');
const AuthService = require('../src/modules/auth/application/auth.service');
const AppError = require('../src/shared/errors/app-error');
const { validateForgotPassword, validateResetPassword, validateResendPasswordReset } = require('../src/modules/auth/presentation/validators/verification.validator');

// ─── Helpers ───────────────────────────────────────────────────────

function createMockUser(overrides = {}) {
  return {
    _id: { toString: () => overrides.id || '507f1f77bcf86cd799439011' },
    name: overrides.name || 'Test User',
    email: overrides.email || 'test@example.com',
    isEmailVerified: overrides.isEmailVerified !== undefined ? overrides.isEmailVerified : true,
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
    purpose: overrides.purpose || 'password_reset',
    expiresAt: overrides.expiresAt || new Date(Date.now() + 15 * 60 * 1000),
    attempts: overrides.attempts || 0,
    maxAttempts: overrides.maxAttempts || 5,
    used: overrides.used || false,
    ...overrides,
  };
}

// ─── Validators ────────────────────────────────────────────────────

describe('Password Reset Validators', () => {
  describe('validateForgotPassword', () => {
    test('accepts valid email', () => {
      const req = { body: { email: 'test@example.com' } };
      const next = jest.fn();
      validateForgotPassword(req, {}, next);
      expect(next).toHaveBeenCalledWith();
      expect(req.body.email).toBe('test@example.com');
    });

    test('normalizes email to lowercase and trimmed', () => {
      const req = { body: { email: '  TEST@EXAMPLE.COM ' } };
      const next = jest.fn();
      validateForgotPassword(req, {}, next);
      expect(req.body.email).toBe('test@example.com');
      expect(next).toHaveBeenCalledWith();
    });

    test('rejects missing email', () => {
      const req = { body: {} };
      const next = jest.fn();
      validateForgotPassword(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects invalid email format', () => {
      const req = { body: { email: 'not-an-email' } };
      const next = jest.fn();
      validateForgotPassword(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects email with consecutive dots', () => {
      const req = { body: { email: 'test..user@gmail.com' } };
      const next = jest.fn();
      validateForgotPassword(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });
  });

  describe('validateResetPassword', () => {
    test('accepts valid email, code, and password', () => {
      const req = { body: { email: 'test@example.com', code: '123456', newPassword: 'newpassword123' } };
      const next = jest.fn();
      validateResetPassword(req, {}, next);
      expect(next).toHaveBeenCalledWith();
      expect(req.body.email).toBe('test@example.com');
      expect(req.body.code).toBe('123456');
      expect(req.body.newPassword).toBe('newpassword123');
    });

    test('rejects missing code', () => {
      const req = { body: { email: 'test@example.com', newPassword: 'newpassword123' } };
      const next = jest.fn();
      validateResetPassword(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects non-numeric code', () => {
      const req = { body: { email: 'test@example.com', code: 'abcdef', newPassword: 'newpassword123' } };
      const next = jest.fn();
      validateResetPassword(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects short code', () => {
      const req = { body: { email: 'test@example.com', code: '12345', newPassword: 'newpassword123' } };
      const next = jest.fn();
      validateResetPassword(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects short password', () => {
      const req = { body: { email: 'test@example.com', code: '123456', newPassword: 'short' } };
      const next = jest.fn();
      validateResetPassword(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects missing password', () => {
      const req = { body: { email: 'test@example.com', code: '123456' } };
      const next = jest.fn();
      validateResetPassword(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });
  });

  describe('validateResendPasswordReset', () => {
    test('accepts valid email', () => {
      const req = { body: { email: 'test@example.com' } };
      const next = jest.fn();
      validateResendPasswordReset(req, {}, next);
      expect(next).toHaveBeenCalledWith();
      expect(req.body.email).toBe('test@example.com');
    });

    test('rejects invalid email', () => {
      const req = { body: { email: 'not-valid' } };
      const next = jest.fn();
      validateResendPasswordReset(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });
  });
});

// ─── AuthService — forgotPassword ──────────────────────────────────

describe('AuthService — forgotPassword', () => {
  let authService;
  let mockUserRepo;
  let mockTokenService;
  let mockEmailService;
  let mockVerificationTokenRepo;

  beforeEach(() => {
    mockUserRepo = {
      findByEmail: jest.fn(),
      findByEmailWithPassword: jest.fn(),
      updatePassword: jest.fn(),
      clearRefreshToken: jest.fn().mockResolvedValue({}),
    };
    mockTokenService = {};
    mockEmailService = {
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };
    mockVerificationTokenRepo = {
      findActive: jest.fn(),
      incrementAttempts: jest.fn(),
      markUsed: jest.fn().mockResolvedValue({}),
      invalidateAll: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    };

    authService = new AuthService(mockUserRepo, mockTokenService, mockEmailService, mockVerificationTokenRepo, null);
  });

  test('returns generic message for existing verified user', async () => {
    const user = createMockUser({ isEmailVerified: true });
    mockUserRepo.findByEmail.mockResolvedValue(user);

    const result = await authService.forgotPassword({ email: 'test@example.com' });

    expect(result.message).toBe('If this email is registered, a password reset code has been sent.');
    expect(mockVerificationTokenRepo.invalidateAll).toHaveBeenCalledWith({
      userId: user._id,
      purpose: 'password_reset',
    });
    expect(mockVerificationTokenRepo.create).toHaveBeenCalledTimes(1);
    expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  test('returns same generic message for non-existent email', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);

    const result = await authService.forgotPassword({ email: 'unknown@example.com' });

    expect(result.message).toBe('If this email is registered, a password reset code has been sent.');
    expect(mockVerificationTokenRepo.invalidateAll).not.toHaveBeenCalled();
    expect(mockVerificationTokenRepo.create).not.toHaveBeenCalled();
    expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  test('returns same generic message for unverified user', async () => {
    const user = createMockUser({ isEmailVerified: false });
    mockUserRepo.findByEmail.mockResolvedValue(user);

    const result = await authService.forgotPassword({ email: 'test@example.com' });

    expect(result.message).toBe('If this email is registered, a password reset code has been sent.');
    expect(mockVerificationTokenRepo.invalidateAll).not.toHaveBeenCalled();
    expect(mockVerificationTokenRepo.create).not.toHaveBeenCalled();
    expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  test('OTP is hashed before storage', async () => {
    const user = createMockUser({ isEmailVerified: true });
    mockUserRepo.findByEmail.mockResolvedValue(user);

    await authService.forgotPassword({ email: 'test@example.com' });

    const storedToken = mockVerificationTokenRepo.create.mock.calls[0][0].token;
    expect(storedToken).toMatch(/^\$2b\$/);
  });

  test('OTP purpose is password_reset', async () => {
    const user = createMockUser({ isEmailVerified: true });
    mockUserRepo.findByEmail.mockResolvedValue(user);

    await authService.forgotPassword({ email: 'test@example.com' });

    expect(mockVerificationTokenRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'password_reset' })
    );
  });

  test('does not return OTP in response', async () => {
    const user = createMockUser({ isEmailVerified: true });
    mockUserRepo.findByEmail.mockResolvedValue(user);

    const result = await authService.forgotPassword({ email: 'test@example.com' });

    expect(result.otp).toBeUndefined();
    expect(result.code).toBeUndefined();
    expect(result.user).toBeUndefined();
    expect(result.tokens).toBeUndefined();
  });

  test('does not throw if email sending fails', async () => {
    const user = createMockUser({ isEmailVerified: true });
    mockUserRepo.findByEmail.mockResolvedValue(user);
    mockEmailService.sendPasswordResetEmail.mockRejectedValue(new Error('Email API down'));

    await expect(
      authService.forgotPassword({ email: 'test@example.com' })
    ).resolves.toEqual({ message: 'If this email is registered, a password reset code has been sent.' });
  });
});

// ─── AuthService — resetPassword ───────────────────────────────────

describe('AuthService — resetPassword', () => {
  let authService;
  let mockUserRepo;
  let mockTokenService;
  let mockEmailService;
  let mockVerificationTokenRepo;

  beforeEach(() => {
    mockUserRepo = {
      findByEmail: jest.fn(),
      findByEmailWithPassword: jest.fn(),
      updatePassword: jest.fn().mockResolvedValue({}),
      clearRefreshToken: jest.fn().mockResolvedValue({}),
    };
    mockTokenService = {};
    mockEmailService = {};
    mockVerificationTokenRepo = {
      findActive: jest.fn(),
      incrementAttempts: jest.fn(),
      markUsed: jest.fn().mockResolvedValue({}),
      invalidateAll: jest.fn().mockResolvedValue({}),
      create: jest.fn(),
    };

    authService = new AuthService(mockUserRepo, mockTokenService, mockEmailService, mockVerificationTokenRepo, null);
  });

  test('resets password with valid OTP', async () => {
    const user = createMockUser({ isEmailVerified: true });
    const hashedOtp = await bcrypt.hash('123456', 12);
    const token = createMockToken({ token: hashedOtp, attempts: 0 });

    mockUserRepo.findByEmail.mockResolvedValue(user);
    mockVerificationTokenRepo.findActive.mockResolvedValue(token);

    const result = await authService.resetPassword({
      email: 'test@example.com',
      code: '123456',
      newPassword: 'newpassword123',
    });

    expect(result.message).toBe('Password has been reset successfully. Please sign in with your new password.');
    expect(mockUserRepo.updatePassword).toHaveBeenCalledTimes(1);
    expect(mockVerificationTokenRepo.markUsed).toHaveBeenCalledWith(token._id);
    expect(mockUserRepo.clearRefreshToken).toHaveBeenCalledWith(user._id);
  });

  test('new password is bcrypt hashed', async () => {
    const user = createMockUser({ isEmailVerified: true });
    const hashedOtp = await bcrypt.hash('123456', 12);
    const token = createMockToken({ token: hashedOtp, attempts: 0 });

    mockUserRepo.findByEmail.mockResolvedValue(user);
    mockVerificationTokenRepo.findActive.mockResolvedValue(token);

    await authService.resetPassword({
      email: 'test@example.com',
      code: '123456',
      newPassword: 'newpassword123',
    });

    const passwordHash = mockUserRepo.updatePassword.mock.calls[0][1];
    expect(passwordHash).toMatch(/^\$2b\$/);
    expect(await bcrypt.compare('newpassword123', passwordHash)).toBe(true);
  });

  test('does NOT issue authentication tokens', async () => {
    const user = createMockUser({ isEmailVerified: true });
    const hashedOtp = await bcrypt.hash('123456', 12);
    const token = createMockToken({ token: hashedOtp, attempts: 0 });

    mockUserRepo.findByEmail.mockResolvedValue(user);
    mockVerificationTokenRepo.findActive.mockResolvedValue(token);

    const result = await authService.resetPassword({
      email: 'test@example.com',
      code: '123456',
      newPassword: 'newpassword123',
    });

    expect(result.user).toBeUndefined();
    expect(result.tokens).toBeUndefined();
  });

  test('rejects invalid OTP', async () => {
    const user = createMockUser({ isEmailVerified: true });
    const hashedOtp = await bcrypt.hash('123456', 12);
    const token = createMockToken({ token: hashedOtp, attempts: 0, maxAttempts: 5 });

    mockUserRepo.findByEmail.mockResolvedValue(user);
    mockVerificationTokenRepo.findActive.mockResolvedValue(token);
    mockVerificationTokenRepo.incrementAttempts.mockResolvedValue({ ...token, attempts: 1 });

    await expect(
      authService.resetPassword({
        email: 'test@example.com',
        code: '999999',
        newPassword: 'newpassword123',
      })
    ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));

    expect(mockVerificationTokenRepo.incrementAttempts).toHaveBeenCalledWith(token._id);
    expect(mockUserRepo.updatePassword).not.toHaveBeenCalled();
  });

  test('increments attempts on invalid OTP', async () => {
    const user = createMockUser({ isEmailVerified: true });
    const hashedOtp = await bcrypt.hash('123456', 12);
    const token = createMockToken({ token: hashedOtp, attempts: 2, maxAttempts: 5 });

    mockUserRepo.findByEmail.mockResolvedValue(user);
    mockVerificationTokenRepo.findActive.mockResolvedValue(token);
    mockVerificationTokenRepo.incrementAttempts.mockResolvedValue({ ...token, attempts: 3 });

    await expect(
      authService.resetPassword({
        email: 'test@example.com',
        code: '999999',
        newPassword: 'newpassword123',
      })
    ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));

    expect(mockVerificationTokenRepo.incrementAttempts).toHaveBeenCalledWith(token._id);
  });

  test('rejects after max attempts', async () => {
    const user = createMockUser({ isEmailVerified: true });
    const token = createMockToken({ attempts: 5, maxAttempts: 5 });

    mockUserRepo.findByEmail.mockResolvedValue(user);
    mockVerificationTokenRepo.findActive.mockResolvedValue(token);

    await expect(
      authService.resetPassword({
        email: 'test@example.com',
        code: '123456',
        newPassword: 'newpassword123',
      })
    ).rejects.toThrow('Too many failed attempts. Please request a new code.');
  });

  test('rejects when no active token exists', async () => {
    const user = createMockUser({ isEmailVerified: true });

    mockUserRepo.findByEmail.mockResolvedValue(user);
    mockVerificationTokenRepo.findActive.mockResolvedValue(null);

    await expect(
      authService.resetPassword({
        email: 'test@example.com',
        code: '123456',
        newPassword: 'newpassword123',
      })
    ).rejects.toThrow('No pending password reset found. Please request a new code.');
  });

  test('rejects non-existent user with generic error', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);

    await expect(
      authService.resetPassword({
        email: 'unknown@example.com',
        code: '123456',
        newPassword: 'newpassword123',
      })
    ).rejects.toThrow('Invalid or expired reset code. Please request a new one.');
  });

  test('used OTP cannot be reused', async () => {
    const user = createMockUser({ isEmailVerified: true });
    const hashedOtp = await bcrypt.hash('123456', 12);
    const token = createMockToken({ token: hashedOtp, attempts: 0 });

    mockUserRepo.findByEmail.mockResolvedValue(user);

    // First call — success
    mockVerificationTokenRepo.findActive.mockResolvedValue(token);
    await authService.resetPassword({
      email: 'test@example.com',
      code: '123456',
      newPassword: 'newpassword123',
    });

    // Second call — token should be marked used, so findActive returns null
    mockVerificationTokenRepo.findActive.mockResolvedValue(null);

    await expect(
      authService.resetPassword({
        email: 'test@example.com',
        code: '123456',
        newPassword: 'anotherpassword123',
      })
    ).rejects.toThrow('No pending password reset found. Please request a new code.');
  });

  test('invalidates refresh token after successful reset', async () => {
    const user = createMockUser({ isEmailVerified: true });
    const hashedOtp = await bcrypt.hash('123456', 12);
    const token = createMockToken({ token: hashedOtp, attempts: 0 });

    mockUserRepo.findByEmail.mockResolvedValue(user);
    mockVerificationTokenRepo.findActive.mockResolvedValue(token);

    await authService.resetPassword({
      email: 'test@example.com',
      code: '123456',
      newPassword: 'newpassword123',
    });

    expect(mockUserRepo.clearRefreshToken).toHaveBeenCalledWith(user._id);
  });
});

// ─── AuthService — resendPasswordReset ─────────────────────────────

describe('AuthService — resendPasswordReset', () => {
  let authService;
  let mockUserRepo;
  let mockTokenService;
  let mockEmailService;
  let mockVerificationTokenRepo;

  beforeEach(() => {
    mockUserRepo = {
      findByEmail: jest.fn(),
    };
    mockTokenService = {};
    mockEmailService = {
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };
    mockVerificationTokenRepo = {
      invalidateAll: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    };

    authService = new AuthService(mockUserRepo, mockTokenService, mockEmailService, mockVerificationTokenRepo, null);
  });

  test('generates new OTP for existing verified user', async () => {
    const user = createMockUser({ isEmailVerified: true });
    mockUserRepo.findByEmail.mockResolvedValue(user);

    const result = await authService.resendPasswordReset({ email: 'test@example.com' });

    expect(result.message).toBe('If this email is registered, a new password reset code has been sent.');
    expect(mockVerificationTokenRepo.invalidateAll).toHaveBeenCalledWith({
      userId: user._id,
      purpose: 'password_reset',
    });
    expect(mockVerificationTokenRepo.create).toHaveBeenCalledTimes(1);
    expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  test('returns generic message for non-existent email', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);

    const result = await authService.resendPasswordReset({ email: 'unknown@example.com' });

    expect(result.message).toBe('If this email is registered, a new password reset code has been sent.');
    expect(mockVerificationTokenRepo.invalidateAll).not.toHaveBeenCalled();
    expect(mockVerificationTokenRepo.create).not.toHaveBeenCalled();
  });

  test('returns generic message for unverified user', async () => {
    const user = createMockUser({ isEmailVerified: false });
    mockUserRepo.findByEmail.mockResolvedValue(user);

    const result = await authService.resendPasswordReset({ email: 'test@example.com' });

    expect(result.message).toBe('If this email is registered, a new password reset code has been sent.');
    expect(mockVerificationTokenRepo.invalidateAll).not.toHaveBeenCalled();
    expect(mockVerificationTokenRepo.create).not.toHaveBeenCalled();
  });

  test('old OTP becomes invalid after resend', async () => {
    const user = createMockUser({ isEmailVerified: true });
    mockUserRepo.findByEmail.mockResolvedValue(user);

    await authService.resendPasswordReset({ email: 'test@example.com' });

    expect(mockVerificationTokenRepo.invalidateAll).toHaveBeenCalledWith({
      userId: user._id,
      purpose: 'password_reset',
    });
  });

  test('OTP is hashed before storage', async () => {
    const user = createMockUser({ isEmailVerified: true });
    mockUserRepo.findByEmail.mockResolvedValue(user);

    await authService.resendPasswordReset({ email: 'test@example.com' });

    const storedToken = mockVerificationTokenRepo.create.mock.calls[0][0].token;
    expect(storedToken).toMatch(/^\$2b\$/);
  });

  test('does not return OTP in response', async () => {
    const user = createMockUser({ isEmailVerified: true });
    mockUserRepo.findByEmail.mockResolvedValue(user);

    const result = await authService.resendPasswordReset({ email: 'test@example.com' });

    expect(result.otp).toBeUndefined();
    expect(result.code).toBeUndefined();
  });

  test('does not throw if email sending fails', async () => {
    const user = createMockUser({ isEmailVerified: true });
    mockUserRepo.findByEmail.mockResolvedValue(user);
    mockEmailService.sendPasswordResetEmail.mockRejectedValue(new Error('Email API down'));

    await expect(
      authService.resendPasswordReset({ email: 'test@example.com' })
    ).resolves.toEqual({ message: 'If this email is registered, a new password reset code has been sent.' });
  });
});

// ─── Integration: forgot → resend → reset ──────────────────────────

describe('Password Reset Integration', () => {
  let authService;
  let mockUserRepo;
  let mockTokenService;
  let mockEmailService;
  let mockVerificationTokenRepo;

  beforeEach(() => {
    mockUserRepo = {
      findByEmail: jest.fn(),
      findByEmailWithPassword: jest.fn(),
      updatePassword: jest.fn().mockResolvedValue({}),
      clearRefreshToken: jest.fn().mockResolvedValue({}),
    };
    mockTokenService = {};
    mockEmailService = {
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };
    mockVerificationTokenRepo = {
      findActive: jest.fn(),
      incrementAttempts: jest.fn(),
      markUsed: jest.fn().mockResolvedValue({}),
      invalidateAll: jest.fn().mockResolvedValue({}),
      create: jest.fn(),
    };

    authService = new AuthService(mockUserRepo, mockTokenService, mockEmailService, mockVerificationTokenRepo, null);
  });

  test('forgot → reset with correct code → success', async () => {
    const user = createMockUser({ isEmailVerified: true });
    const hashedOtp = await bcrypt.hash('123456', 12);
    const token = createMockToken({ token: hashedOtp, attempts: 0 });

    // forgotPassword
    mockUserRepo.findByEmail.mockResolvedValue(user);
    mockVerificationTokenRepo.invalidateAll.mockResolvedValue({});
    mockVerificationTokenRepo.create.mockResolvedValue({});
    mockEmailService.sendPasswordResetEmail.mockResolvedValue(undefined);

    await authService.forgotPassword({ email: 'test@example.com' });

    // resetPassword
    mockVerificationTokenRepo.findActive.mockResolvedValue(token);

    const result = await authService.resetPassword({
      email: 'test@example.com',
      code: '123456',
      newPassword: 'newpassword123',
    });

    expect(result.message).toBe('Password has been reset successfully. Please sign in with your new password.');
    expect(mockUserRepo.updatePassword).toHaveBeenCalledTimes(1);
    expect(mockVerificationTokenRepo.markUsed).toHaveBeenCalledTimes(1);
    expect(mockUserRepo.clearRefreshToken).toHaveBeenCalledTimes(1);
  });

  test('forgot → resend → old OTP fails → new OTP succeeds', async () => {
    const user = createMockUser({ isEmailVerified: true });
    const originalOtp = await bcrypt.hash('111111', 12);
    const originalToken = createMockToken({ token: originalOtp, attempts: 0 });
    const newOtp = await bcrypt.hash('222222', 12);
    const newToken = createMockToken({ token: newOtp, attempts: 0 });

    // forgotPassword — creates original OTP
    mockUserRepo.findByEmail.mockResolvedValue(user);
    mockVerificationTokenRepo.invalidateAll.mockResolvedValue({});
    mockVerificationTokenRepo.create.mockResolvedValue(originalToken);
    mockEmailService.sendPasswordResetEmail.mockResolvedValue(undefined);

    await authService.forgotPassword({ email: 'test@example.com' });

    // resendPasswordReset — invalidates original, creates new
    mockVerificationTokenRepo.invalidateAll.mockResolvedValue({});
    mockVerificationTokenRepo.create.mockResolvedValue(newToken);

    await authService.resendPasswordReset({ email: 'test@example.com' });

    // Try old OTP — findActive returns new token, so old OTP fails
    mockVerificationTokenRepo.findActive.mockResolvedValue(newToken);
    mockVerificationTokenRepo.incrementAttempts.mockResolvedValue({ ...newToken, attempts: 1 });

    await expect(
      authService.resetPassword({
        email: 'test@example.com',
        code: '111111',
        newPassword: 'newpassword123',
      })
    ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));

    // Now try new OTP — should succeed
    mockVerificationTokenRepo.findActive.mockResolvedValue(newToken);

    const result = await authService.resetPassword({
      email: 'test@example.com',
      code: '222222',
      newPassword: 'newpassword123',
    });

    expect(result.message).toBe('Password has been reset successfully. Please sign in with your new password.');
  });

  test('existing session is invalidated after password reset', async () => {
    const user = createMockUser({ isEmailVerified: true });
    const hashedOtp = await bcrypt.hash('123456', 12);
    const token = createMockToken({ token: hashedOtp, attempts: 0 });

    mockUserRepo.findByEmail.mockResolvedValue(user);
    mockVerificationTokenRepo.findActive.mockResolvedValue(token);

    await authService.resetPassword({
      email: 'test@example.com',
      code: '123456',
      newPassword: 'newpassword123',
    });

    expect(mockUserRepo.clearRefreshToken).toHaveBeenCalledWith(user._id);
  });
});
