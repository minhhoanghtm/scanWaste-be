const limiter = require('./redis-rate-limit');
module.exports = { apiLimiter: limiter('api', 300), authLimiter: limiter('auth', 30) };
