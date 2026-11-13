const voucherWalletService = require('./voucher-wallet.service');
const { sendSuccess } = require('../../utils/response');

class VoucherWalletController {
  // UC007: Get rewards catalog
  async getCatalog(req, res, next) {
    try {
      const { category } = req.query;
      const result = await voucherWalletService.getCatalog({ category });

      return sendSuccess(
        res,
        'Get rewards catalog successfully',
        result,
        200
      );
    } catch (error) {
      return next(error);
    }
  }

  // UC008: Redeem a reward
  async redeem(req, res, next) {
    try {
      const userId = req.user._id || req.user.id;
      const { rewardId } = req.body || {};

      if (!rewardId) {
        const error = new Error('Vui lòng chọn mã phần quà (rewardId)');
        error.statusCode = 400;
        throw error;
      }

      const result = await voucherWalletService.redeemReward(userId, { rewardId });

      return sendSuccess(
        res,
        'Đổi quà thành công',
        result,
        201
      );
    } catch (error) {
      return next(error);
    }
  }

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
