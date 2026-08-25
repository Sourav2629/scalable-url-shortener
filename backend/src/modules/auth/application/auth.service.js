const crypto = require('crypto');
const bcrypt = require('bcrypt');
const AppError = require('../../../shared/errors/app-error');
const { logSecurityEvent } = require('../../../shared/logger/security-event');

/**
 * SHA-256 pre-hash for refresh tokens before bcrypt.
 *
 * Bcrypt truncates input at 72 bytes. A JWT refresh token (e.g. 195 chars)
 * has its distinguishing payload (sub claim) beyond the 72-byte boundary.
 * Two tokens differing only in the last few characters of the sub claim
 * share a >72-byte prefix and bcrypt treats them as equal.
 *
 * SHA-256 produces a fixed 64-hex-char digest that fits well within
 * bcrypt's limit while preserving the full entropy of the original token.
 */
function hashTokenForStorage(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

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
    passwordChangedAt: user.passwordChangedAt || null,
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
  constructor(userRepository, tokenService, emailService, verificationTokenRepository, pendingRegistrationRepository, urlRepository, analyticsRepository) {
    this.userRepository = userRepository;
    this.tokenService = tokenService;
    this.emailService = emailService || null;
    this.verificationTokenRepository = verificationTokenRepository || null;
    this.pendingRegistrationRepository = pendingRegistrationRepository || null;
    this.urlRepository = urlRepository || null;
    this.analyticsRepository = analyticsRepository || null;
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
      logSecurityEvent('auth.register.success', { email });
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

    logSecurityEvent('auth.register.success', { email });

    return {
      message: 'Account created. Please verify your email.',
      email,
    };
  }

  async login({ email, password }) {
    const user = await this.userRepository.findByEmailWithPassword(email);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      logSecurityEvent('auth.login.failed', { email, reason: 'invalid_credentials' });
      throw new AppError('Invalid email or password.', 401);
    }

    // Defense-in-depth: reject unverified users
    // (Users should only exist after verification, but check anyway)
    if (!user.isEmailVerified) {
      logSecurityEvent('auth.login.failed', { userId: user._id.toString(), email: user.email, reason: 'email_not_verified' });
      const appError = new AppError('Please verify your email before signing in.', 403);
      appError.code = 'EMAIL_NOT_VERIFIED';
      appError.email = user.email;
      throw appError;
    }

    const authentication = await this.createAuthenticationResponse(user);

    logSecurityEvent('auth.login.success', { userId: user._id.toString(), email: user.email });

    return authentication;
  }

  async logout(userId) {
    await this.userRepository.clearRefreshToken(userId);

    logSecurityEvent('auth.logout.success', { userId: userId.toString() });
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
      logSecurityEvent('auth.verification.locked', { email: pending.email, reason: 'max_attempts_exceeded' });
      throw new AppError('Too many failed attempts. Please register again.', 400);
    }

    // Validate OTP
    const isValid = await bcrypt.compare(code, token.token);

    if (!isValid) {
      const updatedToken = await this.verificationTokenRepository.incrementAttempts(token._id);
      const remaining = Math.max(0, updatedToken.maxAttempts - updatedToken.attempts);

      if (remaining === 0) {
        logSecurityEvent('auth.verification.locked', { email: pending.email, reason: 'attempts_exhausted' });
        throw new AppError('Too many failed attempts. Please register again.', 400);
      }

      logSecurityEvent('auth.verification.failed', { email: pending.email, remainingAttempts: remaining });
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

    logSecurityEvent('auth.verification.success', { userId: user._id.toString(), email: user.email });

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
      logSecurityEvent('auth.verification.locked', { userId: user._id.toString(), email: user.email, reason: 'max_attempts_exceeded' });
      throw new AppError('Too many failed attempts. Please register again.', 400);
    }

    const isValid = await bcrypt.compare(code, token.token);

    if (!isValid) {
      const updatedToken = await this.verificationTokenRepository.incrementAttempts(token._id);
      const remaining = Math.max(0, updatedToken.maxAttempts - updatedToken.attempts);

      if (remaining === 0) {
        logSecurityEvent('auth.verification.locked', { userId: user._id.toString(), email: user.email, reason: 'attempts_exhausted' });
        throw new AppError('Too many failed attempts. Please register again.', 400);
      }

      logSecurityEvent('auth.verification.failed', { userId: user._id.toString(), email: user.email, remainingAttempts: remaining });
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

    logSecurityEvent('auth.verification.success', { userId: updatedUser._id.toString(), email: updatedUser.email });

    return this.createAuthenticationResponse(updatedUser);
  }

  async resendVerification({ email }) {
    // Check PendingRegistration first
    if (this.pendingRegistrationRepository) {
      const pending = await this.pendingRegistrationRepository.findByEmail(email);

      if (pending) {
        await this._sendOtpForPendingRegistration(email, pending.name);
        logSecurityEvent('auth.verification.otp_resent', { email });
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

    logSecurityEvent('auth.verification.otp_resent', { userId: user._id.toString(), email: user.email });

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

    // If user does not exist, return a clear error.
    if (!user) {
      throw new AppError('No account found with this email address.', 404);
    }

    // If user exists but is not verified, return a clear error.
    if (!user.isEmailVerified) {
      throw new AppError('Please verify your email before resetting your password.', 403);
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

    logSecurityEvent('auth.password_reset.requested', { userId: user._id.toString(), email: user.email });

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

    logSecurityEvent('auth.password_reset.success', { userId: user._id.toString(), email: user.email });

    return {
      message: 'Password has been reset successfully. Please sign in with your new password.',
    };
  }

  async resendPasswordReset({ email }) {
    const user = await this.userRepository.findByEmail(email);

    // If user does not exist, return a clear error.
    if (!user) {
      throw new AppError('No account found with this email address.', 404);
    }

    // If user exists but is not verified, return a clear error.
    if (!user.isEmailVerified) {
      throw new AppError('Please verify your email before resetting your password.', 403);
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

  /**
   * Issue a new access/refresh token pair and store the rotated refresh-token
   * hash.
   *
   * When expectedPreviousTokenHash is provided (refresh flow), the write is
   * performed ATOMICALLY and only succeeds if the stored hash still matches.
   * This closes the concurrent-replay race where two requests presenting the
   * same valid refresh token would both pass the hash comparison and both
   * rotate successfully. Returns null when the rotation lost that race — the
   * caller must treat it as token reuse.
   */
  async createAuthenticationResponse(user, expectedPreviousTokenHash = null) {
    const accessToken = this.tokenService.generateAccessToken(user._id);
    const refreshToken = this.tokenService.generateRefreshToken(user._id);
    const refreshTokenHash = await bcrypt.hash(hashTokenForStorage(refreshToken), PASSWORD_SALT_ROUNDS);
    const refreshTokenExpiresAt = this.tokenService.getRefreshTokenExpiryDate();

    if (
      expectedPreviousTokenHash !== null &&
      typeof this.userRepository.updateRefreshTokenIfMatches === 'function'
    ) {
      const updated = await this.userRepository.updateRefreshTokenIfMatches(
        user._id,
        expectedPreviousTokenHash,
        refreshTokenHash,
        refreshTokenExpiresAt,
      );

      if (!updated) {
        return null;
      }
    } else {
      await this.userRepository.updateRefreshToken(user._id, refreshTokenHash, refreshTokenExpiresAt);
    }

    return {
      user: serializeUser(user),
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }

  // ─── Token Refresh ──────────────────────────────────────────────

  async refreshToken({ refreshToken }) {
    // 1. Verify the JWT signature and structure
    let payload;
    try {
      payload = this.tokenService.verifyRefreshToken(refreshToken);
    } catch (_error) {
      throw new AppError('Invalid or expired refresh token.', 401);
    }

    if (!payload.sub) {
      throw new AppError('Invalid or expired refresh token.', 401);
    }

    // 2. Find the user
    const user = await this.userRepository.findByIdWithPassword(payload.sub);

    if (!user) {
      throw new AppError('Invalid or expired refresh token.', 401);
    }

    // 3. Defense-in-depth: reject unverified users
    if (!user.isEmailVerified) {
      throw new AppError('Invalid or expired refresh token.', 401);
    }

    // 4. Check that the user has a stored refresh token hash
    if (!user.refreshToken) {
      throw new AppError('Invalid or expired refresh token.', 401);
    }

    // 5. Check DB-level expiration
    if (!user.refreshTokenExpiresAt || user.refreshTokenExpiresAt <= new Date()) {
      // Clear the stale token data
      await this.userRepository.clearRefreshToken(user._id);
      throw new AppError('Invalid or expired refresh token.', 401);
    }

    // 6. Compare the supplied refresh token against the stored hash.
    // SHA-256 pre-hash eliminates bcrypt's 72-byte truncation so two
    // different tokens that share a >72-byte prefix are not treated as equal.
    const isValid = await bcrypt.compare(hashTokenForStorage(refreshToken), user.refreshToken);

    if (!isValid) {
      // Possible token reuse attack — log BEFORE invalidating so the signal survives.
      logSecurityEvent('auth.refresh_token.reuse_detected', {
        userId: user._id.toString(),
        email: user.email,
        reason: 'refresh_token_hash_mismatch',
      });

      // Possible token reuse attack — clear all tokens for this user
      await this.userRepository.clearRefreshToken(user._id);
      throw new AppError('Invalid or expired refresh token.', 401);
    }

    // 7. Rotate atomically: the stored hash is replaced ONLY if it still
    // matches what we just compared. A concurrent request using the same
    // token can win this race exactly once — the loser is treated as reuse.
    const authentication = await this.createAuthenticationResponse(user, user.refreshToken);

    if (!authentication) {
      logSecurityEvent('auth.refresh_token.reuse_detected', {
        userId: user._id.toString(),
        email: user.email,
        reason: 'refresh_token_already_rotated',
      });

      throw new AppError('Invalid or expired refresh token.', 401);
    }

    return authentication;
  }

  // ─── Profile Management ─────────────────────────────────────────

  async updateProfile(userId, { name }) {
    const user = await this.userRepository.updateById(userId, { name });

    if (!user) {
      throw new AppError('User not found.', 404);
    }

    return serializeUser(user);
  }

  async changePassword(userId, { currentPassword, newPassword }) {
    const user = await this.userRepository.findByIdWithPassword(userId);

    if (!user) {
      throw new AppError('User not found.', 404);
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isCurrentPasswordValid) {
      throw new AppError('Current password is incorrect.', 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, PASSWORD_SALT_ROUNDS);
    await this.userRepository.updatePassword(userId, passwordHash);

    // Invalidate existing session/refresh token — user must re-login
    await this.userRepository.clearRefreshToken(userId);

    logSecurityEvent('auth.password_change.success', { userId: userId.toString() });

    return { message: 'Password changed successfully. Please sign in again.' };
  }

  async deleteAccount(userId, { password }) {
    const user = await this.userRepository.findByIdWithPassword(userId);

    if (!user) {
      throw new AppError('User not found.', 404);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new AppError('Password is incorrect.', 400);
    }

    // 1. Delete analytics events owned by this user
    if (this.analyticsRepository) {
      await this.analyticsRepository.deleteByUser(userId);
    }

    // 2. Find and delete analytics events for user's URLs, then hard-delete URLs
    if (this.urlRepository) {
      const urlIds = await this.urlRepository.findIdsByOwner(userId);

      if (urlIds.length > 0 && this.analyticsRepository) {
        const ids = urlIds.map((doc) => doc._id);
        await this.analyticsRepository.deleteByUrls(ids);
      }

      await this.urlRepository.hardDeleteByOwner(userId);
    }

    // 3. Delete verification tokens
    if (this.verificationTokenRepository) {
      await this.verificationTokenRepository.deleteByUser(userId);
    }

    // 4. Delete pending registration if any
    if (this.pendingRegistrationRepository) {
      await this.pendingRegistrationRepository.deleteByEmail(user.email);
    }

    // 5. Hard-delete the user
    await this.userRepository.deleteById(userId);

    logSecurityEvent('auth.account.deleted', { userId: userId.toString(), email: user.email });

    return { message: 'Account has been permanently deleted.' };
  }
}

module.exports = AuthService;
module.exports.hashTokenForStorage = hashTokenForStorage;
