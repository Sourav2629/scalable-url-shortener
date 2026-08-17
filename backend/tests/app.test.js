const request = require('supertest');
const app = require('../src/app');
const UrlRepository = require('../src/modules/urls/infrastructure/repositories/url.repository');

describe('App Infrastructure & Routing', () => {
  describe('Health Endpoints', () => {
    test('GET /health returns 200 OK', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ status: 'OK' });
    });

    test('GET /health/live returns 200 ALIVE', async () => {
      const res = await request(app).get('/health/live');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ status: 'ALIVE' });
    });

    test('GET /health/ready returns 503 UNAVAILABLE when database is disconnected', async () => {
      const res = await request(app).get('/health/ready');
      expect(res.statusCode).toBe(503);
      expect(res.body.status).toBe('UNAVAILABLE');
    });
  });

  describe('404 & Global Error Handling', () => {
    test('GET /api/v1/nonexistent returns 404 Route not found', async () => {
      const res = await request(app).get('/api/v1/nonexistent');
      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ message: 'Route not found' });
    });

    test('GET /nonexistent-page-route returns 404 for public redirect route', async () => {
      jest.spyOn(UrlRepository.prototype, 'findByShortCode').mockResolvedValue(null);
      const res = await request(app).get('/nonexistent-page-route');
      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ message: 'URL not found.' });
    });
  });

  describe('CORS behavior', () => {
    test('OPTIONS preflight request returns CORS headers', async () => {
      const res = await request(app)
        .options('/api/v1/auth/login')
        .set('Origin', 'http://example.com')
        .set('Access-Control-Request-Method', 'POST');
      expect(res.headers['access-control-allow-origin']).toBe('http://example.com');
    });
  });
});
