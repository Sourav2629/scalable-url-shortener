const express = require('express');
const AuthService = require('../../application/auth.service');
const tokenService = require('../../infrastructure/jwt/token.service');
const createAuthController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { loginLimiter, registerLimiter, otpLimiter, passwordResetLimiter, resendLimiter, sessionLimiter, changePasswordLimiter, deleteAccountLimiter, refreshLimiter } = require('../../../../shared/middleware/rate-limiter.middleware');
const { validateRegister, validateLogin, validateRefreshToken } = require('../validators/auth.validator');
const { validateVerifyEmail, validateResendVerification, validateForgotPassword, validateResetPassword, validateResendPasswordReset } = require('../validators/verification.validator');
const { validateUpdateProfile, validateChangePassword, validateDeleteAccount } = require('../validators/profile.validator');
const UserRepository = require('../../../users/infrastructure/repositories/user.repository');
const VerificationTokenRepository = require('../../infrastructure/repositories/verification-token.repository');
const PendingRegistrationRepository = require('../../infrastructure/repositories/pending-registration.repository');
const { emailService } = require('../../../../infrastructure/email');
const UrlRepository = require('../../../urls/infrastructure/repositories/url.repository');
const { analyticsRepository } = require('../../../analytics/infrastructure/repositories/analytics.repository');

const router = express.Router();
const userRepository = new UserRepository();
const verificationTokenRepository = new VerificationTokenRepository();
const pendingRegistrationRepository = new PendingRegistrationRepository();
const urlRepository = new UrlRepository();
const authService = new AuthService(userRepository, tokenService, emailService, verificationTokenRepository, pendingRegistrationRepository, urlRepository, analyticsRepository);
const authController = createAuthController(authService);

router.post('/register', registerLimiter, validateRegister, authController.register);
router.post('/login', loginLimiter, validateLogin, authController.login);
router.post('/refresh', refreshLimiter, validateRefreshToken, authController.refresh);
router.post('/logout', sessionLimiter, authenticate, authController.logout);
router.get('/me', sessionLimiter, authenticate, authController.getCurrentUser);
router.post('/verify-email', otpLimiter, validateVerifyEmail, authController.verifyEmail);
router.post('/resend-verification', resendLimiter, validateResendVerification, authController.resendVerification);
router.post('/forgot-password', passwordResetLimiter, validateForgotPassword, authController.forgotPassword);
router.post('/reset-password', otpLimiter, validateResetPassword, authController.resetPassword);
router.post('/resend-password-reset', passwordResetLimiter, validateResendPasswordReset, authController.resendPasswordReset);
router.patch('/profile', sessionLimiter, authenticate, validateUpdateProfile, authController.updateProfile);
router.post('/change-password', changePasswordLimiter, authenticate, validateChangePassword, authController.changePassword);
router.delete('/account', deleteAccountLimiter, authenticate, validateDeleteAccount, authController.deleteAccount);

module.exports = router;
