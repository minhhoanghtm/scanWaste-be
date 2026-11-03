const voucherWalletService = require('./voucher-wallet.service');
const { sendSuccess } = require('../../utils/response');

class VoucherWalletController {
  // UC010: Get user's voucher wallet
  async getWallet(req, res, next) {
    try {
      const { status } = req.query;
      const userId = req.user._id || req.user.id;

      const result = await voucherWalletService.getUserWallet(
        userId,
        { status }
      );

      return sendSuccess(
        res,
        'Get voucher wallet successfully',
        result,
        200
      );
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new VoucherWalletController();