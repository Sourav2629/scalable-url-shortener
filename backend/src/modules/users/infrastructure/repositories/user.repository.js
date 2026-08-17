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

  async updateRefreshToken(id, refreshToken) {
    return User.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { refreshToken },
      { new: true },
    );
  }

  async clearRefreshToken(id) {
    return User.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { refreshToken: null },
      { new: true },
    );
  }
}

module.exports = UserRepository;
