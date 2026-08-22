const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';

const app = require('../src/app');
const tokenService = require('../src/modules/auth/infrastructure/jwt/token.service');
const { authenticate } = require('../src/modules/auth/presentation/middleware/auth.middleware');
const { validateRegister } = require('../src/modules/auth/presentation/validators/auth.validator');
const config = require('../src/config');

describe('Auth & JWT Middleware', () => {
  describe('Register Validator', () => {
    test('rejects missing or invalid email', () => {
      const req = { body: { email: 'invalid-email', password: 'password123' } };
      const next = jest.fn();
      validateRegister(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects short password (< 8 chars)', () => {
      const req = { body: { email: 'test@example.com', password: 'short' } };
      const next = jest.fn();
      validateRegister(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('normalizes valid email to lowercase and trimmed', () => {
      const req = { body: { name: 'John Doe', email: '  Test@Example.COM ', password: 'validpassword' } };
      const next = jest.fn();
      validateRegister(req, {}, next);
      expect(req.body.email).toBe('test@example.com');
      expect(req.body.name).toBe('John Doe');
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('JWT Authentication Middleware', () => {
    test('fails when Authorization header is missing', () => {
      const req = { get: () => undefined };
      const next = jest.fn();
      authenticate(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, message: 'Authentication is required.' }));
    });

    test('fails when Authorization header is malformed (not Bearer)', () => {
      const req = { get: () => 'Basic 12345' };
      const next = jest.fn();
      authenticate(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, message: 'Authentication is required.' }));
    });

    test('fails with invalid JWT token', () => {
      const req = { get: () => 'Bearer invalid.jwt.token' };
      const next = jest.fn();
      authenticate(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    });

    test('fails with expired JWT token', () => {
      const expiredToken = jwt.sign({ sub: 'user123' }, config.auth.getAccessTokenSecret(), { expiresIn: '-1s' });
      const req = { get: () => `Bearer ${expiredToken}` };
      const next = jest.fn();
      authenticate(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    });

    test('attaches userId to req.auth on valid token', () => {
      const validToken = tokenService.generateAccessToken('user123');
      const req = { get: () => `Bearer ${validToken}` };
      const next = jest.fn();
      authenticate(req, {}, next);
      expect(req.auth).toEqual({ userId: 'user123' });
      expect(next).toHaveBeenCalledWith();
    });
  });
});
