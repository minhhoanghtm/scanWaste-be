const express = require('express');
const mongoose = require('mongoose');
const { sendSuccess } = require('../utils/response');

const authRoutes = require('../modules/auth/auth.routes');
const userRoutes = require('../modules/users/user.routes');
const classificationRoutes = require('../modules/classifications/classification.routes');
const historyRoutes = require('../modules/history/history.routes');
const statisticsRoutes = require('../modules/statistics/statistics.routes');
const voucherWalletRoutes = require('../modules/vouchers/voucher-wallet.routes');
const router = express.Router();

/**
 * Health Check API
 * GET /api/health
 */
router.get('/health', (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  return sendSuccess(res, 'Backend is running', {
    database: isDbConnected ? 'connected' : 'disconnected',
  }, 200);
});

// Module Routes Registration
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/classifications', classificationRoutes);
router.use('/history', historyRoutes);
router.use('/statistics', statisticsRoutes);
router.use('/vouchers', voucherWalletRoutes);

module.exports = router;
