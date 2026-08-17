const Url = require('../models/url.model');

class UrlRepository {
  async create(urlData) {
    return Url.create(urlData);
  }

  async findByOwner(ownerId) {
    return Url.find({ owner: ownerId, isDeleted: false }).sort({ createdAt: -1 });
  }

  async findByIdForOwner(id, ownerId) {
    return Url.findOne({ _id: id, owner: ownerId, isDeleted: false });
  }

  async updateByIdForOwner(id, ownerId, updates) {
    return Url.findOneAndUpdate(
      { _id: id, owner: ownerId, isDeleted: false },
      { $set: updates },
      { new: true, runValidators: true },
    );
  }

  async softDeleteByIdForOwner(id, ownerId) {
    return Url.findOneAndUpdate(
      { _id: id, owner: ownerId, isDeleted: false },
      { $set: { isActive: false, isDeleted: true, deletedAt: new Date() } },
      { new: true },
    );
  }

  async existsByShortCode(shortCode) {
    return Url.exists({ shortCode });
  }

  async findByShortCode(shortCode) {
    return Url.findOne({ shortCode, isDeleted: false });
  }

  async incrementClickCount(id) {
    return Url.findByIdAndUpdate(id, { $inc: { clickCount: 1 } });
  }
}

module.exports = UrlRepository;
