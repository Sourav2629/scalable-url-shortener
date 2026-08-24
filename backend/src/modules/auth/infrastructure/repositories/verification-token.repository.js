const VerificationToken = require('../models/verification-token.model');

class VerificationTokenRepository {
  /**
   * Create a new verification token.
   */
  async create({ userId, token, purpose, expiresAt, maxAttempts = 5 }) {
    return VerificationToken.create({
      userId,
      token,
      purpose,
      expiresAt,
      maxAttempts,
      attempts: 0,
      used: false,
    });
  }

  /**
   * Find the most recent active (unused, non-expired) token for a user and purpose.
   */
  async findActive({ userId, purpose }) {
    return VerificationToken.findOne({
      userId,
      purpose,
      used: false,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });
  }

  /**
   * Increment the attempts counter on a token.
   */
  async incrementAttempts(tokenId) {
    return VerificationToken.findByIdAndUpdate(
      tokenId,
      { $inc: { attempts: 1 } },
      { new: true },
    );
  }

  /**
   * Invalidate all unused tokens for a user and purpose (e.g., on resend or successful verification).
   */
  async invalidateAll({ userId, purpose }) {
    return VerificationToken.updateMany(
      { userId, purpose, used: false },
      { used: true },
    );
  }

  /**
   * Mark a specific token as used.
   */
  async markUsed(tokenId) {
    return VerificationToken.findByIdAndUpdate(
      tokenId,
      { used: true },
      { new: true },
    );
  }

  async deleteByUser(userId) {
    return VerificationToken.deleteMany({ userId });
  }
}

module.exports = VerificationTokenRepository;
