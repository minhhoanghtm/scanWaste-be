const express = require('express');
const mongoose = require('mongoose');
const { sendSuccess } = require('../utils/response');

const authRoutes = require('../modules/auth/auth.routes');
const userRoutes = require('../modules/users/user.routes');
const classificationRoutes = require('../modules/classifications/classification.routes');
const historyRoutes = require('../modules/history/history.routes');
const statisticsRoutes = require('../modules/statistics/statistics.routes');
const aiRoutes = require('../modules/ai/ai.routes');
const adminAiRoutes = require('./admin.ai.routes');
const docsRoutes = require('../docs/docs.routes');

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

// Interactive Swagger UI & OpenAPI Specification
router.use('/docs', docsRoutes);

// Module Routes Registration
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/classifications', classificationRoutes);
router.use('/history', historyRoutes);
router.use('/statistics', statisticsRoutes);
router.use('/ai', aiRoutes);

// Admin Routes Registration
router.use('/admin/ai', adminAiRoutes);

module.exports = router;
