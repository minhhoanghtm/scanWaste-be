const express = require('express');
const router = express.Router();

const authMiddleware = require('../../middlewares/auth.middleware');
const voucherWalletController = require('./voucher-wallet.controller');

// UC007: View rewards catalog (public or authenticated)
router.get('/catalog', voucherWalletController.getCatalog);
router.get('/', voucherWalletController.getCatalog);

// UC008: Redeem reward (requires authentication)
router.post('/redeem', authMiddleware, voucherWalletController.redeem);

// UC010: View personal voucher wallet
router.get('/wallet', authMiddleware, voucherWalletController.getWallet);

module.exports = router;
