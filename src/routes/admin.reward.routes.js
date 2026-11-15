const express = require('express');
const authMiddleware = require('../middlewares/auth.middleware');
const adminMiddleware = require('../middlewares/admin.middleware');
const controller = require('../modules/vouchers/reward-admin.controller');

const router = express.Router();
router.use(authMiddleware, adminMiddleware);

router.get('/', controller.list);
router.get('/export', controller.exportExcel);
router.post('/', controller.create);
router.patch('/:id', controller.update);
router.delete('/:id', controller.delete);

router.get('/redemptions', controller.redemptions);
router.get('/redemptions/export', controller.exportRedemptionsExcel);

module.exports = router;
