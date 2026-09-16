const express = require('express');
const router = express.Router();
const historyController = require('./history.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

router.get('/', authMiddleware, historyController.getHistory);
router.get('/:id', authMiddleware, historyController.getHistoryDetail);

module.exports = router;
