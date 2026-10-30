const { rateLimit } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { withRedis, key } = require('../config/redis');
const { sendError } = require('../utils/response');
function limiter(name, limit, skipSuccessfulRequests = false) {
  return rateLimit({ windowMs: 15 * 60 * 1000, limit, skipSuccessfulRequests,
    standardHeaders: 'draft-7', legacyHeaders: false, passOnStoreError: false,
    store: new RedisStore({ prefix: key(`rate:${name}:`),
      sendCommand: (...args) => withRedis(r => r.sendCommand(args)),
    }),
    handler: (req, res) => sendError(res, 'Too many attempts. Please retry later.', [], 429, 'TOO_MANY_REQUESTS'),
  });
}
module.exports = limiter;
