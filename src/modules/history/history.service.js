const Classification = require('../classifications/classification.model');

function parseDate(value, endOfDay = false) {
  if (!value) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const error = new Error('Date must use YYYY-MM-DD format');
    error.statusCode = 400;
    throw error;
  }

  const time = endOfDay ? '23:59:59.999' : '00:00:00.000';
  const date = new Date(`${value}T${time}Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    const error = new Error('Invalid date');
    error.statusCode = 400;
    throw error;
  }

  return date;
}

class HistoryService {
  async getUserHistory(
    userId,
    { page = 1, limit = 10, from, to } = {}
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const query = { userId };
    const fromDate = parseDate(from);
    const toDate = parseDate(to, true);

    if (fromDate && toDate && fromDate > toDate) {
      const error = new Error('"from" must not be later than "to"');
      error.statusCode = 400;
      throw error;
    }

    if (fromDate || toDate) {
      query.createdAt = {};

      if (fromDate) query.createdAt.$gte = fromDate;
      if (toDate) query.createdAt.$lte = toDate;
    }

    const [items, totalCount] = await Promise.all([
      Classification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Classification.countDocuments(query),
    ]);

    return {
      items: items.map((item) => ({
        ...item.toJSON(),
        pointsEarned: item.pointsEarned ?? 0,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
      },
      filters: {
        from: from || null,
        to: to || null,
      },
    };
  }

  async getHistoryDetail(userId, id) {
    const classification = await Classification.findOne({
      _id: id,
      userId,
    });

    if (!classification) {
      const error = new Error('Classification record not found');
      error.statusCode = 404;
      throw error;
    }

    const result = classification.toJSON();

    return {
      ...result,
      pointsEarned: classification.pointsEarned ?? 0,
    };
  }
}

module.exports = new HistoryService();