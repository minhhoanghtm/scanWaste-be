const mongoose = require('mongoose');
const Classification = require('../classifications/classification.model');
const Feedback = require('../feedback/feedback.model');
const { DatasetItem } = require('../dataset/dataset.model');
const ModelRegistry = require('../ai/modelRegistry/modelRegistry.model');
const { SUPPORTED_WASTE_CLASSES } = require('../ai/ai.config');

class StatisticsService {
  /**
   * Calculate waste classification statistics for a user
   * @param {string|mongoose.Types.ObjectId} userId
   */
  async getUserStatistics(userId) {
    const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const aggregationResult = await Classification.aggregate([
      {
        $match: {
          userId: userObjectId,
        },
      },
      {
        $group: {
          _id: '$predictedClass',
          count: { $sum: 1 },
        },
      },
    ]);

    // Build base statistics structure with zero counts for all supported classes
    const statistics = {
      total: 0,
    };

    for (const wasteClass of SUPPORTED_WASTE_CLASSES) {
      statistics[wasteClass] = 0;
    }

    let total = 0;
    for (const item of aggregationResult) {
      const className = item._id;
      const count = item.count;
      if (statistics.hasOwnProperty(className)) {
        statistics[className] = count;
      } else {
        statistics.other = (statistics.other || 0) + count;
      }
      total += count;
    }

    statistics.total = total;

    return statistics;
  }

  /**
   * Comprehensive Admin AI Statistics
   * Includes classifications, 7 classes breakdown, offline/server ratio,
   * model versions, average inference time, feedback stats, confusion pairs,
   * time-series (daily, weekly, monthly), dataset splits, and moderated images count.
   */
  async getAdminAIStatistics(query = {}) {
    const filter = {};
    if (query.modelVersion) {
      filter.modelVersion = query.modelVersion;
    }
    if (query.startDate || query.endDate) {
      filter.createdAt = {};
      if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
      if (query.endDate) filter.createdAt.$lte = new Date(query.endDate);
    }

    // 1. Classification Metrics
    const totalClassifications = await Classification.countDocuments(filter);

    // 2. Class Breakdown (7 categories)
    const categoryAgg = await Classification.aggregate([
      { $match: filter },
      { $group: { _id: '$predictedClass', count: { $sum: 1 } } },
    ]);
    const byCategory = {};
    for (const wasteClass of SUPPORTED_WASTE_CLASSES) {
      byCategory[wasteClass] = 0;
    }
    for (const item of categoryAgg) {
      if (byCategory.hasOwnProperty(item._id)) {
        byCategory[item._id] = item.count;
      } else {
        byCategory.other = (byCategory.other || 0) + item.count;
      }
    }

    // 3. Source Breakdown (server vs offline)
    const sourceAgg = await Classification.aggregate([
      { $match: filter },
      { $group: { _id: '$classificationSource', count: { $sum: 1 } } },
    ]);
    const bySource = {
      server: 0,
      offline: 0,
      serverPercentage: 0,
      offlinePercentage: 0,
    };
    for (const item of sourceAgg) {
      if (item._id === 'offline') {
        bySource.offline = item.count;
      } else {
        bySource.server = item.count;
      }
    }
    if (totalClassifications > 0) {
      bySource.serverPercentage = Number(((bySource.server / totalClassifications) * 100).toFixed(1));
      bySource.offlinePercentage = Number(((bySource.offline / totalClassifications) * 100).toFixed(1));
    }

    // 4. Model Version Breakdown
    const versionAgg = await Classification.aggregate([
      { $match: filter },
      { $group: { _id: '$modelVersion', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const byModelVersion = {};
    for (const item of versionAgg) {
      byModelVersion[item._id || 'unknown'] = item.count;
    }

    // 5. Average Inference Time (server predictions)
    const avgTimeAgg = await Classification.aggregate([
      {
        $match: {
          ...filter,
          inferenceTimeMs: { $gt: 0 },
          classificationSource: 'server',
        },
      },
      {
        $group: {
          _id: null,
          avgTime: { $avg: '$inferenceTimeMs' },
        },
      },
    ]);
    const averageInferenceTimeMs =
      avgTimeAgg.length > 0 && typeof avgTimeAgg[0].avgTime === 'number'
        ? Number(avgTimeAgg[0].avgTime.toFixed(2))
        : 0;

    // 6. Feedback Statistics & Confusion Pairs
    const feedbackAgg = await Feedback.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          correct: { $sum: { $cond: ['$isCorrect', 1, 0] } },
          incorrect: { $sum: { $cond: ['$isCorrect', 0, 1] } },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          reviewed: { $sum: { $cond: [{ $eq: ['$status', 'reviewed'] }, 1, 0] } },
          approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
        },
      },
    ]);

    const fbRow = feedbackAgg[0] || {
      total: 0,
      correct: 0,
      incorrect: 0,
      pending: 0,
      reviewed: 0,
      approved: 0,
      rejected: 0,
    };

    const feedbackAgreementRate =
      fbRow.total > 0 ? Number(((fbRow.correct / fbRow.total) * 100).toFixed(1)) : null;

    const feedbackStats = {
      totalFeedback: fbRow.total,
      correctReports: fbRow.correct,
      incorrectReports: fbRow.incorrect,
      userFeedbackAgreementRate: feedbackAgreementRate !== null ? `${feedbackAgreementRate}%` : null,
      byStatus: {
        pending: fbRow.pending,
        reviewed: fbRow.reviewed,
        approved: fbRow.approved,
        rejected: fbRow.rejected,
      },
      note: 'User feedback agreement reflects crowd feedback and is strictly separated from benchmark Test Accuracy.',
    };

    // Confusion Pairs (Predicted vs Correct misclassifications)
    const confusionAgg = await Feedback.aggregate([
      {
        $match: {
          $expr: { $ne: ['$predictedClass', '$correctClass'] },
        },
      },
      {
        $group: {
          _id: {
            predicted: '$predictedClass',
            correct: '$correctClass',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const confusionPairs = confusionAgg.map((item) => ({
      predictedClass: item._id.predicted,
      correctClass: item._id.correct,
      count: item.count,
      description: `AI predicted '${item._id.predicted}', user/reviewer corrected to '${item._id.correct}'`,
    }));

    // 7. Time Series Statistics (daily, weekly, monthly)
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const dailyAgg = await Classification.aggregate([
      { $match: { createdAt: { $gte: fourteenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const daily = dailyAgg.map((item) => ({
      date: item._id,
      count: item.count,
    }));

    const eightWeeksAgo = new Date(now.getTime() - 8 * 7 * 24 * 60 * 60 * 1000);
    const weeklyAgg = await Classification.aggregate([
      { $match: { createdAt: { $gte: eightWeeksAgo } } },
      {
        $group: {
          _id: {
            year: { $isoWeekYear: '$createdAt' },
            week: { $isoWeek: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.week': 1 } },
    ]);

    const weekly = weeklyAgg.map((item) => ({
      week: `${item._id.year}-W${String(item._id.week).padStart(2, '0')}`,
      count: item.count,
    }));

    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const monthlyAgg = await Classification.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const monthly = monthlyAgg.map((item) => ({
      month: item._id,
      count: item.count,
    }));

    // 8. Dataset Summary & Moderation Counts
    const [totalDatasetItems, splitAgg, diffAgg, consentGivenCount, moderatedFeedbackCount] =
      await Promise.all([
        DatasetItem.countDocuments(),
        DatasetItem.aggregate([{ $group: { _id: '$split', count: { $sum: 1 } } }]),
        DatasetItem.aggregate([{ $group: { _id: '$difficultyTag', count: { $sum: 1 } } }]),
        DatasetItem.countDocuments({ consentGiven: true }),
        Feedback.countDocuments({ status: { $in: ['reviewed', 'approved', 'rejected'] } }),
      ]);

    const bySplit = { train: 0, val: 0, test: 0 };
    for (const item of splitAgg) {
      if (bySplit.hasOwnProperty(item._id)) bySplit[item._id] = item.count;
    }

    const byDifficultyTag = {};
    for (const item of diffAgg) {
      byDifficultyTag[item._id] = item.count;
    }

    const datasetSummary = {
      totalItems: totalDatasetItems,
      bySplit,
      byDifficultyTag,
      consentGivenCount,
    };

    // Moderated images count ("Số lượng ảnh đã được kiểm duyệt")
    const moderatedImagesCount = moderatedFeedbackCount + totalDatasetItems;

    // 9. Active AI Model Benchmark Accuracy (from Model Registry)
    const activeModel = await ModelRegistry.findOne({ status: 'active' }).sort({ activatedAt: -1 });

    const activeModelAccuracy = {
      modelVersion: activeModel ? activeModel.version : 'v3',
      modelName: activeModel ? activeModel.modelName : 'ScanWaste MobileNetV2 V3',
      trainingAccuracy: activeModel?.trainingAccuracy ?? null,
      validationAccuracy: activeModel?.validationAccuracy ?? null,
      testAccuracy: activeModel?.testAccuracy ?? null,
      evaluationNotes:
        activeModel?.evaluationNotes ||
        'Official test benchmark accuracy is recorded during formal training evaluation, never synthesized.',
    };

    return {
      totalClassifications,
      byCategory,
      bySource,
      byModelVersion,
      averageInferenceTimeMs,
      feedbackStats,
      confusionPairs,
      timeSeries: {
        daily,
        weekly,
        monthly,
      },
      datasetSummary,
      moderatedImagesCount,
      activeModelAccuracy,
    };
  }
}

module.exports = new StatisticsService();
