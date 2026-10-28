const voucherWalletService = require('./voucher-wallet.service');
const { sendSuccess } = require('../../utils/response');

class VoucherWalletController {
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
      next(error);
    }
  }
}

module.exports = new VoucherWalletController();