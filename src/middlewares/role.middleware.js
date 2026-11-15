const { sendError } = require('../utils/response');

/**
 * Middleware factory to check user roles
 * @param {string[]} allowedRoles
 */
const requireRoles = (allowedRoles = ['admin']) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 'Yêu cầu đăng nhập.', [], 401, 'UNAUTHORIZED');
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendError(
        res,
        `Truy cập bị từ chối. Yêu cầu quyền: ${allowedRoles.join(', ')}.`,
        [],
        403,
        'FORBIDDEN'
      );
    }

    next();
  };
};

module.exports = {
  requireRoles,
};
