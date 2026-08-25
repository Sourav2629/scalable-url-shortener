const express = require('express');
const request = require('supertest');

// Set test environment before requiring the config/middleware
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test_db';

// We need to create fresh rate limiter instances per test group
// because express-rate-limit's MemoryStore persists across requests
// in the same process. We'll create a helper that builds a mini-app
// with a specific limiter.

const rateLimit = require('express-rate-limit');

function createTestLimiter(windowMs, max) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: () => 'test-ip', // fixed key for deterministic testing
    handler: (req, res) => {
      res.status(429).json({ message: 'Rate limit exceeded' });
    },
  });
}

function createTestApp(limiter) {
  const app = express();
  app.use(express.json());
  app.use('/test', limiter, (req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

describe('Rate Limiter Middleware', () => {
  // ─── Individual Limiter Isolation Tests ──────────────────────

  describe('Login Limiter', () => {
    test('returns 429 after exceeding max requests', async () => {
      const limiter = createTestLimiter(60000, 3);
      const app = createTestApp(limiter);

      // First 3 requests should succeed
      await request(app).get('/test').expect(200);
      await request(app).get('/test').expect(200);
      await request(app).get('/test').expect(200);

      // 4th request should be rate limited
      const res = await request(app).get('/test').expect(429);
      expect(res.body.message).toBe('Rate limit exceeded');
    });

    test('returns standard RateLimit headers', async () => {
      const limiter = createTestLimiter(60000, 5);
      const app = createTestApp(limiter);

      const res = await request(app).get('/test').expect(200);
      expect(res.headers['ratelimit-limit']).toBeDefined();
      expect(res.headers['ratelimit-remaining']).toBeDefined();
      expect(res.headers['ratelimit-reset']).toBeDefined();
    });
  });

  describe('Bucket Isolation', () => {
    test('login limiter and session limiter have separate buckets', async () => {
      // Create two separate limiters (simulating login vs /me)
      const loginLimiter = createTestLimiter(60000, 2);
      const sessionLimiter = createTestLimiter(60000, 5);

      const loginApp = express();
      loginApp.use(express.json());
      loginApp.use('/login', loginLimiter, (req, res) => res.status(200).json({ ok: true }));

      const sessionApp = express();
      sessionApp.use(express.json());
      sessionApp.use('/me', sessionLimiter, (req, res) => res.status(200).json({ ok: true }));

      // Exhaust login limiter (2 requests)
      await request(loginApp).get('/login').expect(200);
      await request(loginApp).get('/login').expect(200);
      await request(loginApp).get('/login').expect(429); // rate limited

      // Session limiter should still be completely available
      await request(sessionApp).get('/me').expect(200);
      await request(sessionApp).get('/me').expect(200);
      await request(sessionApp).get('/me').expect(200);
      await request(sessionApp).get('/me').expect(200);
      await request(sessionApp).get('/me').expect(200);
      await request(sessionApp).get('/me').expect(429); // now session is exhausted
    });

    test('OTP limiter does not consume login limiter bucket', async () => {
      const loginLimiter = createTestLimiter(60000, 2);
      const otpLimiter = createTestLimiter(60000, 2);

      const loginApp = express();
      loginApp.use(express.json());
      loginApp.use('/login', loginLimiter, (req, res) => res.status(200).json({ ok: true }));

      const otpApp = express();
      otpApp.use(express.json());
      otpApp.use('/verify-email', otpLimiter, (req, res) => res.status(200).json({ ok: true }));

      // Exhaust OTP limiter
      await request(otpApp).get('/verify-email').expect(200);
      await request(otpApp).get('/verify-email').expect(200);
      await request(otpApp).get('/verify-email').expect(429);

      // Login limiter should still be fully available
      await request(loginApp).get('/login').expect(200);
      await request(loginApp).get('/login').expect(200);
      await request(loginApp).get('/login').expect(429);
    });

    test('password reset limiter does not consume login limiter bucket', async () => {
      const loginLimiter = createTestLimiter(60000, 2);
      const passwordResetLimiter = createTestLimiter(60000, 2);

      const loginApp = express();
      loginApp.use(express.json());
      loginApp.use('/login', loginLimiter, (req, res) => res.status(200).json({ ok: true }));

      const resetApp = express();
      resetApp.use(express.json());
      resetApp.use('/forgot-password', passwordResetLimiter, (req, res) => res.status(200).json({ ok: true }));

      // Exhaust password reset limiter
      await request(resetApp).get('/forgot-password').expect(200);
      await request(resetApp).get('/forgot-password').expect(200);
      await request(resetApp).get('/forgot-password').expect(429);

      // Login limiter should still be fully available
      await request(loginApp).get('/login').expect(200);
      await request(loginApp).get('/login').expect(200);
      await request(loginApp).get('/login').expect(429);
    });
  });

  // ─── Exported Limiter Tests ──────────────────────────────────

  describe('Exported Limiters Exist', () => {
    test('all expected limiters are exported', () => {
      const limiters = require('../src/shared/middleware/rate-limiter.middleware');

      expect(limiters.loginLimiter).toBeDefined();
      expect(limiters.registerLimiter).toBeDefined();
      expect(limiters.otpLimiter).toBeDefined();
      expect(limiters.passwordResetLimiter).toBeDefined();
      expect(limiters.resendLimiter).toBeDefined();
      expect(limiters.sessionLimiter).toBeDefined();
      expect(limiters.changePasswordLimiter).toBeDefined();
      expect(limiters.deleteAccountLimiter).toBeDefined();
      expect(limiters.publicLimiter).toBeDefined();
      expect(limiters.publicShortenLimiter).toBeDefined();
      expect(limiters.apiLimiter).toBeDefined();
    });

    test('old authLimiter is no longer exported', () => {
      const limiters = require('../src/shared/middleware/rate-limiter.middleware');
      expect(limiters.authLimiter).toBeUndefined();
    });
  });

  // ─── Configuration Tests ─────────────────────────────────────

  describe('Configuration', () => {
    test('config has all new rate limit getters', () => {
      const config = require('../src/config');

      expect(typeof config.rateLimit.getLoginMaxRequests).toBe('function');
      expect(typeof config.rateLimit.getLoginWindowMs).toBe('function');
      expect(typeof config.rateLimit.getRegisterMaxRequests).toBe('function');
      expect(typeof config.rateLimit.getRegisterWindowMs).toBe('function');
      expect(typeof config.rateLimit.getOtpMaxRequests).toBe('function');
      expect(typeof config.rateLimit.getOtpWindowMs).toBe('function');
      expect(typeof config.rateLimit.getPasswordResetMaxRequests).toBe('function');
      expect(typeof config.rateLimit.getPasswordResetWindowMs).toBe('function');
      expect(typeof config.rateLimit.getResendMaxRequests).toBe('function');
      expect(typeof config.rateLimit.getResendWindowMs).toBe('function');
      expect(typeof config.rateLimit.getSessionMaxRequests).toBe('function');
      expect(typeof config.rateLimit.getSessionWindowMs).toBe('function');
      expect(typeof config.rateLimit.getChangePasswordMaxRequests).toBe('function');
      expect(typeof config.rateLimit.getChangePasswordWindowMs).toBe('function');
      expect(typeof config.rateLimit.getDeleteAccountMaxRequests).toBe('function');
      expect(typeof config.rateLimit.getDeleteAccountWindowMs).toBe('function');
    });

    test('config returns sensible defaults when env vars are not set', () => {
      const config = require('../src/config');

      expect(config.rateLimit.getLoginMaxRequests()).toBe(10);
      expect(config.rateLimit.getLoginWindowMs()).toBe(900000);
      expect(config.rateLimit.getRegisterMaxRequests()).toBe(5);
      expect(config.rateLimit.getSessionMaxRequests()).toBe(60);
      expect(config.rateLimit.getDeleteAccountMaxRequests()).toBe(5);
    });
  });

  // ─── App.js Route Integration Tests ──────────────────────────

  describe('Auth Route Integration', () => {
    test('app.js does not apply blanket authLimiter to auth routes', () => {
      // Read the app.js source and verify it doesn't use authLimiter
      const fs = require('fs');
      const appSource = fs.readFileSync(
        require('path').join(__dirname, '../src/app.js'),
        'utf8'
      );

      // Should NOT contain authLimiter in the auth route line
      expect(appSource).not.toMatch(/authLimiter.*authRoutes/);
      // Should contain the auth routes without authLimiter
      expect(appSource).toMatch(/authRoutes/);
    });

    test('auth.routes.js imports and applies per-route limiters', () => {
      const fs = require('fs');
      const routesSource = fs.readFileSync(
        require('path').join(__dirname, '../src/modules/auth/presentation/routes/auth.routes.js'),
        'utf8'
      );

      // Should import individual limiters
      expect(routesSource).toContain('loginLimiter');
      expect(routesSource).toContain('registerLimiter');
      expect(routesSource).toContain('otpLimiter');
      expect(routesSource).toContain('passwordResetLimiter');
      expect(routesSource).toContain('resendLimiter');
      expect(routesSource).toContain('sessionLimiter');
      expect(routesSource).toContain('changePasswordLimiter');
      expect(routesSource).toContain('deleteAccountLimiter');

      // Should NOT import old authLimiter
      expect(routesSource).not.toContain('authLimiter');
    });

    test('login route uses loginLimiter', () => {
      const fs = require('fs');
      const routesSource = fs.readFileSync(
        require('path').join(__dirname, '../src/modules/auth/presentation/routes/auth.routes.js'),
        'utf8'
      );
      expect(routesSource).toMatch(/loginLimiter.*validateLogin/);
    });

    test('register route uses registerLimiter', () => {
      const fs = require('fs');
      const routesSource = fs.readFileSync(
        require('path').join(__dirname, '../src/modules/auth/presentation/routes/auth.routes.js'),
        'utf8'
      );
      expect(routesSource).toMatch(/registerLimiter.*validateRegister/);
    });

    test('verify-email route uses otpLimiter', () => {
      const fs = require('fs');
      const routesSource = fs.readFileSync(
        require('path').join(__dirname, '../src/modules/auth/presentation/routes/auth.routes.js'),
        'utf8'
      );
      expect(routesSource).toMatch(/otpLimiter.*validateVerifyEmail/);
    });

    test('me route uses sessionLimiter', () => {
      const fs = require('fs');
      const routesSource = fs.readFileSync(
        require('path').join(__dirname, '../src/modules/auth/presentation/routes/auth.routes.js'),
        'utf8'
      );
      expect(routesSource).toMatch(/sessionLimiter.*authenticate.*getCurrentUser/);
    });

    test('forgot-password route uses passwordResetLimiter', () => {
      const fs = require('fs');
      const routesSource = fs.readFileSync(
        require('path').join(__dirname, '../src/modules/auth/presentation/routes/auth.routes.js'),
        'utf8'
      );
      expect(routesSource).toMatch(/passwordResetLimiter.*validateForgotPassword/);
    });

    test('change-password route uses changePasswordLimiter', () => {
      const fs = require('fs');
      const routesSource = fs.readFileSync(
        require('path').join(__dirname, '../src/modules/auth/presentation/routes/auth.routes.js'),
        'utf8'
      );
      expect(routesSource).toMatch(/changePasswordLimiter.*authenticate.*validateChangePassword/);
    });

    test('delete-account route uses deleteAccountLimiter', () => {
      const fs = require('fs');
      const routesSource = fs.readFileSync(
        require('path').join(__dirname, '../src/modules/auth/presentation/routes/auth.routes.js'),
        'utf8'
      );
      expect(routesSource).toMatch(/deleteAccountLimiter.*authenticate.*validateDeleteAccount/);
    });
  });
});
