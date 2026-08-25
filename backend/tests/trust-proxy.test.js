const express = require('express');
const request = require('supertest');

// ─── Config parsing tests ─────────────────────────────────────

describe('Trust Proxy Configuration', () => {
  // Save and restore original env
  const originalEnv = process.env.TRUST_PROXY;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.TRUST_PROXY;
    } else {
      process.env.TRUST_PROXY = originalEnv;
    }
  });

  test('config defaults to false when TRUST_PROXY is not set', () => {
    delete process.env.TRUST_PROXY;
    // Re-require to pick up the env change
    delete require.cache[require.resolve('../src/config')];
    const config = require('../src/config');
    expect(config.server.getTrustProxy()).toBe(false);
  });

  test('TRUST_PROXY=false results in false', () => {
    process.env.TRUST_PROXY = 'false';
    delete require.cache[require.resolve('../src/config')];
    const config = require('../src/config');
    expect(config.server.getTrustProxy()).toBe(false);
  });

  test('TRUST_PROXY=true results in true', () => {
    process.env.TRUST_PROXY = 'true';
    delete require.cache[require.resolve('../src/config')];
    const config = require('../src/config');
    expect(config.server.getTrustProxy()).toBe(true);
  });

  test('TRUST_PROXY=1 results in 1', () => {
    process.env.TRUST_PROXY = '1';
    delete require.cache[require.resolve('../src/config')];
    const config = require('../src/config');
    expect(config.server.getTrustProxy()).toBe(1);
  });

  test('TRUST_PROXY=2 results in 2', () => {
    process.env.TRUST_PROXY = '2';
    delete require.cache[require.resolve('../src/config')];
    const config = require('../src/config');
    expect(config.server.getTrustProxy()).toBe(2);
  });

  test('TRUST_PROXY=0 results in 0 (equivalent to false)', () => {
    process.env.TRUST_PROXY = '0';
    delete require.cache[require.resolve('../src/config')];
    const config = require('../src/config');
    expect(config.server.getTrustProxy()).toBe(0);
  });

  test('invalid string value throws an error', () => {
    process.env.TRUST_PROXY = 'invalid';
    delete require.cache[require.resolve('../src/config')];
    const config = require('../src/config');
    expect(() => config.server.getTrustProxy()).toThrow(/TRUST_PROXY must be/);
  });

  test('negative number throws an error', () => {
    process.env.TRUST_PROXY = '-1';
    delete require.cache[require.resolve('../src/config')];
    const config = require('../src/config');
    expect(() => config.server.getTrustProxy()).toThrow(/TRUST_PROXY must be/);
  });

  test('float throws an error', () => {
    process.env.TRUST_PROXY = '1.5';
    delete require.cache[require.resolve('../src/config')];
    const config = require('../src/config');
    expect(() => config.server.getTrustProxy()).toThrow(/TRUST_PROXY must be/);
  });
});

// ─── Express trust proxy behavior tests ───────────────────────

describe('Express Trust Proxy Behavior', () => {
  test('trust proxy false: req.ip does not use X-Forwarded-For', async () => {
    const app = express();
    app.set('trust proxy', false);
    app.get('/ip', (req, res) => res.json({ ip: req.ip }));

    const res = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', '203.0.113.10')
      .expect(200);

    // With trust proxy false, X-Forwarded-For should NOT be trusted
    // req.ip should be the direct connection IP (127.0.0.1 or ::1)
    expect(res.body.ip).not.toBe('203.0.113.10');
  });

  test('trust proxy 1: req.ip resolves from X-Forwarded-For', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.get('/ip', (req, res) => res.json({ ip: req.ip }));

    const res = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', '203.0.113.10')
      .expect(200);

    // With trust proxy 1 and a single forwarded IP, Express resolves the client IP
    // from the X-Forwarded-For header
    expect(res.body.ip).toBe('203.0.113.10');
  });

  test('trust proxy false: multiple forwarded IPs are ignored', async () => {
    const app = express();
    app.set('trust proxy', false);
    app.get('/ip', (req, res) => res.json({ ip: req.ip }));

    const res = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', '10.0.0.1, 10.0.0.2, 203.0.113.10')
      .expect(200);

    // Should NOT resolve to any forwarded IP
    expect(res.body.ip).not.toBe('203.0.113.10');
    expect(res.body.ip).not.toBe('10.0.0.1');
  });

  test('app.js sets trust proxy from config', () => {
    // Verify the app.js source code contains the trust proxy configuration
    const fs = require('fs');
    const path = require('path');
    const appSource = fs.readFileSync(
      path.join(__dirname, '../src/app.js'),
      'utf8'
    );

    expect(appSource).toContain("app.set('trust proxy'");
    expect(appSource).toContain('config.server.getTrustProxy()');
  });

  test('trust proxy is configured before middleware', () => {
    const fs = require('fs');
    const path = require('path');
    const appSource = fs.readFileSync(
      path.join(__dirname, '../src/app.js'),
      'utf8'
    );

    const trustProxyLine = appSource.indexOf("app.set('trust proxy'");
    const helmetLine = appSource.indexOf('app.use(helmet())');

    // trust proxy must be set before helmet and other middleware
    expect(trustProxyLine).toBeGreaterThan(-1);
    expect(helmetLine).toBeGreaterThan(-1);
    expect(trustProxyLine).toBeLessThan(helmetLine);
  });
});
