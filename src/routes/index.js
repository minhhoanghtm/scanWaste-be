const express = require('express');
const mongoose = require('mongoose');
const { sendSuccess } = require('../utils/response');

const authRoutes = require('../modules/auth/auth.routes');
const userRoutes = require('../modules/users/user.routes');
const classificationRoutes = require('../modules/classifications/classification.routes');
const historyRoutes = require('../modules/history/history.routes');
const voucherWalletRoutes = require('../modules/vouchers/voucher-wallet.routes');
const statisticsRoutes = require('../modules/statistics/statistics.routes');
const esgReportRoutes = require('../modules/statistics/esg-report.routes');
const aiRoutes = require('../modules/ai/ai.routes');
const stationRoutes = require('../modules/stations/station.routes');

const adminAiRoutes = require('./admin.ai.routes');
const adminStationRoutes = require('./admin.station.routes');
const docsRoutes = require('../docs/docs.routes');

const router = express.Router();

// Health Check API
router.get('/health', (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;

  return sendSuccess(
    res,
    'Backend is running',
    {
      database: isDbConnected ? 'connected' : 'disconnected',
    },
    200
  );
});

// Swagger documentation
router.use('/docs', docsRoutes);

// Main module routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/classifications', classificationRoutes);
router.use('/history', historyRoutes);
router.use('/vouchers', voucherWalletRoutes);
router.use('/statistics', statisticsRoutes);
router.use('/ai', aiRoutes);
router.use('/stations', stationRoutes);

// Admin routes
router.use('/admin/ai', adminAiRoutes);
router.use('/admin/stations', adminStationRoutes);
router.use('/admin/reports', esgReportRoutes);

module.exports = router;