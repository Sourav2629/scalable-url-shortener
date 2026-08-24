const PendingRegistration = require('../models/pending-registration.model');

class PendingRegistrationRepository {
  /**
   * Create or update a pending registration for an email.
   * If one already exists, update it. Otherwise, create new.
   */
  async upsert({ name, email, passwordHash, expiresAt }) {
    return PendingRegistration.findOneAndUpdate(
      { email },
      { name, email, passwordHash, expiresAt },
      { upsert: true, new: true, runValidators: true },
    );
  }

  /**
   * Find a pending registration by email.
   */
  async findByEmail(email) {
    return PendingRegistration.findOne({ email });
  }

  /**
   * Delete a pending registration by email.
   */
  async deleteByEmail(email) {
    return PendingRegistration.deleteOne({ email });
  }
}

module.exports = PendingRegistrationRepository;
