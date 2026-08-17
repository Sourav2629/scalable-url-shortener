const request = require('supertest');
const app = require('../src/app');

describe('Health Endpoints', () => {
  test('GET /health should return 200 OK', async () => {
    const response = await request(app).get('/health');
    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe('OK');
  });

  test('GET /health/live should return 200 ALIVE', async () => {
    const response = await request(app).get('/health/live');
    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe('ALIVE');
  });
});
