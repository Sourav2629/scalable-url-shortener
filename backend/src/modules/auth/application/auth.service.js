const bcrypt = require('bcrypt');
const AppError = require('../../../shared/errors/app-error');

const PASSWORD_SALT_ROUNDS = 12;

function serializeUser(user) {
  return {
    id: user._id.toString(),
    email: user.email,
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

class AuthService {
  constructor(userRepository, tokenService) {
    this.userRepository = userRepository;
    this.tokenService = tokenService;
  }

  async register({ email, password }) {
    const existingUser = await this.userRepository.findByEmail(email);

    if (existingUser) {
      throw new AppError('An account with this email already exists.', 409);
    }

    const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
    let user;

    try {
      user = await this.userRepository.create({ email, password: passwordHash });
    } catch (error) {
      if (error.code === 11000) {
        throw new AppError('An account with this email already exists.', 409);
      }

      throw error;
    }

    return this.createAuthenticationResponse(user);
  }

  async login({ email, password }) {
    const user = await this.userRepository.findByEmailWithPassword(email);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new AppError('Invalid email or password.', 401);
    }

    return this.createAuthenticationResponse(user);
  }

  async logout(userId) {
    await this.userRepository.clearRefreshToken(userId);
  }

  async getCurrentUser(userId) {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new AppError('Authentication is required.', 401);
    }

    return serializeUser(user);
  }

  async createAuthenticationResponse(user) {
    const accessToken = this.tokenService.generateAccessToken(user._id);
    const refreshToken = this.tokenService.generateRefreshToken(user._id);
    const refreshTokenHash = await bcrypt.hash(refreshToken, PASSWORD_SALT_ROUNDS);

    await this.userRepository.updateRefreshToken(user._id, refreshTokenHash);

    return {
      user: serializeUser(user),
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }
}

module.exports = AuthService;
