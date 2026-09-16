const Classification = require('../classifications/classification.model');

class HistoryService {
  /**
   * Get paginated classification history for a specific user
   * @param {string} userId
   * @param {object} query - { page, limit }
   */
  async getUserHistory(userId, { page = 1, limit = 10 } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const query = { userId };

    const [items, totalCount] = await Promise.all([
      Classification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Classification.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);

    return {
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages,
      },
    };
  }

  /**
   * Get single classification detail ensuring ownership
   * @param {string} userId
   * @param {string} id
   */
  async getHistoryDetail(userId, id) {
    const classification = await Classification.findOne({ _id: id, userId });
    if (!classification) {
      const error = new Error('Classification record not found');
      error.statusCode = 404;
      throw error;
    }
    return classification;
  }
}

module.exports = new HistoryService();
