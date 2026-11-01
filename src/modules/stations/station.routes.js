const express = require('express');
const router = express.Router();
const stationController = require('./station.controller');

/**
 * Station Public APIs (UC005, UC006)
 * Không cần đăng nhập: UC005 chỉ yêu cầu vị trí GPS. Dữ liệu trạm là thông tin công khai.
 */
router.get('/nearby', stationController.getNearby);
router.get('/:id', stationController.getById);

module.exports = router;
