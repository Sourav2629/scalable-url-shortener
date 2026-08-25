const request = require('supertest');
const app = require('../src/app');

describe('CORS security behavior', () => {
  test('allowed origin receives CORS headers and succeeds', async () => {
    const res = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', 'http://example.com')
      .set('Access-Control-Request-Method', 'POST');

    expect(res.statusCode).toBeLessThan(400);
    expect(res.headers['access-control-allow-origin']).toBe('http://example.com');
  });

  test('rejected origin returns a clean JSON 403 (not an unclassified 500)', async () => {
    const res = await request(app)
      .get('/health/live')
      .set('Origin', 'https://evil.example.net');

    // In test NODE_ENV the wildcard is permitted, so simulate rejection by
    // asserting through the middleware contract instead: temporarily point
    // config at an explicit origin allowlist.
    const originalGetAllowedOrigins = require('../src/config').cors.getAllowedOrigins;
    const config = require('../src/config');
    config.cors.getAllowedOrigins = () => ['http://only-this-origin.com'];

    try {
      const rejected = await request(app)
        .get('/health/live')
        .set('Origin', 'https://evil.example.net');

      expect(rejected.statusCode).toBe(403);
      expect(rejected.body).toEqual({ message: 'Not allowed by CORS' });
    } finally {
      config.cors.getAllowedOrigins = originalGetAllowedOrigins;
    }
  });

  test('missing Origin header is allowed (mobile apps / curl)', async () => {
    const res = await request(app).get('/health/live');

    // supertest sends no Origin header by default
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('does not advertise credentialed cross-origin requests', async () => {
    const res = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', 'http://example.com')
      .set('Access-Control-Request-Method', 'POST');

    // Auth uses Authorization Bearer tokens, not cookies — credentials must
    // stay disabled.
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });
});
