const { sendError } = require('../../utils/response');

const validateRegister = (req, res, next) => {
  const { name, email, password } = req.body;
  const errors = [];

  if (!name || typeof name !== 'string' || name.trim() === '') {
    errors.push('Name is required');
  }

  if (!email || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email.trim())) {
    errors.push('A valid email address is required');
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    errors.push('Password is required and must be at least 6 characters long');
  }

  if (errors.length > 0) {
    return sendError(res, 'Validation Error', errors, 400);
  }

  next();
};

const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  const errors = [];

  if (!email || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email.trim())) {
    errors.push('A valid email address is required');
  }

  if (!password || typeof password !== 'string' || password.trim() === '') {
    errors.push('Password is required');
  }

  if (errors.length > 0) {
    return sendError(res, 'Validation Error', errors, 400);
  }

  next();
};

module.exports = {
  validateRegister,
  validateLogin,
};
