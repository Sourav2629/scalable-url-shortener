const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test_db';
process.env.JWT_ACCESS_SECRET = 'test_access_secret_key_1234567890';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_key_1234567890';
process.env.REDIS_URL = 'redis://localhost:6379';

mongoose.set('bufferCommands', false);
