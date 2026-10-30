const bcrypt = require('bcryptjs');
const User = require('../users/user.model');
const sessions = require('./auth.session');
const {
  normalizeLoginIdentifier,
} = require('./auth.utils');

const createAuthError = (message, statusCode, errorCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
};

// Keep the bcrypt work factor identical for missing users and wrong passwords.
const dummyPasswordHash = bcrypt.hashSync('scanwaste-auth-timing-placeholder', 12);

const serializeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  emailVerified: user.emailVerified,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

class AuthService {
  async createSession(user) {
    return { user: serializeUser(user), ...await sessions.create(user) };
  }

  async register({ name, email, phone, password }) {
    return require('./auth.registration').request({ name, email, phone, password });
  }

  async login({ identifier, password }) {
    const normalizedIdentifier = normalizeLoginIdentifier(identifier);
    if (!normalizedIdentifier) {
      throw createAuthError('Invalid email or phone number', 400, 'VALIDATION_ERROR');
    }

    const user = await User.findOne({
      [normalizedIdentifier.field]: normalizedIdentifier.value,
    }).select('+password');
    const isMatch = await bcrypt.compare(password, user?.password || dummyPasswordHash);
    if (!user || !user.password || !isMatch) {
      throw createAuthError('Invalid email, phone number, or password', 401, 'INVALID_CREDENTIALS');
    }

    return require('./auth.login-otp').request(user);
  }
}

module.exports = new AuthService();
