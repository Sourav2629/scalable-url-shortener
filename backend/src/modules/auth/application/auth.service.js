const crypto = require('crypto');
const bcrypt = require('bcrypt');
const AppError = require('../../../shared/errors/app-error');

const PASSWORD_SALT_ROUNDS = 12;
const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 15;
const OTP_MAX_ATTEMPTS = 5;
const PENDING_REGISTRATION_EXPIRY_MINUTES = 60;

function serializeUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function generateOtp() {
  const min = Math.pow(10, OTP_LENGTH - 1);
  const max = Math.pow(10, OTP_LENGTH) - 1;
  return crypto.randomInt(min, max + 1).toString();
}

function getOtpExpiryDate() {
  return new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
}

function getPendingRegistrationExpiryDate() {
  return new Date(Date.now() + PENDING_REGISTRATION_EXPIRY_MINUTES * 60 * 1000);
}

class AuthService {
  constructor(userRepository, tokenService, emailService, verificationTokenRepository, pendingRegistrationRepository) {
    this.userRepository = userRepository;
    this.tokenService = tokenService;
    this.emailService = emailService || null;
    this.verificationTokenRepository = verificationTokenRepository || null;
    this.pendingRegistrationRepository = pendingRegistrationRepository || null;
  }

  async register({ name, email, password }) {
    // Check if a verified User already exists
    const existingUser = await this.userRepository.findByEmail(email);

    if (existingUser && existingUser.isEmailVerified) {
      throw new AppError('An account with this email already exists.', 409);
    }

    // If a legacy unverified User exists, we need to handle it
    // For now, treat it like a pending registration and resend OTP
    if (existingUser && !existingUser.isEmailVerified) {
      // Delete the legacy unverified User — it will be recreated on verification
      // Actually, keep it for backward compatibility and just resend OTP
      // The verify-email flow will set isEmailVerified=true on this existing User
      await this._sendOtpForUser(existingUser, name, email, password);
      return {
        message: 'A verification code has been sent to your email.',
        email,
      };
    }

    // No verified User exists — create/update PendingRegistration
    if (!this.pendingRegistrationRepository) {
      throw new AppError('Registration service is not available.', 503);
    }

    const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);

    await this.pendingRegistrationRepository.upsert({
      name: name.trim(),
      email,
      passwordHash,
      expiresAt: getPendingRegistrationExpiryDate(),
    });

    // Generate and send OTP
    await this._sendOtpForPendingRegistration(email, name);

    return {
      message: 'Account created. Please verify your email.',
      email,
    };
  }

  async login({ email, password }) {
    const user = await this.userRepository.findByEmailWithPassword(email);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new AppError('Invalid email or password.', 401);
    }

    // Defense-in-depth: reject unverified users
    // (Users should only exist after verification, but check anyway)
    if (!user.isEmailVerified) {
      const appError = new AppError('Please verify your email before signing in.', 403);
      appError.code = 'EMAIL_NOT_VERIFIED';
      appError.email = user.email;
      throw appError;
    }

    return this.createAuthenticationResponse(user);
  }

  async logout(userId) {
    await this.userRepository.clearRefreshToken(userId);
  }

  async getCurrentUser(userId) {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new AppError('Authentication is required.', 401);
    }

    return serializeUser(user);
  }

  async verifyEmail({ email, code }) {
    // Strategy: check for PendingRegistration first, then legacy unverified User

    // 1. Try PendingRegistration path
    if (this.pendingRegistrationRepository) {
      const pending = await this.pendingRegistrationRepository.findByEmail(email);

      if (pending) {
        return this._verifyPendingRegistration(pending, code);
      }
    }

    // 2. Try legacy unverified User path (backward compatibility)
    const legacyUser = await this.userRepository.findByEmail(email);

    if (!legacyUser) {
      throw new AppError('No pending verification found. Please register again.', 400);
    }

    if (legacyUser.isEmailVerified) {
      throw new AppError('Email is already verified.', 400);
    }

    return this._verifyLegacyUser(legacyUser, code);
  }

  async _verifyPendingRegistration(pending, code) {
    if (!this.verificationTokenRepository) {
      throw new AppError('Verification service is not available.', 503);
    }

    // Check if pending registration has expired
    if (pending.expiresAt < new Date()) {
      throw new AppError('Registration has expired. Please register again.', 400);
    }

    // Find active verification token
    const token = await this.verificationTokenRepository.findActive({
      userId: pending._id,
      purpose: 'email_verification',
    });

    if (!token) {
      throw new AppError('No pending verification found. Please register again.', 400);
    }

    if (token.attempts >= token.maxAttempts) {
      throw new AppError('Too many failed attempts. Please register again.', 400);
    }

    // Validate OTP
    const isValid = await bcrypt.compare(code, token.token);

    if (!isValid) {
      const updatedToken = await this.verificationTokenRepository.incrementAttempts(token._id);
      const remaining = Math.max(0, updatedToken.maxAttempts - updatedToken.attempts);

      if (remaining === 0) {
        throw new AppError('Too many failed attempts. Please register again.', 400);
      }

      throw new AppError(
        `Invalid verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
        400,
      );
    }

    // OTP is valid — create the real User
    let user;
    try {
      user = await this.userRepository.create({
        name: pending.name,
        email: pending.email,
        password: pending.passwordHash,
        isEmailVerified: true,
      });
    } catch (error) {
      if (error.code === 11000) {
        // Race condition: User was created by another request
        // Find the existing user and proceed
        user = await this.userRepository.findByEmail(pending.email);
        if (!user || !user.isEmailVerified) {
          throw new AppError('Verification failed. Please try again.', 500);
        }
      } else {
        throw error;
      }
    }

    // Mark verification token as used
    await this.verificationTokenRepository.markUsed(token._id);

    // Delete the pending registration
    await this.pendingRegistrationRepository.deleteByEmail(pending.email);

    // Issue authentication tokens
    return this.createAuthenticationResponse(user);
  }

  async _verifyLegacyUser(user, code) {
    if (!this.verificationTokenRepository) {
      throw new AppError('Verification service is not available.', 503);
    }

    const token = await this.verificationTokenRepository.findActive({
      userId: user._id,
      purpose: 'email_verification',
    });

    if (!token) {
      throw new AppError('No pending verification found. Please register again.', 400);
    }

    if (token.attempts >= token.maxAttempts) {
      throw new AppError('Too many failed attempts. Please register again.', 400);
    }

    const isValid = await bcrypt.compare(code, token.token);

    if (!isValid) {
      const updatedToken = await this.verificationTokenRepository.incrementAttempts(token._id);
      const remaining = Math.max(0, updatedToken.maxAttempts - updatedToken.attempts);

      if (remaining === 0) {
        throw new AppError('Too many failed attempts. Please register again.', 400);
      }

      throw new AppError(
        `Invalid verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
        400,
      );
    }

    // OTP is valid — mark user as verified
    const updatedUser = await this.userRepository.markEmailVerified(user._id);

    if (!updatedUser) {
      throw new AppError('Verification failed. Please try again.', 500);
    }

    await this.verificationTokenRepository.markUsed(token._id);

    return this.createAuthenticationResponse(updatedUser);
  }

  async resendVerification({ email }) {
    // Check PendingRegistration first
    if (this.pendingRegistrationRepository) {
      const pending = await this.pendingRegistrationRepository.findByEmail(email);

      if (pending) {
        await this._sendOtpForPendingRegistration(email, pending.name);
        return { message: 'If this email is registered, a new verification code has been sent.' };
      }
    }

    // Check legacy unverified User
    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      return { message: 'If this email is registered, a new verification code has been sent.' };
    }

    if (user.isEmailVerified) {
      return { message: 'Email is already verified.' };
    }

    await this._sendOtpForUser(user, user.name, user.email, null);

    return { message: 'If this email is registered, a new verification code has been sent.' };
  }

  async _sendOtpForPendingRegistration(email, name) {
    if (!this.verificationTokenRepository || !this.emailService) {
      return;
    }

    // Get the pending registration to find its ID for the token
    const pending = await this.pendingRegistrationRepository.findByEmail(email);
    if (!pending) return;

    // Invalidate previous tokens
    await this.verificationTokenRepository.invalidateAll({
      userId: pending._id,
      purpose: 'email_verification',
    });

    // Generate new OTP
    const plaintextOtp = generateOtp();
    const hashedOtp = await bcrypt.hash(plaintextOtp, PASSWORD_SALT_ROUNDS);

    await this.verificationTokenRepository.create({
      userId: pending._id,
      token: hashedOtp,
      purpose: 'email_verification',
      expiresAt: getOtpExpiryDate(),
      maxAttempts: OTP_MAX_ATTEMPTS,
    });

    // Send email
    try {
      await this.emailService.sendVerificationEmail(email, {
        name,
        verificationCode: plaintextOtp,
      });
    } catch (_error) {
      // Email failure is non-fatal
    }
  }

  async _sendOtpForUser(user, name, email, newPassword) {
    if (!this.verificationTokenRepository || !this.emailService) {
      return;
    }

    // If a new password was provided during re-registration, update it
    if (newPassword) {
      const passwordHash = await bcrypt.hash(newPassword, PASSWORD_SALT_ROUNDS);
      await this.userRepository.updatePassword(user._id, passwordHash);
    }

    // Invalidate previous tokens
    await this.verificationTokenRepository.invalidateAll({
      userId: user._id,
      purpose: 'email_verification',
    });

    // Generate new OTP
    const plaintextOtp = generateOtp();
    const hashedOtp = await bcrypt.hash(plaintextOtp, PASSWORD_SALT_ROUNDS);

    await this.verificationTokenRepository.create({
      userId: user._id,
      token: hashedOtp,
      purpose: 'email_verification',
      expiresAt: getOtpExpiryDate(),
      maxAttempts: OTP_MAX_ATTEMPTS,
    });

    // Send email
    try {
      await this.emailService.sendVerificationEmail(email, {
        name,
        verificationCode: plaintextOtp,
      });
    } catch (_error) {
      // Email failure is non-fatal
    }
  }

  // ─── Forgot Password / Reset Password ───────────────────────────

  async forgotPassword({ email }) {
    const user = await this.userRepository.findByEmail(email);

    // If user does not exist or is not verified, return the same generic response.
    // Never reveal whether the account exists or its verification status.
    if (!user || !user.isEmailVerified) {
      return {
        message: 'If this email is registered, a password reset code has been sent.',
      };
    }

    // Invalidate any existing password-reset tokens for this user
    await this.verificationTokenRepository.invalidateAll({
      userId: user._id,
      purpose: 'password_reset',
    });

    // Generate and send new OTP
    const plaintextOtp = generateOtp();
    const hashedOtp = await bcrypt.hash(plaintextOtp, PASSWORD_SALT_ROUNDS);

    await this.verificationTokenRepository.create({
      userId: user._id,
      token: hashedOtp,
      purpose: 'password_reset',
      expiresAt: getOtpExpiryDate(),
      maxAttempts: OTP_MAX_ATTEMPTS,
    });

    // Send email (non-fatal)
    try {
      await this.emailService.sendPasswordResetEmail(user.email, {
        name: user.name,
        resetCode: plaintextOtp,
      });
    } catch (_error) {
      // Email failure is non-fatal
    }

    return {
      message: 'If this email is registered, a password reset code has been sent.',
    };
  }

  async resetPassword({ email, code, newPassword }) {
    if (!this.verificationTokenRepository) {
      throw new AppError('Password reset service is not available.', 503);
    }

    // Find the user
    const user = await this.userRepository.findByEmail(email);

    // If user does not exist, return generic error — never reveal account existence
    if (!user) {
      throw new AppError('Invalid or expired reset code. Please request a new one.', 400);
    }

    if (!user.isEmailVerified) {
      throw new AppError('Invalid or expired reset code. Please request a new one.', 400);
    }

    // Find active password-reset token
    const token = await this.verificationTokenRepository.findActive({
      userId: user._id,
      purpose: 'password_reset',
    });

    if (!token) {
      throw new AppError('No pending password reset found. Please request a new code.', 400);
    }

    if (token.attempts >= token.maxAttempts) {
      throw new AppError('Too many failed attempts. Please request a new code.', 400);
    }

    // Validate OTP
    const isValid = await bcrypt.compare(code, token.token);

    if (!isValid) {
      const updatedToken = await this.verificationTokenRepository.incrementAttempts(token._id);
      const remaining = Math.max(0, updatedToken.maxAttempts - updatedToken.attempts);

      if (remaining === 0) {
        throw new AppError('Too many failed attempts. Please request a new code.', 400);
      }

      throw new AppError(
        `Invalid reset code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
        400,
      );
    }

    // OTP is valid — update the password
    const passwordHash = await bcrypt.hash(newPassword, PASSWORD_SALT_ROUNDS);
    await this.userRepository.updatePassword(user._id, passwordHash);

    // Mark the token as used
    await this.verificationTokenRepository.markUsed(token._id);

    // Invalidate any other password-reset tokens for this user
    await this.verificationTokenRepository.invalidateAll({
      userId: user._id,
      purpose: 'password_reset',
    });

    // Invalidate existing session/refresh token
    await this.userRepository.clearRefreshToken(user._id);

    return {
      message: 'Password has been reset successfully. Please sign in with your new password.',
    };
  }

  async resendPasswordReset({ email }) {
    const user = await this.userRepository.findByEmail(email);

    // If user does not exist or is not verified, return same generic response
    if (!user || !user.isEmailVerified) {
      return {
        message: 'If this email is registered, a new password reset code has been sent.',
      };
    }

    // Invalidate previous password-reset tokens
    await this.verificationTokenRepository.invalidateAll({
      userId: user._id,
      purpose: 'password_reset',
    });

    // Generate and send new OTP
    const plaintextOtp = generateOtp();
    const hashedOtp = await bcrypt.hash(plaintextOtp, PASSWORD_SALT_ROUNDS);

    await this.verificationTokenRepository.create({
      userId: user._id,
      token: hashedOtp,
      purpose: 'password_reset',
      expiresAt: getOtpExpiryDate(),
      maxAttempts: OTP_MAX_ATTEMPTS,
    });

    // Send email (non-fatal)
    try {
      await this.emailService.sendPasswordResetEmail(user.email, {
        name: user.name,
        resetCode: plaintextOtp,
      });
    } catch (_error) {
      // Email failure is non-fatal
    }

    return {
      message: 'If this email is registered, a new password reset code has been sent.',
    };
  }

  async createAuthenticationResponse(user) {
    const accessToken = this.tokenService.generateAccessToken(user._id);
    const refreshToken = this.tokenService.generateRefreshToken(user._id);
    const refreshTokenHash = await bcrypt.hash(refreshToken, PASSWORD_SALT_ROUNDS);

    await this.userRepository.updateRefreshToken(user._id, refreshTokenHash);

    return {
      user: serializeUser(user),
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }
}

module.exports = AuthService;
