const limiter = require('../../middlewares/redis-rate-limit');
module.exports = {
  loginLimiter: limiter('login', 20, true),
  registerLimiter: limiter('register', 20),
  socialChallengeLimiter: limiter('social', 20),
  refreshLimiter: limiter('refresh', 120),
  otpLimiter: limiter('otp', 30),
};
