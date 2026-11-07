
const express = require('express');
const router = express.Router();
const statisticsController = require('./statistics.controller');
const authMiddleware = require('../../middlewares/auth.middleware');
const adminMiddleware = require('../../middlewares/admin.middleware');

// UC013: ESG budget management
router.get(
  '/esg-budget',
  authMiddleware,
  adminMiddleware,
  statisticsController.getEsgBudget
);

router.patch(
  '/esg-budget',
  authMiddleware,
  adminMiddleware,
  statisticsController.updateEsgBudget
);

// User classification statistics
router.get('/', authMiddleware, statisticsController.getStatistics);
module.exports = router;
