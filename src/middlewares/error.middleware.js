const multer = require('multer');
const env = require('../config/env');
const { sendError } = require('../utils/response');

const errorMiddleware = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || [];

  // Handle Multer errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      statusCode = 413;
      message = `File size too large. Maximum allowed size is ${Math.round(env.MAX_FILE_SIZE / (1024 * 1024))}MB`;
    } else {
      statusCode = 400;
      message = `File upload error: ${err.message}`;
    }
  }

  // Handle Mongoose Validation Errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    errors = Object.values(err.errors).map((val) => val.message);
  }

  // Handle Mongoose Duplicate Key Error
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `Duplicate value entered for ${field}. Please use another value.`;
  }

  // Handle Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid resource ID format: ${err.value}`;
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token. Please authenticate again.';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired. Please login again.';
  }

  if (env.NODE_ENV === 'development' && statusCode === 500) {
    console.error('[Error Middleware]', err);
  }

  return sendError(res, message, errors, statusCode);
};

module.exports = errorMiddleware;
