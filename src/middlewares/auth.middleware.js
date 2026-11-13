const { verifyToken } = require('../utils/jwt');
const { sendError } = require('../utils/response');
const User = require('../modules/users/user.model');
const mongoose = require('mongoose');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    const bearerMatch = typeof authHeader === 'string'
      ? /^Bearer\s+(\S+)$/i.exec(authHeader)
      : null;
    if (!bearerMatch) {
      return sendError(res, 'Authentication required. Provide a Bearer token.', [], 401, 'UNAUTHORIZED');
    }

    const decoded = verifyToken(bearerMatch[1]);
    const userId = decoded?.sub || decoded?.userId;
    if (typeof userId !== 'string' || !mongoose.isObjectIdOrHexString(userId)) {
      return sendError(res, 'Invalid token payload.', [], 401, 'UNAUTHORIZED');
    }

    const user = await User.findById(userId);
    if (!user) {
      return sendError(res, 'User belonging to this token no longer exists.', [], 401, 'UNAUTHORIZED');
    }

    await require('../modules/auth/auth.session').validate(decoded, user);
    req.auth = decoded;
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return sendError(res, 'Token expired. Please login again.', [], 401, 'TOKEN_EXPIRED');
    }
    if (error.name === 'JsonWebTokenError' || error.name === 'NotBeforeError') {
      return sendError(res, 'Invalid token. Please login again.', [], 401, 'UNAUTHORIZED');
    }
    return next(error);
  }
};

module.exports = authMiddleware;
