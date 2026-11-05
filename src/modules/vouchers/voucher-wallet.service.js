const VoucherWallet = require('./voucher-wallet.model');
const User = require('../users/user.model');
const { getPointSummary } = require('../users/user.points.service');

const REMINDER_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

// UC007: Standard rewards catalog
const initialRewards = [
  {
    id: 'R001',
    name: 'Voucher The Coffee House 30.000đ',
    category: 'F&B',
    partnerName: 'The Coffee House',
    points: 100,
    stock: 10,
    description: 'Ưu đãi giảm giá 30k cho đồ uống bất kỳ tại các chi nhánh The Coffee House',
  },
  {
    id: 'R002',
    name: 'Voucher Highlands Coffee 45.000đ',
    category: 'F&B',
    partnerName: 'Highlands Coffee',
    points: 150,
    stock: 8,
    description: 'Ưu đãi giảm giá 45k tại chuỗi cửa hàng Highlands Coffee toàn quốc',
  },
  {
    id: 'R003',
    name: 'Túi vải Canvas thân thiện môi trường',
    category: 'Eco-Products',
    partnerName: 'EcoLife',
    points: 200,
    stock: 5,
    description: 'Túi vải canvas 100% cotton tự nhiên, bền đẹp và tái sử dụng nhiều lần',
  },
  {
    id: 'R004',
    name: 'Ủng hộ quỹ trồng cây Green Earth',
    category: 'Donation',
    partnerName: 'Green Earth Foundation',
    points: 50,
    stock: 20,
    description: 'Đóng góp gây quỹ trồng thêm cây xanh tại các khu đô thị và trường học',
  },
];

let rewardsCatalog = [...initialRewards];

class VoucherWalletService {
  // UC007: Get available rewards catalog
  async getCatalog({ category } = {}) {
    let items = [...rewardsCatalog];
    if (category && category !== 'all' && category !== 'Tất cả') {
      const catLower = category.toLowerCase();
      if (catLower === 'voucher' || catLower === 'f&b') {
        items = items.filter((r) => r.category === 'F&B');
      } else if (catLower === 'sản phẩm xanh' || catLower === 'eco-products') {
        items = items.filter((r) => r.category === 'Eco-Products');
      } else if (catLower === 'quyên góp' || catLower === 'donation') {
        items = items.filter((r) => r.category === 'Donation');
      }
    }
    return {
      items,
      totalCount: items.length,
    };
  }

  // UC008: Redeem a reward using EcoPoints
  async redeemReward(userId, { rewardId }) {
    const reward = rewardsCatalog.find((item) => item.id === rewardId);
    if (!reward) {
      const error = new Error('Không tìm thấy quà tặng.');
      error.statusCode = 404;
      throw error;
    }

    if (reward.stock <= 0) {
      const error = new Error('Quà tặng đã hết.');
      error.statusCode = 400;
      throw error;
    }

    const user = await User.findById(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    const pointSummary = await getPointSummary(user);
    if (pointSummary.availablePoints < reward.points) {
      const error = new Error(
        `Bạn không đủ EcoPoints (cần ${reward.points}, hiện có ${pointSummary.availablePoints}).`
      );
      error.statusCode = 400;
      throw error;
    }

    // Generate unique voucher code
    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const voucherCode = `ECO-${reward.id}-${randomSuffix}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const voucher = await VoucherWallet.create({
      userId,
      voucherName: reward.name,
      partnerName: reward.partnerName,
      voucherCode,
      pointsUsed: reward.points,
      status: 'active',
      redeemedAt: new Date(),
      expiresAt,
    });

    // Decrement stock
    reward.stock = Math.max(0, reward.stock - 1);

    return {
      voucher: {
        id: String(voucher._id),
        voucherName: voucher.voucherName,
        partnerName: voucher.partnerName,
        voucherCode: voucher.voucherCode,
        pointsUsed: voucher.pointsUsed,
        status: voucher.status,
        redeemedAt: voucher.redeemedAt,
        expiresAt: voucher.expiresAt,
      },
      remainingPoints: Math.max(0, pointSummary.availablePoints - reward.points),
      message: `Đổi "${reward.name}" thành công!`,
    };
  }

  // UC010: Get user's voucher wallet
  async getUserWallet(userId, { status = 'all' } = {}) {
    const normalizedStatus = String(status).trim().toLowerCase();

    const allowedStatuses = [
      'all',
      'active',
      'used',
      'expired',
    ];

    if (!allowedStatuses.includes(normalizedStatus)) {
      const error = new Error(
        'Status must be all, active, used, or expired'
      );
      error.statusCode = 400;
      throw error;
    }

    const now = new Date();

    const reminderLimit = new Date(
      now.getTime() + REMINDER_WINDOW_MS
    );

    const vouchers = await VoucherWallet.find({ userId })
      .sort({ redeemedAt: -1, createdAt: -1 })
      .lean();

    const allItems = vouchers.map((voucher) => {
      const expiresAt = voucher.expiresAt
        ? new Date(voucher.expiresAt)
        : null;

      let effectiveStatus;

      // Used voucher takes priority over expiration.
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
