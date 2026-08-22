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

    test('error response uses { message } at top level (not nested)', async () => {
      const res = await request(app).get('/api/v1/nonexistent');
      expect(res.body).toHaveProperty('message');
      expect(res.body).not.toHaveProperty('error');
    });

    test('unauthenticated access to protected endpoint returns 401', async () => {
      const res = await request(app).get('/api/v1/urls');
      expect(res.statusCode).toBe(401);
      expect(res.body.message).toBeDefined();
    });

    test('malformed ObjectId returns 400', async () => {
      const token = require('../src/modules/auth/infrastructure/jwt/token.service').generateAccessToken('testuser');
      const res = await request(app)
        .get('/api/v1/urls/not-a-valid-id')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBeDefined();
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

  describe('Public URL Shortening Endpoint', () => {
    test('POST /api/v1/public/urls creates short URL without authentication', async () => {
      const mockUrl = {
        _id: '507f1f77bcf86cd799439011',
        owner: null,
        originalUrl: 'https://example.com/public-test',
        shortCode: 'pubTest1',
        clickCount: 0,
        isActive: true,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const UrlRepository = require('../src/modules/urls/infrastructure/repositories/url.repository');
      jest.spyOn(UrlRepository.prototype, 'existsByShortCode').mockResolvedValue(false);
      jest.spyOn(UrlRepository.prototype, 'create').mockResolvedValue(mockUrl);

      const res = await request(app)
        .post('/api/v1/public/urls')
        .send({ originalUrl: 'https://example.com/public-test' });

      expect(res.statusCode).toBe(201);
      expect(res.body.url).toBeDefined();
      expect(res.body.url.shortCode).toBe('pubTest1');
      expect(res.body.url.owner).toBeNull();
    });

    test('POST /api/v1/public/urls rejects invalid URL', async () => {
      const res = await request(app)
        .post('/api/v1/public/urls')
        .send({ originalUrl: 'not-a-valid-url' });

      expect(res.statusCode).toBe(400);
    });

    test('POST /api/v1/public/urls ignores unsupported fields like customAlias', async () => {
      const mockUrl = {
        _id: '507f1f77bcf86cd799439012',
        owner: null,
        originalUrl: 'https://example.com/ignored-fields',
        shortCode: 'pubTest2',
        clickCount: 0,
        isActive: true,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const UrlRepository = require('../src/modules/urls/infrastructure/repositories/url.repository');
      jest.spyOn(UrlRepository.prototype, 'existsByShortCode').mockResolvedValue(false);
      jest.spyOn(UrlRepository.prototype, 'create').mockResolvedValue(mockUrl);

      const res = await request(app)
        .post('/api/v1/public/urls')
        .send({ originalUrl: 'https://example.com/ignored-fields', customAlias: 'should-be-ignored', title: 'ignored' });

      expect(res.statusCode).toBe(201);
      expect(res.body.url.shortCode).toBe('pubTest2');
    });
  });
});
