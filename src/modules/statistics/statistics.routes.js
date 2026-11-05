const express = require('express');
const router = express.Router();
const statisticsController = require('./statistics.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

// UC013: ESG budget endpoints
router.get('/esg-budget', statisticsController.getEsgBudget);
router.patch('/esg-budget', authMiddleware, statisticsController.updateEsgBudget);

// User classification statistics
router.get('/', authMiddleware, statisticsController.getStatistics);

module.exports = router;
