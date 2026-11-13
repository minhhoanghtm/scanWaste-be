const { sendError } = require('../utils/response');

/**
 * Middleware to restrict access to administrator users only
 * Expects authMiddleware to have already executed and populated req.user
 */
const adminMiddleware = (req, res, next) => {
  if (!req.user) {
    return sendError(res, 'Authentication required. No user identity found.', [], 401);
  }

  if (req.user.role !== 'admin') {
    return sendError(res, 'Access denied. Administrator privileges required.', [], 403);
  }

  next();
};

module.exports = adminMiddleware;
