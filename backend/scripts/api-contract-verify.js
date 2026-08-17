/**
 * LinkSphere Frontend API Contract Verification Script
 * 
 * Verifies every endpoint against the live Express backend, MongoDB, and Redis/BullMQ.
 */

const { fork } = require('child_process');
const http = require('http');
const mongoose = require('mongoose');

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
      const location = res.headers.location;
      const statusCode = res.statusCode;

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

const testLog = [];

function recordTest(category, name, reqInfo, status, body, isCorrect, notes = '') {
  const record = {
    category,
    name,
    request: `${reqInfo.method} ${reqInfo.path}`,
    status,
    body: typeof body === 'object' ? JSON.stringify(body) : String(body),
    isCorrect,
    notes,
  };
  testLog.push(record);
  const symbol = isCorrect ? '✓' : '❌';
  console.log(`  ${symbol} [${category}] ${name} -> Status: ${status} (${isCorrect ? 'PASS' : 'FAIL'})`);
  if (!isCorrect) {
    console.log(`     Got response:`, JSON.stringify(body));
  }
}

async function run() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   LinkSphere Frontend API Contract Verification Suite        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  let workerProcess = null;
  let apiProcess = null;

  try {
    // ----------------------------------------------------------------
    // Setup background worker and API server
    // ----------------------------------------------------------------
    console.log('── Starting Infrastructure Processes ──');
    
    // Worker process
    await new Promise((resolve, reject) => {
      workerProcess = fork('./src/workers/analytics.worker.js', [], {
        cwd: __dirname + '/..',
        env: { ...process.env, NODE_ENV: 'development' },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      let ready = false;
      workerProcess.stdout.on('data', (data) => {
        if (data.toString().includes('Connected to MongoDB') && !ready) {
          ready = true;
          setTimeout(resolve, 500);
        }
      });
      workerProcess.on('error', reject);
      setTimeout(() => { if (!ready) reject(new Error('Worker timeout')); }, 15000);
    });
    console.log('  ✓ Worker started');

    // API process
    await new Promise((resolve, reject) => {
      apiProcess = fork('./src/server.js', [], {
        cwd: __dirname + '/..',
        env: { ...process.env, NODE_ENV: 'development', PORT: '5000' },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      let ready = false;
      apiProcess.stdout.on('data', (data) => {
        if ((data.toString().includes('Server running') || data.toString().includes('MongoDB connected')) && !ready) {
          ready = true;
          setTimeout(resolve, 500);
        }
      });
      apiProcess.on('error', reject);
      setTimeout(() => { if (!ready) reject(new Error('API timeout')); }, 15000);
    });
    console.log('  ✓ API server started\n');

    // ----------------------------------------------------------------
    // SECTION 1: Health Endpoints
    // ----------------------------------------------------------------
    console.log('── 1. Health Endpoints ──');
    
    const h1 = await httpReq('GET', '/health');
    recordTest('HEALTH', 'GET /health', { method: 'GET', path: '/health' }, h1.status, h1.body,
      h1.status === 200 && h1.body && h1.body.status === 'OK', 'Returns status OK');

    const h2 = await httpReq('GET', '/health/live');
    recordTest('HEALTH', 'GET /health/live', { method: 'GET', path: '/health/live' }, h2.status, h2.body,
      h2.status === 200 && h2.body && h2.body.status === 'ALIVE', 'Returns status ALIVE');

    const h3 = await httpReq('GET', '/health/ready');
    recordTest('HEALTH', 'GET /health/ready', { method: 'GET', path: '/health/ready' }, h3.status, h3.body,
      h3.status === 200 && h3.body && h3.body.status === 'READY' && h3.body.database === 'connected', 'Returns DB connected status');

    console.log('');

    // ----------------------------------------------------------------
    // SECTION 2: Authentication Lifecycle
    // ----------------------------------------------------------------
    console.log('── 2. Auth Lifecycle ──');

    const ts = Date.now();
    const email1 = `contract_user_${ts}@test.com`;
    const password = 'Password123!';

    // Register User 1
    const regRes = await httpReq('POST', '/api/v1/auth/register', {
      body: { email: email1, password, name: 'Contract User One' }
    });
    const regToken = regRes.body && regRes.body.tokens ? regRes.body.tokens.accessToken : null;
    const user1Id = regRes.body && regRes.body.user ? regRes.body.user.id : null;
    recordTest('AUTH', 'Register User 1', { method: 'POST', path: '/api/v1/auth/register' }, regRes.status, regRes.body,
      regRes.status === 201 && !!regToken && !!user1Id, 'Returns 201 with user object and tokens');

    // Login User 1
    const loginRes = await httpReq('POST', '/api/v1/auth/login', {
      body: { email: email1, password }
    });
    const user1Token = loginRes.body && loginRes.body.tokens ? loginRes.body.tokens.accessToken : null;
    recordTest('AUTH', 'Login User 1', { method: 'POST', path: '/api/v1/auth/login' }, loginRes.status, loginRes.body,
      loginRes.status === 200 && !!user1Token, 'Returns 200 with JWT access token');

    // Get Current User (GET /auth/me)
    const meRes = await httpReq('GET', '/api/v1/auth/me', { token: user1Token });
    recordTest('AUTH', 'Get Current User (/auth/me)', { method: 'GET', path: '/api/v1/auth/me' }, meRes.status, meRes.body,
      meRes.status === 200 && meRes.body && meRes.body.user && meRes.body.user.email === email1, 'Returns 200 with user profile');

    // Logout User 1
    const logoutRes = await httpReq('POST', '/api/v1/auth/logout', { token: user1Token });
    recordTest('AUTH', 'Logout User 1', { method: 'POST', path: '/api/v1/auth/logout' }, logoutRes.status, logoutRes.body,
      logoutRes.status === 204, 'Returns 204 No Content');

    console.log('');

    // ----------------------------------------------------------------
    // SECTION 3: URL Lifecycle
    // ----------------------------------------------------------------
    console.log('── 3. URL Lifecycle ──');

    let createdUrlId = null;
    let createdShortCode = null;

    // Create URL
    const createRes = await httpReq('POST', '/api/v1/urls', {
      token: user1Token,
      body: {
        originalUrl: 'https://example.com/target-page-1',
        title: 'Primary Target URL',
        description: 'Used for contract verification',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }
    });
    if (createRes.body && createRes.body.url) {
      createdUrlId = createRes.body.url.id;
      createdShortCode = createRes.body.url.shortCode;
    }
    recordTest('URL', 'Create URL', { method: 'POST', path: '/api/v1/urls' }, createRes.status, createRes.body,
      createRes.status === 201 && !!createdUrlId && !!createdShortCode, 'Returns 201 with created URL object');

    // Create URL with customAlias
    const createAliasRes = await httpReq('POST', '/api/v1/urls', {
      token: user1Token,
      body: {
        originalUrl: 'https://example.com/target-page-custom',
        customAlias: 'my-custom-alias',
      }
    });
    recordTest('URL', 'Create URL with valid customAlias', { method: 'POST', path: '/api/v1/urls' }, createAliasRes.status, createAliasRes.body,
      createAliasRes.status === 201 && createAliasRes.body?.url?.shortCode === 'my-custom-alias', 'Returns 201 with shortCode equal to customAlias');

    // Create URL with duplicate customAlias (should fail with 409)
    const createDupAliasRes = await httpReq('POST', '/api/v1/urls', {
      token: user1Token,
      body: {
        originalUrl: 'https://example.com/another-target',
        customAlias: 'my-custom-alias',
      }
    });
    recordTest('URL', 'Create URL with duplicate customAlias (409)', { method: 'POST', path: '/api/v1/urls' }, createDupAliasRes.status, createDupAliasRes.body,
      createDupAliasRes.status === 409, 'Returns 409 Conflict when customAlias is already taken');

    // Create URL with reserved customAlias (should fail with 400)
    const createReservedAliasRes = await httpReq('POST', '/api/v1/urls', {
      token: user1Token,
      body: {
        originalUrl: 'https://example.com/reserved-target',
        customAlias: 'analytics',
      }
    });
    recordTest('URL', 'Create URL with reserved customAlias (400)', { method: 'POST', path: '/api/v1/urls' }, createReservedAliasRes.status, createReservedAliasRes.body,
      createReservedAliasRes.status === 400, 'Returns 400 Bad Request when customAlias is reserved');

    // List URLs
    const listRes = await httpReq('GET', '/api/v1/urls', { token: user1Token });
    recordTest('URL', 'List User URLs', { method: 'GET', path: '/api/v1/urls' }, listRes.status, listRes.body,
      listRes.status === 200 && Array.isArray(listRes.body.urls) && listRes.body.urls.length >= 2, 'Returns 200 with list of URLs');

    // Get URL details by ID
    const getByIdRes = await httpReq('GET', `/api/v1/urls/${createdUrlId}`, { token: user1Token });
    recordTest('URL', 'Get URL Details by ID', { method: 'GET', path: `/api/v1/urls/${createdUrlId}` }, getByIdRes.status, getByIdRes.body,
      getByIdRes.status === 200 && getByIdRes.body.url && getByIdRes.body.url.id === createdUrlId, 'Returns 200 with URL detail object');

    // Update URL
    const updateRes = await httpReq('PATCH', `/api/v1/urls/${createdUrlId}`, {
      token: user1Token,
      body: { title: 'Updated Target Title', isActive: true }
    });
    recordTest('URL', 'Update URL', { method: 'PATCH', path: `/api/v1/urls/${createdUrlId}` }, updateRes.status, updateRes.body,
      updateRes.status === 200 && updateRes.body.url && updateRes.body.url.title === 'Updated Target Title', 'Returns 200 with updated fields');

    console.log('');

    // ----------------------------------------------------------------
    // SECTION 4: Public Shortcode Redirect
    // ----------------------------------------------------------------
    console.log('── 4. Public Shortcode Redirect ──');

    const redirectRes = await httpReq('GET', `/${createdShortCode}`, { followRedirects: false });
    recordTest('REDIRECT', 'Public Redirect (HTTP 302)', { method: 'GET', path: `/${createdShortCode}` }, redirectRes.status, redirectRes.headers,
      redirectRes.status === 302 && redirectRes.headers.location === 'https://example.com/target-page-1', 'Returns 302 with correct Location header');

    console.log('');

    // ----------------------------------------------------------------
    // SECTION 5: Analytics
    // ----------------------------------------------------------------
    console.log('── 5. Analytics Pipeline & Queries ──');

    // Wait for BullMQ worker to process event
    await sleep(1500);

    // Summary API
    const summaryRes = await httpReq('GET', `/api/v1/urls/${createdUrlId}/analytics/summary`, { token: user1Token });
    recordTest('ANALYTICS', 'Get Analytics Summary', { method: 'GET', path: `/api/v1/urls/${createdUrlId}/analytics/summary` }, summaryRes.status, summaryRes.body,
      summaryRes.status === 200 && summaryRes.body.totalClicks >= 1 && Array.isArray(summaryRes.body.topBrowsers), 'Returns 200 with totalClicks and breakdown arrays');

    // Timeseries API - Day Interval
    const now = new Date();
    const fromStr = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const toStr = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const tsDayRes = await httpReq('GET', `/api/v1/urls/${createdUrlId}/analytics/timeseries?from=${fromStr}&to=${toStr}&interval=day`, { token: user1Token });
    recordTest('ANALYTICS', 'Get Timeseries (interval=day)', { method: 'GET', path: `/api/v1/urls/${createdUrlId}/analytics/timeseries` }, tsDayRes.status, tsDayRes.body,
      tsDayRes.status === 200 && tsDayRes.body.interval === 'day' && Array.isArray(tsDayRes.body.data) && tsDayRes.body.data.length >= 1, 'Returns 200 with daily bucket array');

    // Timeseries API - Hour Interval
    const tsHourRes = await httpReq('GET', `/api/v1/urls/${createdUrlId}/analytics/timeseries?from=${fromStr}&to=${toStr}&interval=hour`, { token: user1Token });
    recordTest('ANALYTICS', 'Get Timeseries (interval=hour)', { method: 'GET', path: `/api/v1/urls/${createdUrlId}/analytics/timeseries` }, tsHourRes.status, tsHourRes.body,
      tsHourRes.status === 200 && tsHourRes.body.interval === 'hour' && Array.isArray(tsHourRes.body.data) && tsHourRes.body.data.length >= 1, 'Returns 200 with hourly bucket array');

    console.log('');

    // ----------------------------------------------------------------
    // SECTION 6: Delete URL
    // ----------------------------------------------------------------
    console.log('── 6. Delete URL ──');

    const deleteRes = await httpReq('DELETE', `/api/v1/urls/${createdUrlId}`, { token: user1Token });
    recordTest('URL', 'Delete URL by ID', { method: 'DELETE', path: `/api/v1/urls/${createdUrlId}` }, deleteRes.status, deleteRes.body,
      deleteRes.status === 204, 'Returns 204 No Content');

    // Confirm soft delete: Get by ID should return 404
    const getDeletedRes = await httpReq('GET', `/api/v1/urls/${createdUrlId}`, { token: user1Token });
    recordTest('URL', 'Get Soft-Deleted URL returns 404', { method: 'GET', path: `/api/v1/urls/${createdUrlId}` }, getDeletedRes.status, getDeletedRes.body,
      getDeletedRes.status === 404, 'Returns 404 for soft-deleted URL');

    console.log('');

    // ----------------------------------------------------------------
    // SECTION 7: Security, Ownership & Error Edge Cases
    // ----------------------------------------------------------------
    console.log('── 7. Security & Error Edge Cases ──');

    // Register User 2 for ownership testing
    const email2 = `contract_user2_${ts}@test.com`;
    const reg2Res = await httpReq('POST', '/api/v1/auth/register', {
      body: { email: email2, password, name: 'Contract User Two' }
    });
    const user2Token = reg2Res.body && reg2Res.body.tokens ? reg2Res.body.tokens.accessToken : null;

    // Create a URL owned by User 2
    const url2Res = await httpReq('POST', '/api/v1/urls', {
      token: user2Token,
      body: { originalUrl: 'https://example.com/user2-target', title: 'User 2 URL' }
    });
    const user2UrlId = url2Res.body.url.id;

    // 1. Request protected endpoint without JWT
    const noJwtRes = await httpReq('GET', '/api/v1/urls');
    recordTest('SECURITY', 'Protected route without JWT', { method: 'GET', path: '/api/v1/urls' }, noJwtRes.status, noJwtRes.body,
      noJwtRes.status === 401, 'Returns 401 Unauthorized');

    // 2. Request with invalid JWT
    const invalidJwtRes = await httpReq('GET', '/api/v1/urls', { token: 'invalid.jwt.token.here' });
    recordTest('SECURITY', 'Protected route with invalid JWT', { method: 'GET', path: '/api/v1/urls' }, invalidJwtRes.status, invalidJwtRes.body,
      invalidJwtRes.status === 401, 'Returns 401 Unauthorized');

    // 3. User 1 accessing User 2's URL
    const wrongOwnerUrlRes = await httpReq('GET', `/api/v1/urls/${user2UrlId}`, { token: user1Token });
    recordTest('SECURITY', 'Access another user\'s URL', { method: 'GET', path: `/api/v1/urls/${user2UrlId}` }, wrongOwnerUrlRes.status, wrongOwnerUrlRes.body,
      wrongOwnerUrlRes.status === 404, 'Returns 404 (Ownership Isolation)');

    // 4. User 1 accessing User 2's analytics summary
    const wrongOwnerAnalyticsRes = await httpReq('GET', `/api/v1/urls/${user2UrlId}/analytics/summary`, { token: user1Token });
    recordTest('SECURITY', 'Access another user\'s analytics', { method: 'GET', path: `/api/v1/urls/${user2UrlId}/analytics/summary` }, wrongOwnerAnalyticsRes.status, wrongOwnerAnalyticsRes.body,
      wrongOwnerAnalyticsRes.status === 404, 'Returns 404 (Ownership Isolation)');

    // 5. Invalid Mongo ObjectId parameter
    const invalidObjectIdRes = await httpReq('GET', '/api/v1/urls/invalid-mongo-id', { token: user1Token });
    recordTest('ERRORS', 'Invalid Mongo ObjectId parameter', { method: 'GET', path: '/api/v1/urls/invalid-mongo-id' }, invalidObjectIdRes.status, invalidObjectIdRes.body,
      invalidObjectIdRes.status === 400, 'Returns 400 Bad Request');

    // 6. Non-existent valid Mongo ObjectId
    const nonExistentIdRes = await httpReq('GET', '/api/v1/urls/64f1a2b3c4d5e6f7a8b9c0d1', { token: user1Token });
    recordTest('ERRORS', 'Non-existent URL ID', { method: 'GET', path: '/api/v1/urls/64f1a2b3c4d5e6f7a8b9c0d1' }, nonExistentIdRes.status, nonExistentIdRes.body,
      nonExistentIdRes.status === 404, 'Returns 404 Not Found');

    // 7. Invalid request body for URL creation
    const invalidBodyRes = await httpReq('POST', '/api/v1/urls', {
      token: user1Token,
      body: { originalUrl: 'not-a-valid-url' }
    });
    recordTest('ERRORS', 'Invalid originalUrl syntax', { method: 'POST', path: '/api/v1/urls' }, invalidBodyRes.status, invalidBodyRes.body,
      invalidBodyRes.status === 400, 'Returns 400 Bad Request');

    // 8. Invalid date range (from > to)
    const invalidDateRes = await httpReq('GET', `/api/v1/urls/${user2UrlId}/analytics/timeseries?from=${toStr}&to=${fromStr}`, { token: user2Token });
    recordTest('ERRORS', 'Invalid date range (from > to)', { method: 'GET', path: `/api/v1/urls/${user2UrlId}/analytics/timeseries` }, invalidDateRes.status, invalidDateRes.body,
      invalidDateRes.status === 400, 'Returns 400 Bad Request');

    // 9. Invalid analytics interval
    const invalidIntervalRes = await httpReq('GET', `/api/v1/urls/${user2UrlId}/analytics/timeseries?from=${fromStr}&to=${toStr}&interval=year`, { token: user2Token });
    recordTest('ERRORS', 'Invalid analytics interval', { method: 'GET', path: `/api/v1/urls/${user2UrlId}/analytics/timeseries` }, invalidIntervalRes.status, invalidIntervalRes.body,
      invalidIntervalRes.status === 400, 'Returns 400 Bad Request');

    // 10. Duplicate email registration
    const dupEmailRes = await httpReq('POST', '/api/v1/auth/register', {
      body: { email: email1, password, name: 'Duplicate User' }
    });
    recordTest('ERRORS', 'Duplicate email registration', { method: 'POST', path: '/api/v1/auth/register' }, dupEmailRes.status, dupEmailRes.body,
      dupEmailRes.status === 409, 'Returns 409 Conflict');

    // 11. Invalid login credentials
    const invalidLoginRes = await httpReq('POST', '/api/v1/auth/login', {
      body: { email: email1, password: 'WrongPassword123!' }
    });
    recordTest('ERRORS', 'Invalid login credentials', { method: 'POST', path: '/api/v1/auth/login' }, invalidLoginRes.status, invalidLoginRes.body,
      invalidLoginRes.status === 401, 'Returns 401 Unauthorized');

    console.log('');

    // Summary
    const total = testLog.length;
    const passed = testLog.filter(t => t.isCorrect).length;
    const failed = total - passed;

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log(`║   SUMMARY: ${passed}/${total} TESTS PASSED                             ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    if (failed > 0) {
      console.log('FAILED TESTS:');
      testLog.filter(t => !t.isCorrect).forEach(t => {
        console.log(`  - [${t.category}] ${t.name}: Status ${t.status}, Body: ${t.body}`);
      });
    }

  } catch (err) {
    console.error('VERIFICATION SCRIPT ERROR:', err);
  } finally {
    if (workerProcess) workerProcess.kill('SIGTERM');
    if (apiProcess) apiProcess.kill('SIGTERM');
  }
}

run();
