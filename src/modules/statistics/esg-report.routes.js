const express = require('express');
const router = express.Router();

const esgReportController = require('./esg-report.controller');
const authMiddleware = require('../../middlewares/auth.middleware');
const adminMiddleware = require('../../middlewares/admin.middleware');

// All ESG report APIs require Admin authorization.
router.use(authMiddleware, adminMiddleware);

// GET /api/admin/reports/statistics
router.get('/statistics', esgReportController.getAdminReport);

// GET /api/admin/reports/export
router.get('/export', esgReportController.exportAdminReport);

module.exports = router;