const Url = require('../models/url.model');

class UrlRepository {
  async create(urlData) {
    return Url.create(urlData);
  }

  async findByOwner(ownerId, { page = 1, limit = 20, search, sortBy = 'createdAt', sortOrder = 'desc' } = {}) {
    const skip = (page - 1) * limit;

    const query = { owner: ownerId, isDeleted: false };

    if (search && typeof search === 'string' && search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      query.$or = [
        { shortCode: regex },
        { originalUrl: regex },
        { title: regex },
      ];
    }

    const VALID_SORT_FIELDS = ['createdAt', 'clickCount', 'title', 'shortCode'];
    const field = VALID_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
    const direction = sortOrder === 'asc' ? 1 : -1;
    const sortObj = { [field]: direction };

    const findQuery = Url.find(query).sort(sortObj).skip(skip).limit(limit);

    if (field === 'title') {
      findQuery.collation({ locale: 'en', strength: 2 });
    }

    const [urls, total] = await Promise.all([
      findQuery,
      Url.countDocuments(query),
    ]);

    return { urls, total };
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

  async hardDeleteByOwner(ownerId) {
    return Url.deleteMany({ owner: ownerId });
  }

  async findIdsByOwner(ownerId) {
    return Url.find({ owner: ownerId }, { _id: 1 }).lean();
  }
}

module.exports = UrlRepository;
