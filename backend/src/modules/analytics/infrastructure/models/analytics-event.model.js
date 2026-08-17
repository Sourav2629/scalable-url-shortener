const mongoose = require('mongoose');
const crypto = require('crypto');

const analyticsEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      default: () => crypto.randomUUID(),
    },
    urlId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Url',
      required: true,
      index: true,
    },
    shortCode: {
      type: String,
      required: true,
      index: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    // Anonymized IP: Store only the first 3 octets (e.g., 192.168.1.0)
    anonymizedIp: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      required: true,
    },
    referrer: {
      type: String,
      default: null,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Future-proofing for Geo/Device parsing
    metadata: {
      country: { type: String, default: null },
      region: { type: String, default: null },
      city: { type: String, default: null },
      browser: { type: String, default: null },
      os: { type: String, default: null },
      deviceType: { type: String, default: null },
      trafficSource: { type: String, default: null },
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// TTL Index for retention: 90 days (in seconds)
analyticsEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('AnalyticsEvent', analyticsEventSchema);
