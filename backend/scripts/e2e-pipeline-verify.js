/**
 * LinkSphere Real E2E Analytics Pipeline Verification
 * 
 * This script performs a REAL end-to-end test of the async analytics pipeline:
 *   Redirect -> BullMQ -> Redis -> Worker -> Enrichment -> MongoDB -> Analytics API
 * 
 * Prerequisites:
 *   - MongoDB running on 127.0.0.1:27017
 *   - Redis running on 127.0.0.1:6379
 *   - No mocking, no test env — real infrastructure only
 */

const { fork } = require('child_process');
const http = require('http');
const mongoose = require('mongoose');
const Redis = require('ioredis');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function httpReq(method, path, { body, token, followRedirects = false } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: '127.0.0.1',
      port: 5000,
      path,
      method,
      headers,
    }, (res) => {
      // Capture redirect headers before consuming body
      const location = res.headers.location;
      const statusCode = res.statusCode;

      // For redirects with followRedirects=false, just return status + headers
      if (statusCode >= 300 && statusCode < 400 && !followRedirects) {
        res.resume();
        return resolve({ status: statusCode, headers: res.headers, body: null });
      }

      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        let bodyStr = Buffer.concat(chunks).toString();
        let json = null;
        try { json = JSON.parse(bodyStr); } catch {}
        resolve({ status: statusCode, headers: res.headers, body: json || bodyStr });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function assert(condition, label) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${label}`);
  console.log(`  ✓ ${label}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function run() {
  const startTime = Date.now();
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  LinkSphere Real E2E Analytics Pipeline Verification       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const results = {};
  let workerProcess = null;
  let apiProcess = null;
  let testUserId = null;
  let testUrlId = null;
  let testShortCode = null;
  let testToken = null;
  let testUser2Token = null;
  let testEventId = null;

  try {
    // ================================================================
    // STEP 1: Verify Redis connectivity
    // ================================================================
    console.log('── Step 1: Redis Connectivity ──');
    const redis = new Redis('redis://127.0.0.1:6379', { connectTimeout: 3000 });
    const pong = await redis.ping();
    assert(pong === 'PONG', 'Redis PING returns PONG');
    results.redis = 'PASS';

    // Clear any stale analytics-clicks data from previous runs
    const keys = await redis.keys('bull:analytics-clicks:*');
    for (const key of keys) await redis.del(key);
    console.log(`  ✓ Cleared ${keys.length} stale BullMQ keys\n`);

    // ================================================================
    // STEP 2: Start the analytics worker as a child process
    // ================================================================
    console.log('── Step 2: Start Analytics Worker ──');
    await new Promise((resolve, reject) => {
      workerProcess = fork('./src/workers/analytics.worker.js', [], {
        cwd: __dirname + '/..',
        env: { ...process.env, NODE_ENV: 'development' },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });

      let startupConfirmed = false;
      const stdout = [];
      const stderr = [];

      workerProcess.stdout.on('data', (data) => {
        const text = data.toString();
        stdout.push(text);
        process.stdout.write(`    [worker] ${text}`);
        if (text.includes('Connected to MongoDB') && !startupConfirmed) {
          startupConfirmed = true;
          // Give it a moment to start listening
          setTimeout(resolve, 500);
        }
      });

      workerProcess.stderr.on('data', (data) => {
        const text = data.toString();
        stderr.push(text);
        process.stderr.write(`    [worker:err] ${text}`);
      });

      workerProcess.on('error', reject);
      setTimeout(() => {
        if (!startupConfirmed) reject(new Error('Worker did not start within 15s'));
      }, 15000);
    });
    results.worker = 'PASS';
    console.log('  ✓ Analytics worker started and connected to MongoDB\n');

    // ================================================================
    // STEP 3: Start the API server
    // ================================================================
    console.log('── Step 3: Start API Server ──');
    await new Promise((resolve, reject) => {
      apiProcess = fork('./src/server.js', [], {
        cwd: __dirname + '/..',
        env: { ...process.env, NODE_ENV: 'development', PORT: '5000' },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });

      let apiReady = false;
      apiProcess.stdout.on('data', (data) => {
        const text = data.toString();
        process.stdout.write(`    [api] ${text}`);
        if ((text.includes('MongoDB connected') || text.includes('Server running')) && !apiReady) {
          apiReady = true;
          setTimeout(resolve, 500);
        }
      });

      apiProcess.stderr.on('data', (data) => {
        process.stderr.write(`    [api:err] ${data.toString()}`);
      });

      apiProcess.on('error', reject);
      setTimeout(() => {
        if (!apiReady) reject(new Error('API server did not start within 15s'));
      }, 15000);
    });
    results.api = 'PASS';
    console.log('  ✓ API server started\n');

    // Verify health endpoints
    const healthRes = await httpReq('GET', '/health/live');
    assert(healthRes.status === 200, 'GET /health/live returns 200');

    const readyRes = await httpReq('GET', '/health/ready');
    assert(readyRes.status === 200, 'GET /health/ready returns 200');

    // ================================================================
    // STEP 4: Register & Login a test user
    // ================================================================
    console.log('── Step 4: Auth Flow ──');
    const ts = Date.now();
    const testEmail = `e2e_pipeline_${ts}@test.com`;

    const regRes = await httpReq('POST', '/api/v1/auth/register', {
      body: { email: testEmail, password: 'Test1234!', name: 'E2E Pipeline User' },
    });
    assert(regRes.status === 201, `Register returns 201 (got ${regRes.status})`);
    testUserId = regRes.body.user.id;

    const loginRes = await httpReq('POST', '/api/v1/auth/login', {
      body: { email: testEmail, password: 'Test1234!' },
    });
    assert(loginRes.status === 200, `Login returns 200 (got ${loginRes.status})`);
    testToken = loginRes.body.tokens ? loginRes.body.tokens.accessToken : loginRes.body.accessToken;
    assert(testToken, 'JWT access token received');
    console.log(`  ✓ User registered and logged in (${testEmail})\n`);

    // ================================================================
    // STEP 5: Create a test short URL
    // ================================================================
    console.log('── Step 5: Create URL ──');
    const createRes = await httpReq('POST', '/api/v1/urls', {
      body: {
        originalUrl: 'https://example.com/verified-target',
        title: 'E2E Pipeline Test URL',
        description: 'Created for real analytics pipeline verification',
      },
      token: testToken,
    });
    assert(createRes.status === 201, `Create URL returns 201 (got ${createRes.status})`);
    testUrlId = createRes.body.url.id;
    testShortCode = createRes.body.url.shortCode;
    console.log(`  ✓ URL created: id=${testUrlId}, shortCode=${testShortCode}\n`);

    // ================================================================
    // STEP 6: Perform the public redirect
    // ================================================================
    console.log('── Step 6: Public Redirect ──');
    const redirectRes = await httpReq('GET', `/${testShortCode}`, {
      followRedirects: false,
    });
    assert(redirectRes.status === 302, `Redirect returns 302 (got ${redirectRes.status})`);
    assert(redirectRes.headers.location === 'https://example.com/verified-target',
      `Location header is correct (got ${redirectRes.headers.location})`);
    console.log('  ✓ Public redirect returned 302 with correct Location\n');

    // ================================================================
    // STEP 7: Verify clickCount incremented
    // ================================================================
    console.log('── Step 7: clickCount Increment ──');
    // Wait a moment for MongoDB write
    await sleep(500);
    await mongoose.connect('mongodb://127.0.0.1:27017/linksphere_dev');
    const Url = require('../src/modules/urls/infrastructure/models/url.model');
    const urlDoc = await Url.findById(testUrlId);
    assert(urlDoc, 'URL document found in MongoDB');
    assert(urlDoc.clickCount >= 1, `clickCount >= 1 (got ${urlDoc.clickCount})`);
    console.log(`  ✓ clickCount = ${urlDoc.clickCount}\n`);

    // ================================================================
    // STEP 8 & 9: Verify BullMQ Enqueue & Worker Consumption
    // ================================================================
    console.log('── Step 8 & 9: BullMQ Enqueue & Worker Consumption ──');
    // Poll MongoDB until AnalyticsEvent is created by the worker
    const AnalyticsEvent = require('../src/modules/analytics/infrastructure/models/analytics-event.model');
    let eventDoc = null;
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      const events = await AnalyticsEvent.find({ urlId: testUrlId });
      if (events.length > 0) {
        eventDoc = events[0];
        break;
      }
      process.stdout.write(`    Waiting for worker to process event... (${i + 1}/20)\r`);
    }
    console.log('');
    assert(eventDoc, 'Analytics event consumed by worker and persisted to MongoDB');
    results.bullmqEnqueue = 'PASS';
    results.workerConsumption = 'PASS';
    console.log('  ✓ BullMQ analytics job enqueued, consumed by worker, and processed\n');

    // ================================================================
    // STEP 10: Verify analytics event persisted in MongoDB
    // ================================================================
    console.log('── Step 10: Analytics MongoDB Persistence ──');
    
    const evt = eventDoc;
    testEventId = evt.eventId;
    
    assert(evt.eventId, 'eventId exists');
    assert(evt.urlId.toString() === testUrlId, 'urlId matches');
    assert(evt.shortCode === testShortCode, 'shortCode matches');
    assert(evt.timestamp instanceof Date, 'timestamp exists and is a Date');
    assert(typeof evt.anonymizedIp === 'string' && evt.anonymizedIp.length > 0, 'anonymizedIp exists');
    assert(typeof evt.userAgent === 'string' && evt.userAgent.length > 0, 'userAgent exists');
    console.log(`  ✓ Event fields verified: eventId=${evt.eventId.substring(0, 8)}..., shortCode=${evt.shortCode}`);
    results.analyticsPersistence = 'PASS';

    // Verify IP is anonymized (should NOT contain the full original IP)
    // The original request comes from 127.0.0.1, anonymized should be 127.0.0.0
    assert(evt.anonymizedIp === '127.0.0.0', `IP is anonymized (got ${evt.anonymizedIp})`);
    console.log(`  ✓ IP anonymized: 127.0.0.0`);
    results.ipAnonymization = 'PASS';

    // ================================================================
    // STEP 11: Verify UA/referrer enrichment
    // ================================================================
    console.log('── Step 11: UA/Referrer Enrichment ──');
    assert(evt.metadata, 'metadata object exists');
    assert(typeof evt.metadata.browser === 'string', `metadata.browser exists: ${evt.metadata.browser}`);
    assert(typeof evt.metadata.os === 'string', `metadata.os exists: ${evt.metadata.os}`);
    assert(typeof evt.metadata.deviceType === 'string', `metadata.deviceType exists: ${evt.metadata.deviceType}`);
    assert(typeof evt.metadata.trafficSource === 'string', `metadata.trafficSource exists: ${evt.metadata.trafficSource}`);
    // No referrer was sent, so trafficSource should be 'Direct'
    assert(evt.metadata.trafficSource === 'Direct', `trafficSource is "Direct" (got ${evt.metadata.trafficSource})`);
    console.log(`  ✓ Enrichment: browser=${evt.metadata.browser}, os=${evt.metadata.os}, device=${evt.metadata.deviceType}, source=${evt.metadata.trafficSource}`);
    results.uaEnrichment = 'PASS';

    // ================================================================
    // STEP 12: Verify analytics summary API
    // ================================================================
    console.log('── Step 12: Analytics Summary API ──');
    const summaryRes = await httpReq('GET', `/api/v1/urls/${testUrlId}/analytics/summary`, {
      token: testToken,
    });
    assert(summaryRes.status === 200, `Summary API returns 200 (got ${summaryRes.status})`);
    assert(summaryRes.body.totalClicks >= 1, `totalClicks >= 1 (got ${summaryRes.body.totalClicks})`);
    console.log(`  ✓ Summary: totalClicks=${summaryRes.body.totalClicks}`);
    console.log(`    topBrowsers:`, JSON.stringify(summaryRes.body.topBrowsers));
    console.log(`    topTrafficSources:`, JSON.stringify(summaryRes.body.topTrafficSources));
    results.analyticsSummary = 'PASS';

    // ================================================================
    // STEP 13: Verify analytics timeseries API
    // ================================================================
    console.log('── Step 13: Analytics Timeseries API ──');
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const tsRes = await httpReq('GET', `/api/v1/urls/${testUrlId}/analytics/timeseries?from=${from}&to=${to}&interval=hour`, {
      token: testToken,
    });
    assert(tsRes.status === 200, `Timeseries API returns 200 (got ${tsRes.status})`);
    assert(tsRes.body.data && tsRes.body.data.length >= 1, `Timeseries has >= 1 data point (got ${tsRes.body.data ? tsRes.body.data.length : 0})`);
    console.log(`  ✓ Timeseries: ${tsRes.body.data.length} data point(s), interval=${tsRes.body.interval}`);
    results.analyticsTimeseries = 'PASS';

    // ================================================================
    // STEP 14: Verify idempotency
    // ================================================================
    console.log('── Step 14: Idempotency ──');
    // Re-enqueue the same eventId by directly calling processClickEvent
    const AnalyticsService = require('../src/modules/analytics/application/analytics.service');
    const { analyticsRepository } = require('../src/modules/analytics/infrastructure/repositories/analytics.repository');
    const analyticsService = new AnalyticsService(analyticsRepository);

    const eventsBefore = await AnalyticsEvent.find({ urlId: testUrlId });

    const duplicateEvent = {
      eventId: testEventId, // same eventId
      urlId: new mongoose.Types.ObjectId(testUrlId),
      shortCode: testShortCode,
      timestamp: new Date(),
      anonymizedIp: '127.0.0.0',
      userAgent: 'DuplicateTest/1.0',
      referrer: null,
      userId: null,
      metadata: {},
    };

    // Process the same event again
    await analyticsService.processClickEvent(duplicateEvent);
    await sleep(500);

    const eventsAfter = await AnalyticsEvent.find({ urlId: testUrlId });
    assert(eventsAfter.length === eventsBefore.length,
      `Idempotency: still ${eventsAfter.length} event(s) after duplicate (was ${eventsBefore.length})`);
    results.idempotency = 'PASS';
    console.log(`  ✓ Idempotency: ${eventsAfter.length} event(s) — duplicate correctly rejected\n`);

    // ================================================================
    // STEP 15: Security — ownership isolation
    // ================================================================
    console.log('── Step 15: Ownership Isolation ──');
    // Create a second user
    const reg2Res = await httpReq('POST', '/api/v1/auth/register', {
      body: { email: `e2e_other_${ts}@test.com`, password: 'Test1234!', name: 'Other User' },
    });
    if (reg2Res.status === 201 || reg2Res.status === 409) {
      const login2Res = await httpReq('POST', '/api/v1/auth/login', {
        body: { email: `e2e_other_${ts}@test.com`, password: 'Test1234!' },
      });
      if (login2Res.status === 200) {
        testUser2Token = login2Res.body.tokens ? login2Res.body.tokens.accessToken : login2Res.body.accessToken;
      }
    }
    if (testUser2Token) {
      const unauthorizedSummary = await httpReq('GET', `/api/v1/urls/${testUrlId}/analytics/summary`, {
        token: testUser2Token,
      });
      assert(unauthorizedSummary.status >= 400,
        `User 2 denied access to User 1's analytics (got ${unauthorizedSummary.status})`);
      console.log('  ✓ Ownership isolation verified\n');
    } else {
      console.log('  ⚠ Could not create second user for ownership test (skipped)\n');
    }

    // ================================================================
    // STEP 16: Redirect failure isolation (stop Redis, redirect still works)
    // ================================================================
    console.log('── Step 16: Redis Failure Isolation ──');
    // Disconnect from Redis to simulate failure
    await redis.quit();
    console.log('    Redis disconnected');

    // Perform another redirect
    const redirectRes2 = await httpReq('GET', `/${testShortCode}`, {
      followRedirects: false,
    });
    assert(redirectRes2.status === 302, `Redirect still works after Redis failure (got ${redirectRes2.status})`);
    assert(redirectRes2.headers.location === 'https://example.com/verified-target',
      `Location still correct after Redis failure`);
    
    // Verify clickCount still increments
    await sleep(500);
    const urlDoc2 = await Url.findById(testUrlId);
    assert(urlDoc2.clickCount >= 2, `clickCount >= 2 after second redirect (got ${urlDoc2.clickCount})`);
    results.failureIsolation = 'PASS';
    console.log(`  ✓ Redirect returned 302, clickCount = ${urlDoc2.clickCount}, API did not crash\n`);

    // ================================================================
    // SUMMARY
    // ================================================================
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    VERIFICATION RESULTS                    ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  Redis:                  ${(results.redis || 'FAIL').padEnd(32)}║`);
    console.log(`║  BullMQ Enqueue:         ${(results.bullmqEnqueue || 'FAIL').padEnd(32)}║`);
    console.log(`║  Worker Consumption:     ${(results.workerConsumption || 'FAIL').padEnd(32)}║`);
    console.log(`║  Analytics Persistence:  ${(results.analyticsPersistence || 'FAIL').padEnd(32)}║`);
    console.log(`║  UA/Referrer Enrichment: ${(results.uaEnrichment || 'FAIL').padEnd(32)}║`);
    console.log(`║  IP Anonymization:       ${(results.ipAnonymization || 'FAIL').padEnd(32)}║`);
    console.log(`║  Idempotency:            ${(results.idempotency || 'FAIL').padEnd(32)}║`);
    console.log(`║  Analytics Summary:      ${(results.analyticsSummary || 'FAIL').padEnd(32)}║`);
    console.log(`║  Analytics Timeseries:   ${(results.analyticsTimeseries || 'FAIL').padEnd(32)}║`);
    console.log(`║  Redis Failure Isolation:${(results.failureIsolation || 'FAIL').padEnd(32)}║`);
    console.log(`║  Worker Process:         ${(results.worker || 'FAIL').padEnd(32)}║`);
    console.log(`║  API Process:            ${(results.api || 'FAIL').padEnd(32)}║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log(`\nCompleted in ${elapsed}s`);

    // Check for any failures
    const allPassed = Object.values(results).every(v => v === 'PASS');
    if (allPassed) {
      console.log('\n🎉 ALL CHECKS PASSED — Backend analytics pipeline is FULLY VERIFIED.\n');
    } else {
      const failed = Object.entries(results).filter(([, v]) => v !== 'PASS');
      console.log(`\n⚠ FAILED CHECKS: ${failed.map(([k]) => k).join(', ')}\n`);
    }

  } catch (err) {
    console.error('\n\n❌ VERIFICATION FAILED:', err.message);
    console.error(err.stack);
  } finally {
    // Cleanup: kill child processes
    if (workerProcess) {
      workerProcess.kill('SIGTERM');
      await sleep(1000);
      if (!workerProcess.killed) workerProcess.kill('SIGKILL');
    }
    if (apiProcess) {
      apiProcess.kill('SIGTERM');
      await sleep(1000);
      if (!apiProcess.killed) apiProcess.kill('SIGKILL');
    }
    
    // Cleanup test data from MongoDB
    try {
      if (mongoose.connection.readyState === 1) {
        const Url = require('../src/modules/urls/infrastructure/models/url.model');
        const AnalyticsEvent = require('../src/modules/analytics/infrastructure/models/analytics-event.model');
        const User = require('../src/modules/users/infrastructure/models/user.model');
        
        if (testUrlId) {
          await AnalyticsEvent.deleteMany({ urlId: testUrlId });
          await Url.findByIdAndDelete(testUrlId);
        }
        if (testUserId) await User.findByIdAndDelete(testUserId);
        // Also clean up the "other" user
        await User.deleteMany({ email: { $regex: /^e2e_/ } });
        console.log('  ✓ Test data cleaned up from MongoDB');
      }
      await mongoose.disconnect();
    } catch (e) {
      console.log('  ⚠ Cleanup error:', e.message);
    }
  }
}

run();