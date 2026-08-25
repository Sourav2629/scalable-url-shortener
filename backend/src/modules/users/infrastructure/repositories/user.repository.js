const User = require('../models/user.model');

class UserRepository {
  async findByEmail(email) {
    return User.findOne({ email, isDeleted: false });
  }

  async findByEmailWithPassword(email) {
    return User.findOne({ email, isDeleted: false }).select('+password');
  }

  async findById(id) {
    return User.findOne({ _id: id, isDeleted: false });
  }

  async create(userData) {
    return User.create(userData);
  }

  async updateRefreshToken(id, refreshToken, refreshTokenExpiresAt) {
    return User.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { refreshToken, refreshTokenExpiresAt },
      { new: true },
    );
  }

  /**
   * Atomic single-use rotation guard: replaces the stored refresh-token hash
   * ONLY if it still matches expectedTokenHash. Prevents a concurrent-replay
   * race where two requests presenting the same valid refresh token both
   * rotate successfully. Returns null when the stored token has already
   * changed (i.e., another request consumed it first).
   */
  async updateRefreshTokenIfMatches(id, expectedTokenHash, refreshToken, refreshTokenExpiresAt) {
    return User.findOneAndUpdate(
      { _id: id, isDeleted: false, refreshToken: expectedTokenHash },
      { refreshToken, refreshTokenExpiresAt },
      { new: true },
    );
  }

  async clearRefreshToken(id) {
    return User.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { refreshToken: null, refreshTokenExpiresAt: null },
      { new: true },
    );
  }

  async markEmailVerified(id) {
    return User.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { isEmailVerified: true },
      { new: true },
    );
  }

  async updatePassword(id, passwordHash) {
    return User.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { password: passwordHash, passwordChangedAt: new Date() },
      { new: true },
    );
  }

  async findByIdWithPassword(id) {
    return User.findOne({ _id: id, isDeleted: false }).select('+password');
  }

  async updateById(id, fields) {
    return User.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: fields },
      { new: true, runValidators: true },
    );
  }

  async deleteById(id) {
    return User.deleteOne({ _id: id });
  }
}

module.exports = UserRepository;
