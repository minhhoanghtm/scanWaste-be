const express = require('express');
const router = express.Router();
const stationAdminController = require('../modules/stations/station.admin.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const adminMiddleware = require('../middlewares/admin.middleware');

/**
 * Admin Station Monitoring APIs (UC012)
 * Mọi route yêu cầu JWT + role admin (giống admin.ai.routes.js).
 */
router.use(authMiddleware, adminMiddleware);

router.get('/', stationAdminController.list);
router.patch('/:id/status', stationAdminController.updateStatus);
router.patch('/:id/capacity', stationAdminController.simulateCapacity);

module.exports = router;
