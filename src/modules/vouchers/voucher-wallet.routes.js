const express = require('express');
const router = express.Router();

const authMiddleware = require('../../middlewares/auth.middleware');
const voucherWalletController = require('./voucher-wallet.controller');

router.get(
  '/wallet',
  authMiddleware,
  voucherWalletController.getWallet
);

module.exports = router;