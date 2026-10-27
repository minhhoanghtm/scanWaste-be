const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { validateRegister, validateLogin } = require('./auth.validation');

const { authLimiter } = require('../../middlewares/rateLimit.middleware');

router.post('/register', authLimiter, validateRegister, authController.register);
router.post('/login', authLimiter, validateLogin, authController.login);

module.exports = router;
