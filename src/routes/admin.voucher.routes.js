const express = require('express');
const authMiddleware = require('../middlewares/auth.middleware');
const adminMiddleware = require('../middlewares/admin.middleware');
const controller = require('../modules/vouchers/voucher.controller');

const router = express.Router();

router.use(authMiddleware, adminMiddleware);

router.get('/', controller.list);
router.get('/export', controller.exportExcel);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.patch('/:id', controller.update);
router.delete('/:id', controller.delete);

module.exports = router;
