
const mongoose = require('mongoose');
const crypto = require('crypto');

const VoucherWallet = require('./voucher-wallet.model');
const Reward = require('./reward.model');
const User = require('../users/user.model');

const REMINDER_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

// UC007: Initial rewards catalog
const initialRewards = [
  {
    id: 'R001',
    name: 'Voucher The Coffee House 30.000đ',
    category: 'F&B',
    partnerName: 'The Coffee House',
    points: 100,
    stock: 10,
    description:
      'Ưu đãi giảm giá 30k cho đồ uống bất kỳ tại các chi nhánh The Coffee House',
  },
  {
    id: 'R002',
    name: 'Voucher Highlands Coffee 45.000đ',
    category: 'F&B',
    partnerName: 'Highlands Coffee',
    points: 150,
    stock: 8,
    description:
      'Ưu đãi giảm giá 45k tại chuỗi cửa hàng Highlands Coffee toàn quốc',
  },
  {
    id: 'R003',
    name: 'Túi vải Canvas thân thiện môi trường',
    category: 'Eco-Products',
    partnerName: 'EcoLife',
    points: 200,
    stock: 5,
    description:
      'Túi vải canvas 100% cotton tự nhiên, bền đẹp và tái sử dụng nhiều lần',
  },
  {
    id: 'R004',
    name: 'Ủng hộ quỹ trồng cây Green Earth',
    category: 'Donation',
    partnerName: 'Green Earth Foundation',
    points: 50,
    stock: 20,
    description:
      'Đóng góp gây quỹ trồng thêm cây xanh tại các khu đô thị và trường học',
  },
];

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

class VoucherWalletService {
  // Seed missing rewards without resetting existing stock
  async ensureRewards() {
    await Reward.init();

    await Reward.bulkWrite(
      initialRewards.map((reward) => ({
        updateOne: {
          filter: { id: reward.id },
          update: {
            $setOnInsert: reward,
          },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  }

  // UC007: Get available rewards catalog
  async getCatalog({ category } = {}) {
    await this.ensureRewards();

    const filter = { isActive: true };

    if (
      category &&
      category !== 'all' &&
      category !== 'Tất cả'
    ) {
      const normalized = String(category)
        .trim()
        .toLowerCase();

      if (
        normalized === 'voucher' ||
        normalized === 'f&b'
      ) {
        filter.category = 'F&B';
      } else if (
        normalized === 'sản phẩm xanh' ||
        normalized === 'eco-products'
      ) {
        filter.category = 'Eco-Products';
      } else if (
        normalized === 'quyên góp' ||
        normalized === 'donation'
      ) {
        filter.category = 'Donation';
      } else {
        throw createError(
          'Danh mục quà tặng không hợp lệ.'
        );
      }
    }

    const rewards = await Reward.find(filter)
      .sort({ id: 1 })
      .lean();

    const items = rewards.map((reward) => ({
      id: reward.id,
      name: reward.name,
      category: reward.category,
      partnerName: reward.partnerName,
      points: reward.points,
      stock: reward.stock,
      description: reward.description,
    }));

    return {
      items,
      totalCount: items.length,
    };
  }

  // UC008: Redeem reward using EcoPoints
  async redeemReward(userId, { rewardId }) {
    if (
      typeof rewardId !== 'string' ||
      !rewardId.trim()
    ) {
      throw createError(
        'Vui lòng chọn mã phần quà.'
      );
    }

    await this.ensureRewards();

    const ownerId = new mongoose.Types.ObjectId(
      String(userId)
    );

    const normalizedRewardId = rewardId.trim();

    // Requires MongoDB replica set or Atlas
    const session = await mongoose.startSession();

    try {
      let result;

      await session.withTransaction(async () => {
        // Serialize concurrent redemptions for the same user
        const lock = await User.updateOne(
          { _id: ownerId },
          {
            $inc: {
              redemptionVersion: 1,
            },
          },
          { session }
        );

        if (lock.matchedCount !== 1) {
          throw createError(
            'User not found',
            404
          );
        }

        const user = await User.findById(ownerId)
          .session(session)
          .lean();

        const reward = await Reward.findOne({
          id: normalizedRewardId,
          isActive: true,
        })
          .session(session)
          .lean();

        if (!reward) {
          throw createError(
            'Không tìm thấy quà tặng.',
            404
          );
        }

        if (reward.stock <= 0) {
          throw createError(
            'Quà tặng đã hết.'
          );
        }

        // Calculate already redeemed points
        const [spent] = await VoucherWallet.aggregate([
          {
            $match: {
              userId: ownerId,
            },
          },
          {
            $group: {
              _id: null,
              total: {
                $sum: '$pointsUsed',
              },
            },
          },
        ]).session(session);

        const totalPoints = Number(
          user.totalPoints || 0
        );

        const spentPoints = Number(
          spent?.total || 0
        );

        const availablePoints = Math.max(
          0,
          totalPoints - spentPoints
        );

        if (availablePoints < reward.points) {
          throw createError(
            `Bạn không đủ EcoPoints (cần ${reward.points}, hiện có ${availablePoints}).`
          );
        }

        // Decrease stock atomically
        const stockUpdate = await Reward.updateOne(
          {
            _id: reward._id,
            isActive: true,
            stock: {
              $gt: 0,
            },
          },
          {
            $inc: {
              stock: -1,
            },
          },
          { session }
        );

        if (stockUpdate.modifiedCount !== 1) {
          throw createError(
            'Quà tặng đã hết.'
          );
        }

        // Generate voucher code
        const voucherCode =
          `ECO-${reward.id}-` +
          crypto.randomBytes(8)
            .toString('hex')
            .toUpperCase();

        const redeemedAt = new Date();

        const expiresAt = new Date(
          redeemedAt.getTime() +
          30 * 24 * 60 * 60 * 1000
        );

        // Create voucher in the same transaction
        const [voucher] = await VoucherWallet.create(
          [
            {
              userId: ownerId,
              voucherName: reward.name,
              partnerName: reward.partnerName,
              voucherCode,
              pointsUsed: reward.points,
              status: 'active',
              redeemedAt,
              expiresAt,
            },
          ],
          { session }
        );

        result = {
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
          remainingPoints:
            availablePoints - reward.points,
          message:
            `Đổi "${reward.name}" thành công!`,
        };
      });

      return result;
    } finally {
      await session.endSession();
    }
  }

  // UC010: Get user's voucher wallet
  async getUserWallet(
    userId,
    { status = 'all' } = {}
  ) {
    const normalizedStatus = String(status)
      .trim()
      .toLowerCase();

    const allowedStatuses = [
      'all',
      'active',
      'used',
      'expired',
    ];

    if (!allowedStatuses.includes(normalizedStatus)) {
      throw createError(
        'Status must be all, active, used, or expired'
      );
    }

    const now = new Date();

    const reminderLimit = new Date(
      now.getTime() + REMINDER_WINDOW_MS
    );

    const vouchers = await VoucherWallet.find({
      userId,
    })
      .sort({
        redeemedAt: -1,
        createdAt: -1,
      })
      .lean();

    const allItems = vouchers.map((voucher) => {
      const expiresAt = voucher.expiresAt
        ? new Date(voucher.expiresAt)
        : null;

      let effectiveStatus;

      if (
        voucher.status === 'used' ||
        voucher.usedAt
      ) {
        effectiveStatus = 'used';
      } else if (
        expiresAt &&
        expiresAt <= now
      ) {
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
        partnerName:
          voucher.partnerName || '',
        voucherCode: voucher.voucherCode,
        pointsUsed:
          voucher.pointsUsed ?? 0,
        status: effectiveStatus,
        redeemedAt: voucher.redeemedAt,
        expiresAt,
        usedAt:
          voucher.usedAt || null,
        expiringSoon,
        warningMessage: expiringSoon
          ? 'Voucher sắp hết hạn trong 3 ngày'
          : null,
      };
    });

    const items =
      normalizedStatus === 'all'
        ? allItems
        : allItems.filter(
            (voucher) =>
              voucher.status === normalizedStatus
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
