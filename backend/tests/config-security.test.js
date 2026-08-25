// Isolated config-loading tests. Uses jest.resetModules + a dotenv mock so the
// real .env file cannot interfere with simulated environments.
//
// NOTE: this file must not require any other app module that caches config.

describe('Production JWT secret hardening', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
    jest.dontMock('dotenv');
  });

  function loadConfig(envOverrides = {}) {
    jest.resetModules();
    // Prevent the real .env from re-populating deleted variables
    jest.doMock('dotenv', () => ({ config: () => ({}) }));

    process.env.NODE_ENV = 'production';
    process.env.PORT = '5000';
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test_db';
    process.env.TRUST_PROXY = 'false';
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;

    Object.assign(process.env, envOverrides);

    try {
      require('../src/config');
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  }

  const STRONG_A = 'a'.repeat(48);
  const STRONG_B = 'b'.repeat(48);

  test('rejects production start with missing JWT_ACCESS_SECRET', () => {
    const result = loadConfig({ JWT_REFRESH_SECRET: STRONG_B });

    expect(result.ok).toBe(false);
    expect(result.error.message).toMatch(/JWT_ACCESS_SECRET/);
  });

  test('rejects production start with missing JWT_REFRESH_SECRET', () => {
    const result = loadConfig({ JWT_ACCESS_SECRET: STRONG_A });

    expect(result.ok).toBe(false);
    expect(result.error.message).toMatch(/JWT_REFRESH_SECRET/);
  });

  test('rejects short access secret in production', () => {
    const result = loadConfig({
      JWT_ACCESS_SECRET: 'tooshort',
      JWT_REFRESH_SECRET: STRONG_B,
    });

    expect(result.ok).toBe(false);
    expect(result.error.message).toMatch(/JWT_ACCESS_SECRET.*32 characters/);
  });

  test('rejects short refresh secret in production', () => {
    const result = loadConfig({
      JWT_ACCESS_SECRET: STRONG_A,
      JWT_REFRESH_SECRET: 'tooshort',
    });

    expect(result.ok).toBe(false);
    expect(result.error.message).toMatch(/JWT_REFRESH_SECRET.*32 characters/);
  });

  test('rejects identical access and refresh secrets in production', () => {
    const same = 'x'.repeat(48);
    const result = loadConfig({ JWT_ACCESS_SECRET: same, JWT_REFRESH_SECRET: same });

    expect(result.ok).toBe(false);
    expect(result.error.message).toMatch(/must be different/);
  });

  test('rejects known-weak secret values in production', () => {
    // Exact denylist value (also below minimum length — length fires first,
    // but either way production must refuse to start)
    const weak = loadConfig({
      JWT_ACCESS_SECRET: 'CHANGEME',
      JWT_REFRESH_SECRET: STRONG_B,
    });
    expect(weak.ok).toBe(false);
    expect(weak.error.message).toMatch(/32 characters|known-weak/);
  });

  test('accepts a secret of exactly 32 characters in production', () => {
    const result = loadConfig({
      JWT_ACCESS_SECRET: 'c'.repeat(32),
      JWT_REFRESH_SECRET: STRONG_B,
    });

    expect(result.ok).toBe(true);
  });

  test('accepts valid distinct production secrets', () => {
    const result = loadConfig({
      JWT_ACCESS_SECRET: STRONG_A,
      JWT_REFRESH_SECRET: STRONG_B,
    });

    expect(result.ok).toBe(true);
  });

  test('development starts without any JWT secrets configured', () => {
    jest.resetModules();
    jest.doMock('dotenv', () => ({ config: () => ({}) }));

    process.env.NODE_ENV = 'development';
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test_db';
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;

    let loaded;
    try {
      loaded = require('../src/config');
    } catch (error) {
      loaded = { failed: error };
    }

    expect(loaded.failed).toBeUndefined();
    expect(typeof loaded.auth.getAccessTokenSecret).toBe('function');
  });
});
