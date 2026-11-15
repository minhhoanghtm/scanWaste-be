const express = require('express');
const router = express.Router();
const stationAdminController = require('../modules/stations/station.admin.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const adminMiddleware = require('../middlewares/admin.middleware');

router.use(authMiddleware, adminMiddleware);

router.get('/', stationAdminController.list);
router.get('/export', stationAdminController.exportExcel);
router.get('/:id', stationAdminController.getById);
router.post('/', stationAdminController.create);
router.patch('/:id', stationAdminController.update);
router.delete('/:id', stationAdminController.delete);
router.patch('/:id/status', stationAdminController.updateStatus);
router.patch('/:id/capacity', stationAdminController.simulateCapacity);

module.exports = router;
