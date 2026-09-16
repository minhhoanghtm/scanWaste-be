const { sendError } = require('../utils/response');

const notFoundMiddleware = (req, res, next) => {
  return sendError(res, `Route not found: ${req.method} ${req.originalUrl}`, [], 404);
};

module.exports = notFoundMiddleware;
