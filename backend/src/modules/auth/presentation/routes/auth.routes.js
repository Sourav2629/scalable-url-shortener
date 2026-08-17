const express = require('express');
const AuthService = require('../../application/auth.service');
const tokenService = require('../../infrastructure/jwt/token.service');
const createAuthController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validateCredentials } = require('../validators/auth.validator');
const UserRepository = require('../../../users/infrastructure/repositories/user.repository');

const router = express.Router();
const userRepository = new UserRepository();
const authService = new AuthService(userRepository, tokenService);
const authController = createAuthController(authService);

router.post('/register', validateCredentials, authController.register);
router.post('/login', validateCredentials, authController.login);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getCurrentUser);

module.exports = router;
