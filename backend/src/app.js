const express = require('express');
const helmet = require('helmet');
const mongoose = require('mongoose');
const AppError = require('./shared/errors/app-error');
const { httpLogger } = require('./shared/logger');
const { corsMiddleware } = require('./shared/middleware/cors.middleware');
const { authLimiter, publicLimiter, publicShortenLimiter, apiLimiter } = require('./shared/middleware/rate-limiter.middleware');
const authRoutes = require('./modules/auth/presentation/routes/auth.routes');
const urlRoutes = require('./modules/urls/presentation/routes/url.routes');
const analyticsRoutes = require('./modules/analytics/presentation/routes/analytics.routes');
const publicUrlRoutes = require('./modules/urls/presentation/routes/public-url.routes');
const publicCreateUrlRoutes = require('./modules/urls/presentation/routes/public-create-url.routes');
const publicAliasCheckRoutes = require('./modules/urls/presentation/routes/public-alias-check.routes');

const app = express();

app.use(helmet());
app.use(corsMiddleware);
app.use(httpLogger);
app.use(express.json({ limit: '1mb' }));

// Health and Readiness endpoints (no rate limiting)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

app.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'ALIVE' });
});

app.get('/health/ready', (req, res) => {
  const isMongoReady = mongoose.connection.readyState === 1;
  if (isMongoReady) {
    res.status(200).json({ status: 'READY', database: 'connected' });
  } else {
    res.status(503).json({ status: 'UNAVAILABLE', database: 'disconnected' });
  }
});

// API Routes
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/urls', apiLimiter, urlRoutes);
app.use('/api/v1/urls', apiLimiter, analyticsRoutes);
app.use('/api/v1/public/urls', publicShortenLimiter, publicCreateUrlRoutes);
app.use('/api/v1/public/urls', publicShortenLimiter, publicAliasCheckRoutes);

app.use('/api/v1', (req, res, next) => {
  next(new AppError('Route not found', 404));
});

// Public Redirect Route
app.use('/', publicLimiter, publicUrlRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  const message = statusCode >= 500 ? 'Internal server error' : err.message;

  if (statusCode >= 500) {
    if (req.log) req.log.error(err);
  } else {
    if (req.log) req.log.warn(err);
  }

  const response = { message };
  if (err.code) response.code = err.code;
  if (err.email) response.email = err.email;
  if (statusCode === 409 && err.message.includes('already exists')) response.code = 'USER_EXISTS';
  res.status(statusCode).json(response);
});

module.exports = app;
