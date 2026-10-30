const express = require('express');
const router = express.Router();
router.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
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

const sessions = require('./auth.session');
const { refreshLimiter } = require('./auth.rate-limit');

router.post('/refresh', refreshLimiter, async (req, res) => {
  return sendSuccess(res, 'Session refreshed', await sessions.refresh(req.body?.refreshToken));
});
router.post('/logout', authMiddleware, async (req, res) => {
  await sessions.revoke(req.auth);
  return sendSuccess(res, 'Session revoked', null);
});
router.post('/logout-all', authMiddleware, async (req, res) => {
  await sessions.revokeAll(req.user._id);
  await sessions.revoke(req.auth);
  return sendSuccess(res, 'All sessions revoked', null);
});
const otp = require('./auth.otp');
const { otpLimiter } = require('./auth.rate-limit');
const loginOtp = require('./auth.login-otp');
router.post('/login/verify', otpLimiter, async (req, res) => {
  return sendSuccess(res, 'Login successful', await loginOtp.verify(req.body));
});
router.post('/login/resend', otpLimiter, async (req, res) => {
  return sendSuccess(res, 'Login code sent', await loginOtp.resend(req.body?.loginChallengeId));
});
const registration = require('./auth.registration');
router.post('/register/verify', otpLimiter, async (req, res) => {
  return sendSuccess(res, 'User registered successfully', await registration.verify(req.body), 201);
});
router.post('/register/resend', otpLimiter, async (req, res) => {
  return sendSuccess(res, 'Registration code sent', await registration.resend(req.body?.registrationId));
});
router.post('/email/send-otp', otpLimiter, authMiddleware, async (req, res) => {
  return sendSuccess(res, 'Email verification', await otp.requestVerification(req.user));
});
router.post('/email/verify', otpLimiter, authMiddleware, async (req, res) => {
  return sendSuccess(res, 'Email verified', await otp.verifyEmail(req.user, req.body?.otp));
});
router.post('/password/forgot', otpLimiter, async (req, res) => {
  return sendSuccess(res, 'Password reset requested', await otp.requestReset(req.body?.email), 202);
});
router.post('/password/reset', otpLimiter, async (req, res) => {
  return sendSuccess(res, 'Password reset', await otp.resetPassword(req.body));
});
module.exports = router;
