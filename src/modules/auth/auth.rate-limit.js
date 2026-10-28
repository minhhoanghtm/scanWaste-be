const { rateLimit } = require('express-rate-limit');
const { sendError } = require('../../utils/response');

const createAuthLimiter = (limit, skipSuccessfulRequests = false) => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests,
  handler: (req, res) => sendError(
    res,
    'Too many attempts. Please try again later.',
    [],
    429,
    'TOO_MANY_REQUESTS'
  ),
});

module.exports = {
  loginLimiter: createAuthLimiter(20, true),
  registerLimiter: createAuthLimiter(20),
  socialChallengeLimiter: createAuthLimiter(20),
};
