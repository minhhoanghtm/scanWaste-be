const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { validateRegister, validateLogin } = require('./auth.validation');

router.post('/register', validateRegister, authController.register);
router.post('/login', validateLogin, authController.login);

module.exports = router;
