/**
 * Response Utility to standardize API JSON responses
 */

const sendSuccess = (res, message = 'Success', data = {}, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

const sendError = (res, message = 'Error', errors = [], statusCode = 500, code = null) => {
  return res.status(statusCode).json({
    success: false,
    message,
    ...(code ? { code } : {}),
    errors: Array.isArray(errors) ? errors : [errors],
  });
};

module.exports = {
  sendSuccess,
  sendError,
};
