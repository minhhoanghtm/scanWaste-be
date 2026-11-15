const limiter = require('./redis-rate-limit');
const env = require('../config/env');

const isDevOrTest = env.NODE_ENV !== 'production';

module.exports = {
  apiLimiter: limiter('api', isDevOrTest ? 10000 : 300),
  authLimiter: limiter('auth', isDevOrTest ? 10000 : 30),
};
