const User = require('../users/user.model');
const Station = require('../stations/station.model');
const Classification = require('../classifications/classification.model');
const Reward = require('../vouchers/reward.model');
const Voucher = require('../vouchers/voucher.model');
const VoucherWallet = require('../vouchers/voucher-wallet.model');

class DashboardService {
  async getKpis() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      totalEmployees,
      totalStations,
      activeStations,
      fullStations,
      totalScans,
      todayScans,
      pendingReviews,
      totalVouchers,
      activeVouchers,
      totalRewards,
      totalRedemptions,
      recentScans,
      recentRedemptions,
    ] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ role: { $in: ['staff', 'admin'] } }),
      Station.countDocuments(),
      Station.countDocuments({ status: 'ACTIVE' }),
      Station.countDocuments({ status: 'FULL' }),
      Classification.countDocuments(),
      Classification.countDocuments({ createdAt: { $gte: todayStart } }),
      Classification.countDocuments({
        verifiedByAdmin: { $ne: true },
        $or: [
          { confidence: { $lt: 0.7 } },
          { reportedIncorrect: true },
          { reviewStatus: 'pending' },
        ],
      }),
      Voucher.countDocuments(),
      Voucher.countDocuments({ isActive: true }),
      Reward.countDocuments(),
      VoucherWallet.countDocuments(),
      Classification.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('predictedClass confidence createdAt reviewStatus')
        .lean(),
      VoucherWallet.find()
        .sort({ redeemedAt: -1 })
        .limit(5)
        .populate('userId', 'name email')
        .select('voucherName pointsUsed redeemedAt')
        .lean(),
    ]);

    return {
      kpis: {
        users: { total: totalUsers, employees: totalEmployees },
        stations: { total: totalStations, active: activeStations, full: fullStations },
        scans: { total: totalScans, today: todayScans, pendingReviews },
        vouchers: { total: totalVouchers, active: activeVouchers },
        rewards: { total: totalRewards, totalRedemptions },
      },
      recentScans: recentScans.map((s) => ({
        id: String(s._id),
        predictedClass: s.predictedClass,
        confidence: s.confidence,
        createdAt: s.createdAt,
        reviewStatus: s.reviewStatus,
      })),
      recentRedemptions: recentRedemptions.map((r) => ({
        id: String(r._id),
        userName: r.userId?.name || 'Thành viên',
        voucherName: r.voucherName,
        pointsUsed: r.pointsUsed,
        redeemedAt: r.redeemedAt,
      })),
    };
  }
}

module.exports = new DashboardService();
