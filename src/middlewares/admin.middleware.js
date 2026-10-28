const { sendError } = require('../utils/response');

const adminMiddleware = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return sendError(
      res,
      'Admin access required.',
      [],
      403
    );
  }

  return next();
};

module.exports = adminMiddleware;