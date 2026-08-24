const bcrypt = require('bcrypt');
const { validateUpdateProfile, validateChangePassword, validateDeleteAccount } = require('../src/modules/auth/presentation/validators/profile.validator');
const AuthService = require('../src/modules/auth/application/auth.service');

const PASSWORD_SALT_ROUNDS = 12;

// ─── Validators ─────────────────────────────────────────────────

describe('Profile Validators', () => {
  describe('validateUpdateProfile', () => {
    test('accepts valid name', () => {
      const req = { body: { name: 'John Doe' } };
      const next = jest.fn();
      validateUpdateProfile(req, {}, next);
      expect(req.body.name).toBe('John Doe');
      expect(next).toHaveBeenCalledWith();
    });

    test('trims whitespace from name', () => {
      const req = { body: { name: '  Jane Doe  ' } };
      const next = jest.fn();
      validateUpdateProfile(req, {}, next);
      expect(req.body.name).toBe('Jane Doe');
    });

    test('rejects empty name', () => {
      const req = { body: { name: '' } };
      const next = jest.fn();
      validateUpdateProfile(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects whitespace-only name', () => {
      const req = { body: { name: '   ' } };
      const next = jest.fn();
      validateUpdateProfile(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects name exceeding 100 characters', () => {
      const req = { body: { name: 'A'.repeat(101) } };
      const next = jest.fn();
      validateUpdateProfile(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('accepts name at exactly 100 characters', () => {
      const req = { body: { name: 'A'.repeat(100) } };
      const next = jest.fn();
      validateUpdateProfile(req, {}, next);
      expect(next).toHaveBeenCalledWith();
    });

    test('strips extra fields — only name is kept', () => {
      const req = { body: { name: 'Test', email: 'hacked@test.com', password: 'secret' } };
      const next = jest.fn();
      validateUpdateProfile(req, {}, next);
      expect(req.body).toEqual({ name: 'Test' });
    });

    test('rejects missing body', () => {
      const req = { body: undefined };
      const next = jest.fn();
      validateUpdateProfile(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });
  });

  describe('validateChangePassword', () => {
    test('accepts valid input', () => {
      const req = { body: { currentPassword: 'oldpass1', newPassword: 'newpass123' } };
      const next = jest.fn();
      validateChangePassword(req, {}, next);
      expect(next).toHaveBeenCalledWith();
    });

    test('rejects missing currentPassword', () => {
      const req = { body: { newPassword: 'newpass123' } };
      const next = jest.fn();
      validateChangePassword(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects empty currentPassword', () => {
      const req = { body: { currentPassword: '', newPassword: 'newpass123' } };
      const next = jest.fn();
      validateChangePassword(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects short newPassword', () => {
      const req = { body: { currentPassword: 'oldpass1', newPassword: 'short' } };
      const next = jest.fn();
      validateChangePassword(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects missing newPassword', () => {
      const req = { body: { currentPassword: 'oldpass1' } };
      const next = jest.fn();
      validateChangePassword(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });
  });

  describe('validateDeleteAccount', () => {
    test('accepts valid password', () => {
      const req = { body: { password: 'mypassword' } };
      const next = jest.fn();
      validateDeleteAccount(req, {}, next);
      expect(next).toHaveBeenCalledWith();
    });

    test('rejects missing password', () => {
      const req = { body: {} };
      const next = jest.fn();
      validateDeleteAccount(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects empty password', () => {
      const req = { body: { password: '' } };
      const next = jest.fn();
      validateDeleteAccount(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });
  });
});

// ─── AuthService ────────────────────────────────────────────────

describe('AuthService — Profile Management', () => {
  let authService;
  let mockUserRepo;
  let mockUrlRepo;
  let mockAnalyticsRepo;
  let mockVerificationTokenRepo;
  let mockPendingRegistrationRepo;

  beforeEach(() => {
    mockUserRepo = {
      findById: jest.fn(),
      findByIdWithPassword: jest.fn(),
      updateById: jest.fn(),
      updatePassword: jest.fn(),
      clearRefreshToken: jest.fn(),
      deleteById: jest.fn(),
    };
    mockUrlRepo = {
      findIdsByOwner: jest.fn().mockResolvedValue([]),
      hardDeleteByOwner: jest.fn(),
    };
    mockAnalyticsRepo = {
      deleteByUser: jest.fn(),
      deleteByUrls: jest.fn(),
    };
    mockVerificationTokenRepo = {
      deleteByUser: jest.fn(),
    };
    mockPendingRegistrationRepo = {
      deleteByEmail: jest.fn(),
    };

    authService = new AuthService(
      mockUserRepo, null, null,
      mockVerificationTokenRepo, mockPendingRegistrationRepo,
      mockUrlRepo, mockAnalyticsRepo,
    );
  });

  describe('updateProfile', () => {
    test('updates name and returns serialized user', async () => {
      const updatedUser = {
        _id: 'user1', name: 'New Name', email: 'test@test.com',
        isEmailVerified: true, createdAt: new Date(), updatedAt: new Date(),
      };
      mockUserRepo.updateById.mockResolvedValue(updatedUser);

      const result = await authService.updateProfile('user1', { name: 'New Name' });

      expect(mockUserRepo.updateById).toHaveBeenCalledWith('user1', { name: 'New Name' });
      expect(result.name).toBe('New Name');
      expect(result.email).toBe('test@test.com');
    });

    test('throws 404 if user not found', async () => {
      mockUserRepo.updateById.mockResolvedValue(null);

      await expect(
        authService.updateProfile('user1', { name: 'New Name' }),
      ).rejects.toThrow(expect.objectContaining({ statusCode: 404 }));
    });

    test('does not allow email update through profile', async () => {
      const updatedUser = {
        _id: 'user1', name: 'New Name', email: 'test@test.com',
        isEmailVerified: true, createdAt: new Date(), updatedAt: new Date(),
      };
      mockUserRepo.updateById.mockResolvedValue(updatedUser);

      await authService.updateProfile('user1', { name: 'New Name', email: 'hacked@test.com' });

      // updateById should only receive { name } because validator strips extra fields
      expect(mockUserRepo.updateById).toHaveBeenCalledWith('user1', { name: 'New Name' });
    });
  });

  describe('changePassword', () => {
    test('changes password with valid current password', async () => {
      const hashedPassword = await bcrypt.hash('oldpass123', PASSWORD_SALT_ROUNDS);
      mockUserRepo.findByIdWithPassword.mockResolvedValue({
        _id: 'user1', password: hashedPassword,
      });
      mockUserRepo.updatePassword.mockResolvedValue({});
      mockUserRepo.clearRefreshToken.mockResolvedValue({});

      const result = await authService.changePassword('user1', {
        currentPassword: 'oldpass123',
        newPassword: 'newpass456',
      });

      expect(mockUserRepo.updatePassword).toHaveBeenCalled();
      expect(mockUserRepo.clearRefreshToken).toHaveBeenCalledWith('user1');
      expect(result.message).toContain('Password changed');
    });

    test('rejects wrong current password', async () => {
      const hashedPassword = await bcrypt.hash('oldpass123', PASSWORD_SALT_ROUNDS);
      mockUserRepo.findByIdWithPassword.mockResolvedValue({
        _id: 'user1', password: hashedPassword,
      });

      await expect(
        authService.changePassword('user1', {
          currentPassword: 'wrongpass',
          newPassword: 'newpass456',
        }),
      ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));

      expect(mockUserRepo.updatePassword).not.toHaveBeenCalled();
    });

    test('throws 404 if user not found', async () => {
      mockUserRepo.findByIdWithPassword.mockResolvedValue(null);

      await expect(
        authService.changePassword('user1', {
          currentPassword: 'oldpass123',
          newPassword: 'newpass456',
        }),
      ).rejects.toThrow(expect.objectContaining({ statusCode: 404 }));
    });

    test('does not return password in response', async () => {
      const hashedPassword = await bcrypt.hash('oldpass123', PASSWORD_SALT_ROUNDS);
      mockUserRepo.findByIdWithPassword.mockResolvedValue({
        _id: 'user1', password: hashedPassword,
      });
      mockUserRepo.updatePassword.mockResolvedValue({});
      mockUserRepo.clearRefreshToken.mockResolvedValue({});

      const result = await authService.changePassword('user1', {
        currentPassword: 'oldpass123',
        newPassword: 'newpass456',
      });

      expect(result.password).toBeUndefined();
      expect(result.passwordHash).toBeUndefined();
    });

    test('old password no longer works after change', async () => {
      const oldHash = await bcrypt.hash('oldpass123', PASSWORD_SALT_ROUNDS);
      mockUserRepo.findByIdWithPassword.mockResolvedValue({
        _id: 'user1', password: oldHash,
      });

      // Simulate: after change, the new hash is stored
      let storedHash = oldHash;
      mockUserRepo.updatePassword.mockImplementation(async (id, newHash) => {
        storedHash = newHash;
        return {};
      });
      mockUserRepo.clearRefreshToken.mockResolvedValue({});

      await authService.changePassword('user1', {
        currentPassword: 'oldpass123',
        newPassword: 'newpass456',
      });

      // Now try to change again with old password — should fail
      mockUserRepo.findByIdWithPassword.mockResolvedValue({
        _id: 'user1', password: storedHash,
      });

      await expect(
        authService.changePassword('user1', {
          currentPassword: 'oldpass123',
          newPassword: 'anotherpass789',
        }),
      ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
    });
  });

  describe('deleteAccount', () => {
    test('deletes account with valid password', async () => {
      const hashedPassword = await bcrypt.hash('mypassword', PASSWORD_SALT_ROUNDS);
      mockUserRepo.findByIdWithPassword.mockResolvedValue({
        _id: 'user1', email: 'test@test.com', password: hashedPassword,
      });
      mockAnalyticsRepo.deleteByUser.mockResolvedValue({});
      mockUrlRepo.findIdsByOwner.mockResolvedValue([]);
      mockUrlRepo.hardDeleteByOwner.mockResolvedValue({});
      mockVerificationTokenRepo.deleteByUser.mockResolvedValue({});
      mockPendingRegistrationRepo.deleteByEmail.mockResolvedValue({});
      mockUserRepo.deleteById.mockResolvedValue({});

      const result = await authService.deleteAccount('user1', { password: 'mypassword' });

      expect(mockAnalyticsRepo.deleteByUser).toHaveBeenCalledWith('user1');
      expect(mockUrlRepo.hardDeleteByOwner).toHaveBeenCalledWith('user1');
      expect(mockVerificationTokenRepo.deleteByUser).toHaveBeenCalledWith('user1');
      expect(mockPendingRegistrationRepo.deleteByEmail).toHaveBeenCalledWith('test@test.com');
      expect(mockUserRepo.deleteById).toHaveBeenCalledWith('user1');
      expect(result.message).toContain('permanently deleted');
    });

    test('does NOT delete with wrong password', async () => {
      const hashedPassword = await bcrypt.hash('mypassword', PASSWORD_SALT_ROUNDS);
      mockUserRepo.findByIdWithPassword.mockResolvedValue({
        _id: 'user1', email: 'test@test.com', password: hashedPassword,
      });

      await expect(
        authService.deleteAccount('user1', { password: 'wrongpassword' }),
      ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));

      expect(mockUserRepo.deleteById).not.toHaveBeenCalled();
      expect(mockUrlRepo.hardDeleteByOwner).not.toHaveBeenCalled();
    });

    test('throws 404 if user not found', async () => {
      mockUserRepo.findByIdWithPassword.mockResolvedValue(null);

      await expect(
        authService.deleteAccount('user1', { password: 'mypassword' }),
      ).rejects.toThrow(expect.objectContaining({ statusCode: 404 }));
    });

    test('deletes user links and frees aliases', async () => {
      const hashedPassword = await bcrypt.hash('mypassword', PASSWORD_SALT_ROUNDS);
      mockUserRepo.findByIdWithPassword.mockResolvedValue({
        _id: 'user1', email: 'test@test.com', password: hashedPassword,
      });
      mockAnalyticsRepo.deleteByUser.mockResolvedValue({});
      mockUrlRepo.findIdsByOwner.mockResolvedValue([
        { _id: 'url1' }, { _id: 'url2' },
      ]);
      mockAnalyticsRepo.deleteByUrls.mockResolvedValue({});
      mockUrlRepo.hardDeleteByOwner.mockResolvedValue({});
      mockVerificationTokenRepo.deleteByUser.mockResolvedValue({});
      mockPendingRegistrationRepo.deleteByEmail.mockResolvedValue({});
      mockUserRepo.deleteById.mockResolvedValue({});

      await authService.deleteAccount('user1', { password: 'mypassword' });

      expect(mockAnalyticsRepo.deleteByUrls).toHaveBeenCalledWith(['url1', 'url2']);
      expect(mockUrlRepo.hardDeleteByOwner).toHaveBeenCalledWith('user1');
      expect(mockUserRepo.deleteById).toHaveBeenCalledWith('user1');
    });

    test('handles user with zero links', async () => {
      const hashedPassword = await bcrypt.hash('mypassword', PASSWORD_SALT_ROUNDS);
      mockUserRepo.findByIdWithPassword.mockResolvedValue({
        _id: 'user1', email: 'test@test.com', password: hashedPassword,
      });
      mockAnalyticsRepo.deleteByUser.mockResolvedValue({});
      mockUrlRepo.findIdsByOwner.mockResolvedValue([]);
      mockUrlRepo.hardDeleteByOwner.mockResolvedValue({});
      mockVerificationTokenRepo.deleteByUser.mockResolvedValue({});
      mockPendingRegistrationRepo.deleteByEmail.mockResolvedValue({});
      mockUserRepo.deleteById.mockResolvedValue({});

      const result = await authService.deleteAccount('user1', { password: 'mypassword' });

      expect(mockAnalyticsRepo.deleteByUrls).not.toHaveBeenCalled();
      expect(mockUrlRepo.hardDeleteByOwner).toHaveBeenCalledWith('user1');
      expect(result.message).toContain('permanently deleted');
    });

    test('does not return password or sensitive data', async () => {
      const hashedPassword = await bcrypt.hash('mypassword', PASSWORD_SALT_ROUNDS);
      mockUserRepo.findByIdWithPassword.mockResolvedValue({
        _id: 'user1', email: 'test@test.com', password: hashedPassword,
      });
      mockAnalyticsRepo.deleteByUser.mockResolvedValue({});
      mockUrlRepo.findIdsByOwner.mockResolvedValue([]);
      mockUrlRepo.hardDeleteByOwner.mockResolvedValue({});
      mockVerificationTokenRepo.deleteByUser.mockResolvedValue({});
      mockPendingRegistrationRepo.deleteByEmail.mockResolvedValue({});
      mockUserRepo.deleteById.mockResolvedValue({});

      const result = await authService.deleteAccount('user1', { password: 'mypassword' });

      expect(result.password).toBeUndefined();
      expect(result.refreshToken).toBeUndefined();
    });
  });
});

// ─── Regression: passwordChangedAt ────────────────────────────────

describe('passwordChangedAt', () => {
  let authService;
  let mockUserRepo;
  let mockUrlRepo;
  let mockAnalyticsRepo;
  let mockVerificationTokenRepo;
  let mockPendingRegistrationRepo;

  beforeEach(() => {
    mockUserRepo = {
      findById: jest.fn(),
      findByIdWithPassword: jest.fn(),
      updateById: jest.fn(),
      updatePassword: jest.fn(),
      clearRefreshToken: jest.fn(),
      deleteById: jest.fn(),
    };
    mockUrlRepo = {
      findIdsByOwner: jest.fn().mockResolvedValue([]),
      hardDeleteByOwner: jest.fn(),
    };
    mockAnalyticsRepo = {
      deleteByUser: jest.fn(),
      deleteByUrls: jest.fn(),
    };
    mockVerificationTokenRepo = {
      deleteByUser: jest.fn(),
    };
    mockPendingRegistrationRepo = {
      deleteByEmail: jest.fn(),
    };

    authService = new AuthService(
      mockUserRepo, null, null,
      mockVerificationTokenRepo, mockPendingRegistrationRepo,
      mockUrlRepo, mockAnalyticsRepo,
    );
  });

  test('changePassword calls updatePassword which sets passwordChangedAt', async () => {
    const hashedPassword = await bcrypt.hash('oldpass123', PASSWORD_SALT_ROUNDS);
    mockUserRepo.findByIdWithPassword.mockResolvedValue({
      _id: 'user1', password: hashedPassword,
    });
    mockUserRepo.updatePassword.mockResolvedValue({});
    mockUserRepo.clearRefreshToken.mockResolvedValue({});

    await authService.changePassword('user1', {
      currentPassword: 'oldpass123',
      newPassword: 'newpass456',
    });

    // updatePassword should have been called with the userId and a new password hash
    expect(mockUserRepo.updatePassword).toHaveBeenCalledTimes(1);
    const [calledId, calledHash] = mockUserRepo.updatePassword.mock.calls[0];
    expect(calledId).toBe('user1');
    expect(calledHash).toMatch(/^\$2b\$/);
  });

  test('updateProfile does NOT modify passwordChangedAt', async () => {
    const updatedUser = {
      _id: 'user1', name: 'New Name', email: 'test@test.com',
      isEmailVerified: true, createdAt: new Date(), updatedAt: new Date(),
    };
    mockUserRepo.updateById.mockResolvedValue(updatedUser);

    await authService.updateProfile('user1', { name: 'New Name' });

    // updateById should only receive { name } — no passwordChangedAt
    expect(mockUserRepo.updateById).toHaveBeenCalledWith('user1', { name: 'New Name' });
    expect(mockUserRepo.updatePassword).not.toHaveBeenCalled();
  });

  test('serialized user includes passwordChangedAt', async () => {
    mockUserRepo.findById.mockResolvedValue({
      _id: 'user1', name: 'Test', email: 'test@test.com',
      isEmailVerified: true, passwordChangedAt: new Date('2025-06-15'),
      createdAt: new Date(), updatedAt: new Date(),
    });

    const result = await authService.getCurrentUser('user1');

    expect(result.passwordChangedAt).toEqual(new Date('2025-06-15'));
  });

  test('serialized user includes passwordChangedAt as null when not set', async () => {
    mockUserRepo.findById.mockResolvedValue({
      _id: 'user1', name: 'Test', email: 'test@test.com',
      isEmailVerified: true, passwordChangedAt: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const result = await authService.getCurrentUser('user1');

    expect(result.passwordChangedAt).toBeNull();
  });
});

// ─── Regression: deleted account forgot-password ──────────────────

describe('Deleted account forgot-password behavior', () => {
  let authService;
  let mockUserRepo;
  let mockEmailService;
  let mockVerificationTokenRepo;

  beforeEach(() => {
    mockUserRepo = {
      findByEmail: jest.fn(),
      updatePassword: jest.fn(),
      clearRefreshToken: jest.fn().mockResolvedValue({}),
    };
    mockEmailService = {
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };
    mockVerificationTokenRepo = {
      invalidateAll: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    };

    authService = new AuthService(mockUserRepo, null, mockEmailService, mockVerificationTokenRepo, null);
  });

  test('forgotPassword does NOT send OTP for deleted user (findByEmail returns null)', async () => {
    // After permanent deletion, findByEmail returns null
    mockUserRepo.findByEmail.mockResolvedValue(null);

    await expect(
      authService.forgotPassword({ email: 'deleted@example.com' })
    ).rejects.toThrow(expect.objectContaining({ statusCode: 404 }));

    expect(mockVerificationTokenRepo.invalidateAll).not.toHaveBeenCalled();
    expect(mockVerificationTokenRepo.create).not.toHaveBeenCalled();
    expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  test('forgotPassword does NOT send OTP for unverified user', async () => {
    mockUserRepo.findByEmail.mockResolvedValue({
      _id: 'user1', email: 'unverified@test.com', isEmailVerified: false,
    });

    await expect(
      authService.forgotPassword({ email: 'unverified@test.com' })
    ).rejects.toThrow(expect.objectContaining({ statusCode: 403 }));

    expect(mockVerificationTokenRepo.invalidateAll).not.toHaveBeenCalled();
    expect(mockVerificationTokenRepo.create).not.toHaveBeenCalled();
    expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  test('forgotPassword sends OTP for existing verified user', async () => {
    mockUserRepo.findByEmail.mockResolvedValue({
      _id: 'user1', email: 'active@test.com', isEmailVerified: true,
    });

    const result = await authService.forgotPassword({ email: 'active@test.com' });

    expect(result.message).toBe('If this email is registered, a password reset code has been sent.');
    expect(mockVerificationTokenRepo.invalidateAll).toHaveBeenCalledWith({
      userId: 'user1',
      purpose: 'password_reset',
    });
    expect(mockVerificationTokenRepo.create).toHaveBeenCalledTimes(1);
    expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  test('resendPasswordReset does NOT send OTP for deleted user', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);

    await expect(
      authService.resendPasswordReset({ email: 'deleted@example.com' })
    ).rejects.toThrow(expect.objectContaining({ statusCode: 404 }));

    expect(mockVerificationTokenRepo.invalidateAll).not.toHaveBeenCalled();
    expect(mockVerificationTokenRepo.create).not.toHaveBeenCalled();
    expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  test('resetPassword does NOT work for deleted user', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);

    await expect(
      authService.resetPassword({
        email: 'deleted@example.com',
        code: '123456',
        newPassword: 'newpassword123',
      }),
    ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));

    expect(mockUserRepo.updatePassword).not.toHaveBeenCalled();
  });
});
