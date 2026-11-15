const express = require('express');
const authMiddleware = require('../middlewares/auth.middleware');
const adminMiddleware = require('../middlewares/admin.middleware');
const controller = require('../modules/statistics/dashboard.controller');

const router = express.Router();

router.use(authMiddleware, adminMiddleware);

router.get('/stats', controller.getKpis);

module.exports = router;
