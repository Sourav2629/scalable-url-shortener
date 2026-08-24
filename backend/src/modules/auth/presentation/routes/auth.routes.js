const express = require('express');
const AuthService = require('../../application/auth.service');
const tokenService = require('../../infrastructure/jwt/token.service');
const createAuthController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validateRegister, validateLogin } = require('../validators/auth.validator');
const { validateVerifyEmail, validateResendVerification, validateForgotPassword, validateResetPassword, validateResendPasswordReset } = require('../validators/verification.validator');
const UserRepository = require('../../../users/infrastructure/repositories/user.repository');
const VerificationTokenRepository = require('../../infrastructure/repositories/verification-token.repository');
const PendingRegistrationRepository = require('../../infrastructure/repositories/pending-registration.repository');
const { emailService } = require('../../../../infrastructure/email');

const router = express.Router();
const userRepository = new UserRepository();
const verificationTokenRepository = new VerificationTokenRepository();
const pendingRegistrationRepository = new PendingRegistrationRepository();
const authService = new AuthService(userRepository, tokenService, emailService, verificationTokenRepository, pendingRegistrationRepository);
const authController = createAuthController(authService);

router.post('/register', validateRegister, authController.register);
router.post('/login', validateLogin, authController.login);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getCurrentUser);
router.post('/verify-email', validateVerifyEmail, authController.verifyEmail);
router.post('/resend-verification', validateResendVerification, authController.resendVerification);
router.post('/forgot-password', validateForgotPassword, authController.forgotPassword);
router.post('/reset-password', validateResetPassword, authController.resetPassword);
router.post('/resend-password-reset', validateResendPasswordReset, authController.resendPasswordReset);

module.exports = router;
