const express = require('express');
const router = express.Router();

const userController = require('./user.controller');
const authMiddleware = require('../../middlewares/auth.middleware');
const { uploadAvatar } = require('./user.avatar');

router.get('/me', authMiddleware, userController.getMe);
router.patch('/me', authMiddleware, userController.updateMe);

router.get('/me/points/history', authMiddleware, userController.getPointHistory);
router.post('/me/avatar', authMiddleware, uploadAvatar, userController.uploadAvatar);
router.delete('/me/avatar', authMiddleware, userController.deleteAvatar);

module.exports = router;