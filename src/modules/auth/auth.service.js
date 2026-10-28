const bcrypt = require('bcryptjs');
const User = require('../users/user.model');
const { generateToken } = require('../../utils/jwt');
const {
  normalizeEmail,
  normalizeVietnamesePhone,
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
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

class AuthService {
  createSession(user) {
    return {
      user: serializeUser(user),
      token: generateToken({ sub: user._id.toString(), role: user.role }),
    };
  }

  async register({ name, email, phone, password }) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizeVietnamesePhone(phone);

    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { phone: normalizedPhone }],
    });
    if (existingUser) {
      if (existingUser.email === normalizedEmail) {
        throw createAuthError('Email is already registered', 409, 'EMAIL_EXISTS');
      }

      throw createAuthError('Phone number is already registered', 409, 'PHONE_EXISTS');
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      phone: normalizedPhone,
      password: hashedPassword,
    });

    const token = generateToken({
      sub: newUser._id.toString(),
      role: newUser.role,
    });

    return {
      user: serializeUser(newUser),
      token,
    };
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

    const token = generateToken({
      sub: user._id.toString(),
      role: user.role,
    });

    return {
      user: serializeUser(user),
      token,
    };
  }
}

module.exports = new AuthService();
