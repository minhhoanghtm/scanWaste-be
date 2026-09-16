const express = require('express');
const router = express.Router();
const statisticsController = require('./statistics.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

router.get('/', authMiddleware, statisticsController.getStatistics);

module.exports = router;
