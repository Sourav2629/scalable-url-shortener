const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';

const app = require('../src/app');
const tokenService = require('../src/modules/auth/infrastructure/jwt/token.service');
const { authenticate } = require('../src/modules/auth/presentation/middleware/auth.middleware');
const { validateRegister, validateLogin } = require('../src/modules/auth/presentation/validators/auth.validator');
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

    test('accepts normal valid email', () => {
      const req = { body: { name: 'Jane', email: 'jane@example.com', password: 'password123' } };
      const next = jest.fn();
      validateRegister(req, {}, next);
      expect(req.body.email).toBe('jane@example.com');
      expect(next).toHaveBeenCalledWith();
    });

    test('rejects missing email', () => {
      const req = { body: { name: 'Jane', password: 'password123' } };
      const next = jest.fn();
      validateRegister(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects email without @ sign', () => {
      const req = { body: { name: 'Jane', email: 'test', password: 'password123' } };
      const next = jest.fn();
      validateRegister(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects email missing domain (@ only)', () => {
      const req = { body: { name: 'Jane', email: 'test@', password: 'password123' } };
      const next = jest.fn();
      validateRegister(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects email missing local part (@gmail.com)', () => {
      const req = { body: { name: 'Jane', email: '@gmail.com', password: 'password123' } };
      const next = jest.fn();
      validateRegister(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects email with spaces (test gmail.com)', () => {
      const req = { body: { name: 'Jane', email: 'test gmail.com', password: 'password123' } };
      const next = jest.fn();
      validateRegister(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects email with consecutive dots', () => {
      const req = { body: { name: 'Jane', email: 'test..user@gmail.com', password: 'password123' } };
      const next = jest.fn();
      validateRegister(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects empty string email', () => {
      const req = { body: { name: 'Jane', email: '', password: 'password123' } };
      const next = jest.fn();
      validateRegister(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects whitespace-only email', () => {
      const req = { body: { name: 'Jane', email: '   ', password: 'password123' } };
      const next = jest.fn();
      validateRegister(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects missing name', () => {
      const req = { body: { email: 'test@example.com', password: 'password123' } };
      const next = jest.fn();
      validateRegister(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects whitespace-only name', () => {
      const req = { body: { name: '   ', email: 'test@example.com', password: 'password123' } };
      const next = jest.fn();
      validateRegister(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects name exceeding 100 characters', () => {
      const req = { body: { name: 'A'.repeat(101), email: 'test@example.com', password: 'password123' } };
      const next = jest.fn();
      validateRegister(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects missing password', () => {
      const req = { body: { name: 'Jane', email: 'test@example.com' } };
      const next = jest.fn();
      validateRegister(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects whitespace-only password', () => {
      const req = { body: { name: 'Jane', email: 'test@example.com', password: '        ' } };
      const next = jest.fn();
      validateRegister(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('accepts password exactly 8 characters', () => {
      const req = { body: { name: 'Jane', email: 'test@example.com', password: '12345678' } };
      const next = jest.fn();
      validateRegister(req, {}, next);
      expect(next).toHaveBeenCalledWith();
    });

    test('rejects name that is not a string', () => {
      const req = { body: { name: 123, email: 'test@example.com', password: 'password123' } };
      const next = jest.fn();
      validateRegister(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects email that is not a string', () => {
      const req = { body: { name: 'Jane', email: 123, password: 'password123' } };
      const next = jest.fn();
      validateRegister(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects password that is not a string', () => {
      const req = { body: { name: 'Jane', email: 'test@example.com', password: 123 } };
      const next = jest.fn();
      validateRegister(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });
  });

  describe('Login Validator', () => {
    test('accepts valid email and password', () => {
      const req = { body: { email: 'test@example.com', password: 'password123' } };
      const next = jest.fn();
      validateLogin(req, {}, next);
      expect(req.body.email).toBe('test@example.com');
      expect(next).toHaveBeenCalledWith();
    });

    test('normalizes email to lowercase and trimmed', () => {
      const req = { body: { email: '  Test@EXAMPLE.COM ', password: 'password123' } };
      const next = jest.fn();
      validateLogin(req, {}, next);
      expect(req.body.email).toBe('test@example.com');
      expect(next).toHaveBeenCalledWith();
    });

    test('rejects missing email', () => {
      const req = { body: { password: 'password123' } };
      const next = jest.fn();
      validateLogin(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects invalid email format', () => {
      const req = { body: { email: 'not-an-email', password: 'password123' } };
      const next = jest.fn();
      validateLogin(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects email without @ sign', () => {
      const req = { body: { email: 'test', password: 'password123' } };
      const next = jest.fn();
      validateLogin(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects email missing domain', () => {
      const req = { body: { email: 'test@', password: 'password123' } };
      const next = jest.fn();
      validateLogin(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects email with consecutive dots', () => {
      const req = { body: { email: 'test..user@gmail.com', password: 'password123' } };
      const next = jest.fn();
      validateLogin(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects missing password', () => {
      const req = { body: { email: 'test@example.com' } };
      const next = jest.fn();
      validateLogin(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects short password', () => {
      const req = { body: { email: 'test@example.com', password: 'short' } };
      const next = jest.fn();
      validateLogin(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects whitespace-only password', () => {
      const req = { body: { email: 'test@example.com', password: '        ' } };
      const next = jest.fn();
      validateLogin(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects empty string email', () => {
      const req = { body: { email: '', password: 'password123' } };
      const next = jest.fn();
      validateLogin(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('rejects whitespace-only email', () => {
      const req = { body: { email: '   ', password: 'password123' } };
      const next = jest.fn();
      validateLogin(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
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

    test('attaches userId to req.auth on valid token for verified user', async () => {
      const UserRepository = require('../src/modules/users/infrastructure/repositories/user.repository');
      jest.spyOn(UserRepository.prototype, 'findById').mockResolvedValue({
        _id: 'user123',
        isEmailVerified: true,
      });

      const validToken = tokenService.generateAccessToken('user123');
      const req = { get: () => `Bearer ${validToken}` };
      const next = jest.fn();
      await authenticate(req, {}, next);
      expect(req.auth).toEqual({ userId: 'user123' });
      expect(next).toHaveBeenCalledWith();

      UserRepository.prototype.findById.mockRestore();
    });

    test('rejects valid token for unverified user with 403', async () => {
      const UserRepository = require('../src/modules/users/infrastructure/repositories/user.repository');
      jest.spyOn(UserRepository.prototype, 'findById').mockResolvedValue({
        _id: 'user123',
        isEmailVerified: false,
      });

      const validToken = tokenService.generateAccessToken('user123');
      const req = { get: () => `Bearer ${validToken}` };
      const next = jest.fn();
      await authenticate(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
      expect(req.auth).toBeUndefined();

      UserRepository.prototype.findById.mockRestore();
    });

    test('rejects valid token when user not found', async () => {
      const UserRepository = require('../src/modules/users/infrastructure/repositories/user.repository');
      jest.spyOn(UserRepository.prototype, 'findById').mockResolvedValue(null);

      const validToken = tokenService.generateAccessToken('user123');
      const req = { get: () => `Bearer ${validToken}` };
      const next = jest.fn();
      await authenticate(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
      expect(req.auth).toBeUndefined();

      UserRepository.prototype.findById.mockRestore();
    });
  });
});
