const mongoose = require('mongoose');
const Classification = require('../classifications/classification.model');
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
}

module.exports = new StatisticsService();
