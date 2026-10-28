const VoucherWallet = require('./voucher-wallet.model');

class VoucherWalletService {
  async getUserWallet(userId, { status = 'all' } = {}) {
    const normalizedStatus = String(status).trim().toLowerCase();
    const allowedStatuses = ['all', 'active', 'used', 'expired'];

    if (!allowedStatuses.includes(normalizedStatus)) {
      const error = new Error(
        'Status must be all, active, used, or expired'
      );
      error.statusCode = 400;
      throw error;
    }

    const now = new Date();
    const reminderLimit = new Date(
      now.getTime() + 3 * 24 * 60 * 60 * 1000
    );

    const vouchers = await VoucherWallet.find({ userId })
      .sort({ redeemedAt: -1, createdAt: -1 })
      .lean();

    const allItems = vouchers.map((voucher) => {
      const expiresAt = voucher.expiresAt
        ? new Date(voucher.expiresAt)
        : null;

      let effectiveStatus;

      if (voucher.status === 'used' || voucher.usedAt) {
        effectiveStatus = 'used';
      } else if (expiresAt && expiresAt <= now) {
        effectiveStatus = 'expired';
      } else {
        effectiveStatus = 'active';
      }

      const expiringSoon =
        effectiveStatus === 'active' &&
        expiresAt !== null &&
        expiresAt > now &&
        expiresAt <= reminderLimit;

      return {
        id: String(voucher._id),
        voucherName: voucher.voucherName,
        partnerName: voucher.partnerName || '',
        voucherCode: voucher.voucherCode,
        pointsUsed: voucher.pointsUsed ?? 0,
        status: effectiveStatus,
        redeemedAt: voucher.redeemedAt,
        expiresAt,
        usedAt: voucher.usedAt || null,
        expiringSoon,
        warningMessage: expiringSoon
          ? 'Voucher sắp hết hạn trong 3 ngày'
          : null,
      };
    });

    const items = normalizedStatus === 'all'
      ? allItems
      : allItems.filter(
          (voucher) => voucher.status === normalizedStatus
        );

    return {
      items,
      totalCount: items.length,
      filters: {
        status: normalizedStatus,
      },
    };
  }
}

module.exports = new VoucherWalletService();