const mongoose = require('mongoose');
const supertest = require('supertest');
const Redis = require('ioredis');
const app = require('../src/app');
const config = require('../src/config');
const Url = require('../src/modules/urls/infrastructure/models/url.model');
const AnalyticsEvent = require('../src/modules/analytics/infrastructure/models/analytics-event.model');
const User = require('../src/modules/users/infrastructure/models/user.model');

async function runVerification() {
  console.log('=== LINKSPHERE E2E INFRASTRUCTURE VERIFICATION ===\n');

  const report = {
    infra: {
      mongoDB: 'FAIL',
      redis: 'FAIL',
      api: 'FAIL',
      worker: 'NOT RUN',
    },
    flow: {},
    security: {},
    redisIsolation: 'FAIL',
    bugsFixed: [],
    unverifiedSteps: [],
  };

  // 1. Check MongoDB
  let mongoConnected = false;
  try {
    await mongoose.connect(config.database.getMongoUri());
    mongoConnected = true;
    report.infra.mongoDB = 'PASS';
    console.log('[INFRA] MongoDB: PASS (Connected to ' + config.database.getMongoUri() + ')');
  } catch (err) {
    report.infra.mongoDB = 'FAIL (' + err.message + ')';
    console.log('[INFRA] MongoDB: FAIL - ' + err.message);
    process.exit(1);
  }

  // 2. Check Redis
  let redisConnected = false;
  try {
    const redis = new Redis(config.redis.getUrl(), { connectTimeout: 1000, maxRetriesPerRequest: 1 });
    await new Promise((resolve, reject) => {
      redis.on('connect', () => resolve(true));
      redis.on('error', (e) => reject(e));
    });
    redisConnected = true;
    report.infra.redis = 'PASS';
    console.log('[INFRA] Redis: PASS');
  } catch (err) {
    report.infra.redis = 'NOT RUN — Redis unavailable (' + err.message + ')';
    console.log('[INFRA] Redis: NOT RUN — Redis unavailable (' + err.message + ')');
    report.unverifiedSteps.push('BullMQ Queue enqueuing and Worker processing (Redis unavailable)');
  }

  // API Health Check
  const request = supertest(app);
  try {
    const res = await request.get('/health/live');
    if (res.status === 200) {
      report.infra.api = 'PASS';
      console.log('[INFRA] LinkSphere API: PASS (Health endpoint returned 200)');
    }
  } catch (e) {
    report.infra.api = 'FAIL (' + e.message + ')';
  }

  const testEmail1 = `e2e_user1_${Date.now()}@example.com`;
  const testEmail2 = `e2e_user2_${Date.now()}@example.com`;
  const testPassword = 'Password123!';

  console.log('\n--- AUTH FLOW ---');
  // 1. Register User 1
  const regRes = await request.post('/api/v1/auth/register').send({
    email: testEmail1,
    password: testPassword,
    name: 'E2E User 1',
  });
  console.log(`[AUTH] Register User 1: HTTP ${regRes.status}`);

  // 2. Login User 1
  const loginRes = await request.post('/api/v1/auth/login').send({
    email: testEmail1,
    password: testPassword,
  });
  console.log(`[AUTH] Login User 1: HTTP ${loginRes.status}`);
  const token1 = loginRes.body.accessToken || (loginRes.body.tokens && loginRes.body.tokens.accessToken);
  console.log(`[AUTH] Token 1 captured: ${token1 ? 'YES' : 'NO'}`);

  // Register & Login User 2 for Security Testing
  await request.post('/api/v1/auth/register').send({
    email: testEmail2,
    password: testPassword,
    name: 'E2E User 2',
  });
  const loginRes2 = await request.post('/api/v1/auth/login').send({
    email: testEmail2,
    password: testPassword,
  });
  const token2 = loginRes2.body.accessToken || (loginRes2.body.tokens && loginRes2.body.tokens.accessToken);

  console.log('\n--- URL FLOW ---');
  // 5. Create URL
  const createRes = await request
    .post('/api/v1/urls')
    .set('Authorization', `Bearer ${token1}`)
    .send({
      originalUrl: 'https://example.com/target-page',
      title: 'E2E Target',
      description: 'E2E Test URL Description',
    });
  console.log(`[URL] Create URL: HTTP ${createRes.status}`);
  const urlObj = createRes.body.url;
  const urlId = urlObj.id;
  const shortCode = urlObj.shortCode;
  console.log(`[URL] Created URL ID: ${urlId}, shortCode: ${shortCode}`);

  // 6. Verify URL in MongoDB
  const mongoUrlDoc = await Url.findById(urlId);
  console.log(`[URL] Verified in MongoDB: ${mongoUrlDoc ? 'FOUND (clickCount=' + mongoUrlDoc.clickCount + ')' : 'NOT FOUND'}`);

  // 7. Retrieve URL through API
  const getRes = await request
    .get(`/api/v1/urls/${urlId}`)
    .set('Authorization', `Bearer ${token1}`);
  console.log(`[URL] Retrieve URL via API: HTTP ${getRes.status}`);

  console.log('\n--- REDIRECT FLOW & REDIS FAILURE ISOLATION ---');
  // 9. Request public short URL (No Auth)
  const redirectRes = await request.get(`/${shortCode}`).set('User-Agent', 'E2E-Verifier/1.0');
  console.log(`[REDIRECT] Public Shortcode HTTP Status: ${redirectRes.status}`);
  console.log(`[REDIRECT] Location Header: ${redirectRes.headers.location}`);

  // 12. Verify clickCount incremented in MongoDB
  const mongoUrlDocAfter = await Url.findById(urlId);
  console.log(`[REDIRECT] clickCount in MongoDB after redirect: ${mongoUrlDocAfter.clickCount}`);
  if (redirectRes.status === 302 && redirectRes.headers.location === 'https://example.com/target-page' && mongoUrlDocAfter.clickCount === 1) {
    report.redisIsolation = 'PASS (Redirect returned 302, Location verified, clickCount incremented even with Redis offline)';
  }

  console.log('\n--- ANALYTICS API ---');
  // 21. Call GET /api/v1/urls/:id/analytics/summary (Owner)
  const summaryRes = await request
    .get(`/api/v1/urls/${urlId}/analytics/summary`)
    .set('Authorization', `Bearer ${token1}`);
  console.log(`[ANALYTICS] Summary API (Owner): HTTP ${summaryRes.status}, body:`, summaryRes.body);

  // 23. Call GET /api/v1/urls/:id/analytics/timeseries (Owner)
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const timeseriesRes = await request
    .get(`/api/v1/urls/${urlId}/analytics/timeseries?from=${from}&to=${to}&interval=hour`)
    .set('Authorization', `Bearer ${token1}`);
  console.log(`[ANALYTICS] Timeseries API (Owner): HTTP ${timeseriesRes.status}`);

  console.log('\n--- SECURITY TESTS ---');
  // 25. Access URL with another user's token
  const unauthorizedUrlRes = await request
    .get(`/api/v1/urls/${urlId}`)
    .set('Authorization', `Bearer ${token2}`);
  console.log(`[SECURITY] Access URL with User 2 Token: HTTP ${unauthorizedUrlRes.status} (Expected 404/403)`);

  // 26. Access Analytics with another user's token
  const unauthorizedAnalyticsRes = await request
    .get(`/api/v1/urls/${urlId}/analytics/summary`)
    .set('Authorization', `Bearer ${token2}`);
  console.log(`[SECURITY] Access Analytics with User 2 Token: HTTP ${unauthorizedAnalyticsRes.status} (Expected 404/403)`);

  // Cleanup test documents
  await User.deleteMany({ email: { $in: [testEmail1, testEmail2] } });
  await Url.deleteMany({ _id: urlId });
  await AnalyticsEvent.deleteMany({ urlId });
  await mongoose.disconnect();

  console.log('\n=== VERIFICATION COMPLETE ===');
}

runVerification().catch((e) => {
  console.error('Verification error:', e);
  process.exit(1);
});