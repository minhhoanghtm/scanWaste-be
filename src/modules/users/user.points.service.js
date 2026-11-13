const mongoose = require('mongoose');
const Classification = require('../classifications/classification.model');
const VoucherWallet = require('../vouchers/voucher-wallet.model');

// develop stores all earned points in totalPoints. VoucherWallet stores redemption
// costs; expired/used vouchers remain spent. Do not deduct from totalPoints twice.
async function getPointSummary(user) {
  const userId = new mongoose.Types.ObjectId(String(user._id || user.id));
  const [spent] = await VoucherWallet.aggregate([
    { $match: { userId } },
    { $group: { _id: null, total: { $sum: '$pointsUsed' } } },
  ]);
  const totalPoints = Number(user.totalPoints || 0);
  const spentPoints = Number(spent?.total || 0);
  return { totalPoints, spentPoints, availablePoints: Math.max(0, totalPoints - spentPoints) };
}

function positiveInteger(value, fallback, maximum) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)
    || !Number.isSafeInteger(Number(value)) || Number(value) > maximum) {
    throw Object.assign(new Error('Invalid pagination value'), { statusCode: 400 });
  }
  return Number(value);
}

async function getPointHistory(userId, options = {}) {
  if (Object.keys(options).some(key => !['page', 'limit', 'type'].includes(key))) {
    throw Object.assign(new Error('Unsupported history filter'), { statusCode: 400 });
  }
  const page = positiveInteger(options.page, 1, 1000000);
  const limit = positiveInteger(options.limit, 10, 100);
  const type = options.type ?? 'all';
  if (!['all', 'earned', 'redeemed'].includes(type)) {
    throw Object.assign(new Error('Type must be all, earned, or redeemed'), { statusCode: 400 });
  }
  const owner = new mongoose.Types.ObjectId(String(userId));
  const [result] = await Classification.aggregate([
    { $match: { userId: owner, pointsEarned: { $gt: 0 } } },
    { $project: {
      _id: 1, type: { $literal: 'earned' }, points: '$pointsEarned',
      title: { $ifNull: ['$predictedClassVi', '$predictedClass'] },
      // Reviewed classifications earn points at approval, not at the earlier scan.
      occurredAt: { $ifNull: ['$reviewedAt', '$createdAt'] },
    } },
    { $unionWith: { coll: VoucherWallet.collection.name, pipeline: [
      { $match: { userId: owner } },
      { $project: {
        _id: 1, type: { $literal: 'redeemed' },
        points: { $multiply: [{ $ifNull: ['$pointsUsed', 0] }, -1] },
        title: '$voucherName', occurredAt: { $ifNull: ['$redeemedAt', '$createdAt'] },
      } },
    ] } },
    ...(type === 'all' ? [] : [{ $match: { type } }]),
    { $sort: { occurredAt: -1, _id: -1, type: 1 } },
    { $facet: {
      items: [{ $skip: (page - 1) * limit }, { $limit: limit },
        { $project: { _id: 0, id: { $toString: '$_id' }, type: 1, points: 1, title: 1, occurredAt: 1 } }],
      count: [{ $count: 'total' }],
    } },
  ]);
  const totalCount = result?.count[0]?.total || 0;
  return {
    items: result?.items || [], filters: { type },
    pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit),
      hasNextPage: page * limit < totalCount, hasPrevPage: page > 1 },
  };
}

module.exports = { getPointSummary, getPointHistory };
