const multer = require('multer');
const env = require('../config/env');
const { sendError } = require('../utils/response');

const errorMiddleware = (err, req, res, next) => {
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || [];
  let errorCode = err.errorCode || null;

  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Invalid JSON request body';
    errors = [];
    errorCode = 'VALIDATION_ERROR';
  }

  // Handle Multer errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      statusCode = 413;
      message = `File size too large. Maximum allowed size is ${Math.round(env.MAX_FILE_SIZE / (1024 * 1024))}MB`;
      errorCode = 'FILE_TOO_LARGE';
    } else {
      statusCode = 400;
      message = `File upload error: ${err.message}`;
      errorCode = 'FILE_UPLOAD_ERROR';
    }
  }

  // Handle Mongoose Validation Errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    errors = Object.values(err.errors).map((val) => val.message);
    errorCode = 'VALIDATION_ERROR';
  }

  // Handle Mongoose Duplicate Key Error
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'field';
    message = `Duplicate value entered for ${field}. Please use another value.`;
    errorCode = field === 'email' ? 'EMAIL_EXISTS' : field === 'phone' ? 'PHONE_EXISTS' : 'DUPLICATE_VALUE';
  }

  // Handle Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid resource ID format: ${err.value}`;
    errorCode = 'INVALID_RESOURCE_ID';
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token. Please authenticate again.';
    errorCode = 'UNAUTHORIZED';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired. Please login again.';
    errorCode = 'TOKEN_EXPIRED';
  }

  if (env.NODE_ENV === 'development' && statusCode === 500) {
    console.error('[Error Middleware]', err);
  }

  const publicServiceErrors = ['SOCIAL_NOT_CONFIGURED', 'PROVIDER_UNAVAILABLE'];
  if (statusCode >= 500 && !publicServiceErrors.includes(errorCode)) {
    message = 'Internal Server Error';
    errors = [];
    errorCode = 'INTERNAL_SERVER_ERROR';
  }

  return sendError(res, message, errors, statusCode, errorCode);
};

module.exports = errorMiddleware;
