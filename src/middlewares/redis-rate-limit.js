const crypto = require('node:crypto');
const { withRedis, key } = require('../config/redis');
const { sendError } = require('../utils/response');

const WINDOW_SECONDS = 15 * 60;
const incrementScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return { count, redis.call('TTL', KEYS[1]) }
`;

const bucketFor = (name, ip) => key(`rate:${name}:${crypto.createHash('sha256').update(ip || 'unknown').digest('hex')}`);

function limiter(name, limit, skipSuccessfulRequests = false) {
  return async (req, res, next) => {
    try {
      const bucket = bucketFor(name, req.ip);
      const [count, ttl] = await withRedis(r => r.eval(incrementScript, {
        keys: [bucket], arguments: [String(WINDOW_SECONDS)],
      }));
      const retryAfter = Math.max(1, Number(ttl) || WINDOW_SECONDS);
      res.setHeader('RateLimit-Policy', `${limit};w=${WINDOW_SECONDS}`);
      res.setHeader('RateLimit-Limit', String(limit));
      res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - Number(count))));
      res.setHeader('RateLimit-Reset', String(retryAfter));
      if (Number(count) > limit) {
        res.setHeader('Retry-After', String(retryAfter));
        return sendError(res, 'Too many attempts. Please retry later.', [], 429, 'TOO_MANY_REQUESTS');
      }
      if (skipSuccessfulRequests) {
        res.once('finish', () => {
          if (res.statusCode < 400) {
            withRedis(r => r.decr(bucket)).catch(() => {});
          }
        });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
module.exports = limiter;
