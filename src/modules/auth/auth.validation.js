const { sendError } = require('../../utils/response');
const {
  normalizeEmail,
  normalizeVietnamesePhone,
  normalizeLoginIdentifier,
} = require('./auth.utils');

const hasText = (value) => typeof value === 'string' && value.trim() !== '';

const validateRegister = (req, res, next) => {
  const { name, email, phone, password, confirmPassword } = req.body || {};
  const errors = [];

  if (!name || typeof name !== 'string' || name.trim() === '') {
    errors.push('Name is required');
  } else if (name.trim().length > 100) {
    errors.push('Name cannot exceed 100 characters');
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    errors.push('A valid email address is required');
  }

  const normalizedPhone = normalizeVietnamesePhone(phone);
  if (!normalizedPhone) {
    errors.push('A valid Vietnamese mobile phone number is required');
  }

  const weakPassword = typeof password !== 'string' || password.trim() === ''
    || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72;
  if (weakPassword) {
    errors.push('Password must contain at least 8 characters and at most 72 UTF-8 bytes');
  }

  if (confirmPassword !== undefined && confirmPassword !== password) {
    errors.push('Password confirmation does not match');
  }

  if (errors.length > 0) {
    const code = weakPassword && errors.length === 1 ? 'WEAK_PASSWORD' : 'VALIDATION_ERROR';
    return sendError(res, 'Validation Error', errors, 400, code);
  }

  req.body.name = name.trim();
  req.body.email = normalizedEmail;
  req.body.phone = normalizedPhone;

  next();
};

const validateLogin = (req, res, next) => {
  const { identifier, email, phone, password } = req.body || {};
  const errors = [];
  const suppliedIdentifiers = [identifier, email, phone].filter((value) => value !== undefined);

  if (suppliedIdentifiers.length !== 1) {
    errors.push('Provide exactly one email address or phone number');
  }

  const normalizedIdentifier = suppliedIdentifiers.length === 1
    ? normalizeLoginIdentifier(suppliedIdentifiers[0])
    : null;
  if (suppliedIdentifiers.length === 1 && !normalizedIdentifier) {
    errors.push('A valid email address or Vietnamese mobile phone number is required');
  }

  if (!hasText(password) || Buffer.byteLength(password, 'utf8') > 72) {
    errors.push('Password is required');
  }

  if (errors.length > 0) {
    return sendError(res, 'Validation Error', errors, 400, 'VALIDATION_ERROR');
  }

  req.body.identifier = normalizedIdentifier.value;

  next();
};

module.exports = {
  validateRegister,
  validateLogin,
};
