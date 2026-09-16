const { verifyToken } = require('../utils/jwt');
const { sendError } = require('../utils/response');
const User = require('../modules/users/user.model');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(res, 'Authentication required. No token provided.', [], 401);
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return sendError(res, 'Authentication failed. Invalid token format.', [], 401);
    }

    const decoded = verifyToken(token);
    if (!decoded || !decoded.userId) {
      return sendError(res, 'Invalid token payload.', [], 401);
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return sendError(res, 'User belonging to this token no longer exists.', [], 401);
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return sendError(res, 'Invalid or expired token. Please login again.', [], 401);
    }
    return next(error);
  }
};

module.exports = authMiddleware;
