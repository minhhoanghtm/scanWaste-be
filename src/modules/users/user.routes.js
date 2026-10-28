const express = require('express');
const router = express.Router();
const userController = require('./user.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

router.get('/me', authMiddleware, userController.getMe);

module.exports = router;
