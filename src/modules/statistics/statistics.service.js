
const mongoose = require('mongoose');
const Classification = require('../classifications/classification.model');
const Feedback = require('../feedback/feedback.model');
const { DatasetItem } = require('../dataset/dataset.model');
const ModelRegistry = require('../ai/modelRegistry/modelRegistry.model');
const { SUPPORTED_WASTE_CLASSES } = require('../ai/ai.config');

// UC013: MongoDB ESG Budget
const EsgBudget = require('./esg-budget.model');

class StatisticsService {
  /**
   * Calculate waste classification statistics for a user
   * @param {string|mongoose.Types.ObjectId} userId
   */
  async getUserStatistics(userId) {
    const userObjectId =
      typeof userId === 'string'
        ? new mongoose.Types.ObjectId(userId)
        : userId;

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

    // Build base statistics structure with zero counts
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
   */
  async getAdminAIStatistics(query = {}) {
    const filter = {};

    if (query.modelVersion) {
      filter.modelVersion = query.modelVersion;
    }

    if (query.startDate || query.endDate) {
      filter.createdAt = {};

      if (query.startDate) {
        filter.createdAt.$gte = new Date(query.startDate);
      }

      if (query.endDate) {
        filter.createdAt.$lte = new Date(query.endDate);
      }
    }

    // 1. Classification Metrics
    const totalClassifications =
      await Classification.countDocuments(filter);

    // 2. Class Breakdown
    const categoryAgg = await Classification.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$predictedClass',
          count: { $sum: 1 },
        },
      },
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

    // 3. Source Breakdown
    const sourceAgg = await Classification.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$classificationSource',
          count: { $sum: 1 },
        },
      },
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
      bySource.serverPercentage = Number(
        ((bySource.server / totalClassifications) * 100).toFixed(1)
      );

      bySource.offlinePercentage = Number(
        ((bySource.offline / totalClassifications) * 100).toFixed(1)
      );
    }

    // 4. Model Version Breakdown
    const versionAgg = await Classification.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$modelVersion',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const byModelVersion = {};

    for (const item of versionAgg) {
      byModelVersion[item._id || 'unknown'] = item.count;
    }

    // 5. Average Inference Time
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
      avgTimeAgg.length > 0 &&
      typeof avgTimeAgg[0].avgTime === 'number'
        ? Number(avgTimeAgg[0].avgTime.toFixed(2))
        : 0;

    // 6. Feedback Statistics
    const feedbackAgg = await Feedback.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          correct: {
            $sum: { $cond: ['$isCorrect', 1, 0] },
          },
          incorrect: {
            $sum: { $cond: ['$isCorrect', 0, 1] },
          },
          pending: {
            $sum: {
              $cond: [{ $eq: ['$status', 'pending'] }, 1, 0],
            },
          },
          reviewed: {
            $sum: {
              $cond: [{ $eq: ['$status', 'reviewed'] }, 1, 0],
            },
          },
          approved: {
            $sum: {
              $cond: [{ $eq: ['$status', 'approved'] }, 1, 0],
            },
          },
          rejected: {
            $sum: {
              $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0],
            },
          },
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
      fbRow.total > 0
        ? Number(
            ((fbRow.correct / fbRow.total) * 100).toFixed(1)
          )
        : null;

    const feedbackStats = {
      totalFeedback: fbRow.total,
      correctReports: fbRow.correct,
      incorrectReports: fbRow.incorrect,
      userFeedbackAgreementRate:
        feedbackAgreementRate !== null
          ? `${feedbackAgreementRate}%`
          : null,
      byStatus: {
        pending: fbRow.pending,
        reviewed: fbRow.reviewed,
        approved: fbRow.approved,
        rejected: fbRow.rejected,
      },
      note:
        'User feedback agreement reflects crowd feedback and is strictly separated from benchmark Test Accuracy.',
    };

    // Confusion Pairs
    const confusionAgg = await Feedback.aggregate([
      {
        $match: {
          $expr: {
            $ne: ['$predictedClass', '$correctClass'],
          },
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
      description:
        `AI predicted '${item._id.predicted}', ` +
        `user/reviewer corrected to '${item._id.correct}'`,
    }));

    // 7. Time Series Statistics
    const now = new Date();

    const fourteenDaysAgo = new Date(
      now.getTime() - 14 * 24 * 60 * 60 * 1000
    );

    const dailyAgg = await Classification.aggregate([
      {
        $match: {
          createdAt: { $gte: fourteenDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt',
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const daily = dailyAgg.map((item) => ({
      date: item._id,
      count: item.count,
    }));

    const eightWeeksAgo = new Date(
      now.getTime() - 8 * 7 * 24 * 60 * 60 * 1000
    );

    const weeklyAgg = await Classification.aggregate([
      {
        $match: {
          createdAt: { $gte: eightWeeksAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $isoWeekYear: '$createdAt' },
            week: { $isoWeek: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: {
          '_id.year': 1,
          '_id.week': 1,
        },
      },
    ]);

    const weekly = weeklyAgg.map((item) => ({
      week:
        `${item._id.year}-W` +
        String(item._id.week).padStart(2, '0'),
      count: item.count,
    }));

    const sixMonthsAgo = new Date(
      now.getTime() - 180 * 24 * 60 * 60 * 1000
    );

    const monthlyAgg = await Classification.aggregate([
      {
        $match: {
          createdAt: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m',
              date: '$createdAt',
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const monthly = monthlyAgg.map((item) => ({
      month: item._id,
      count: item.count,
    }));

    // 8. Dataset Summary
    const [
      totalDatasetItems,
      splitAgg,
      diffAgg,
      consentGivenCount,
      moderatedFeedbackCount,
    ] = await Promise.all([
      DatasetItem.countDocuments(),
      DatasetItem.aggregate([
        {
          $group: {
            _id: '$split',
            count: { $sum: 1 },
          },
        },
      ]),
      DatasetItem.aggregate([
        {
          $group: {
            _id: '$difficultyTag',
            count: { $sum: 1 },
          },
        },
      ]),
      DatasetItem.countDocuments({
        consentGiven: true,
      }),
      Feedback.countDocuments({
        status: {
          $in: ['reviewed', 'approved', 'rejected'],
        },
      }),
    ]);

    const bySplit = {
      train: 0,
      val: 0,
      test: 0,
    };

    for (const item of splitAgg) {
      if (bySplit.hasOwnProperty(item._id)) {
        bySplit[item._id] = item.count;
      }
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

    const moderatedImagesCount =
      moderatedFeedbackCount + totalDatasetItems;

    // 9. Active AI Model
    const activeModel = await ModelRegistry.findOne({
      status: 'active',
    }).sort({
      activatedAt: -1,
    });

    const activeModelAccuracy = {
      modelVersion: activeModel
        ? activeModel.version
        : 'v3',
      modelName: activeModel
        ? activeModel.modelName
        : 'ScanWaste MobileNetV2 V3',
      trainingAccuracy:
        activeModel?.trainingAccuracy ?? null,
      validationAccuracy:
        activeModel?.validationAccuracy ?? null,
      testAccuracy:
        activeModel?.testAccuracy ?? null,
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


  // UC013: Get global ESG budget
  async getEsgBudget() {
    const data = await EsgBudget.findOneAndUpdate(
      { key: 'global' },
      {
        $setOnInsert: {
          budget: 10000000,
          spent: 3500000,
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
      }
    );

    return this.formatEsgBudget(data);
  }

  // UC013: Format budget information
  formatEsgBudget(data) {
    const remaining = data.budget - data.spent;

    const progress = data.budget > 0
      ? Number((data.spent / data.budget).toFixed(4))
      : 0;

    return {
      budget: data.budget,
      spent: data.spent,
      remaining,
      progress,
      progressPercent: Number((progress * 100).toFixed(2)),
      unit: 'VND',
      currency: 'VND',
      lastUpdated: data.updatedAt.toISOString(),
    };
  }

  // UC013: Update global ESG budget
  async updateEsgBudget(value) {
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value <= 0
    ) {
      const error = new Error(
        'Budget must be a positive safe integer.'
      );
      error.statusCode = 400;
      error.errorCode = 'INVALID_BUDGET';
      throw error;
    }

    // Ensure the global budget document exists
    await this.getEsgBudget();

    // Atomic update: new budget cannot be lower than spent
    const data = await EsgBudget.findOneAndUpdate(
      {
        key: 'global',
        spent: { $lte: value },
      },
      {
        $set: {
          budget: value,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!data) {
      const error = new Error(
        'New budget cannot be lower than the amount already spent.'
      );
      error.statusCode = 400;
      error.errorCode = 'BUDGET_BELOW_SPENT';
      throw error;
    }

    return this.formatEsgBudget(data);
  }

}

module.exports = new StatisticsService();
