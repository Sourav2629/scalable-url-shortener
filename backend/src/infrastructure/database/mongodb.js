const mongoose = require('mongoose');
const config = require('../../config');
const { logger } = require('../logger');

async function connectDatabase() {
  try {
    const connectionString = config.database.getMongoUri();

    await mongoose.connect(connectionString);
    logger.info('MongoDB connected successfully.');
  } catch (error) {
    logger.error({ err: error }, 'MongoDB connection failed');
    throw error;
  }
}

module.exports = { connectDatabase };
