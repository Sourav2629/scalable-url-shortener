const mongoose = require('mongoose');
const config = require('../../config');

async function connectDatabase() {
  try {
    const connectionString = config.database.getMongoUri();

    await mongoose.connect(connectionString);
    console.log('MongoDB connected successfully.');
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`);
    throw error;
  }
}

module.exports = { connectDatabase };
