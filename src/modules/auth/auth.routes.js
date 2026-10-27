const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { validateRegister, validateLogin } = require('./auth.validation');
const { loginLimiter, registerLimiter, socialChallengeLimiter } = require('./auth.rate-limit');
const social = require('./auth.social');
const authMiddleware = require('../../middlewares/auth.middleware');
const { sendSuccess } = require('../../utils/response');

router.get('/social/config', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return sendSuccess(res, 'Identity providers', social.configuration());
});
router.post('/social/google/challenge', socialChallengeLimiter, social.createChallenge);
router.post('/social/google', loginLimiter, (req, res, next) => {
  return req.headers.authorization ? authMiddleware(req, res, next) : next();
}, social.socialLogin);

router.post('/register', registerLimiter, validateRegister, authController.register);
router.post('/login', loginLimiter, validateLogin, authController.login);

module.exports = router;
