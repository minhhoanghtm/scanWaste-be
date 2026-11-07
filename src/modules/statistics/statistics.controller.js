
const statisticsService = require('./statistics.service');
const { sendSuccess } = require('../../utils/response');

class StatisticsController {
  async getStatistics(req, res, next) {
    try {
      const result = await statisticsService.getUserStatistics(req.user._id);
      return sendSuccess(res, 'Get statistics successfully', result, 200);
    } catch (error) {
      return next(error);
    }
  }

  async getAdminStatistics(req, res, next) {
    try {
      const result = await statisticsService.getAdminAIStatistics(req.query);
      return sendSuccess(res, 'Admin AI statistics retrieved successfully', result, 200);
    } catch (error) {
      return next(error);
    }
  }

  // UC013: Xem ngân sách ESG chung
  async getEsgBudget(req, res, next) {
    try {
      const result = await statisticsService.getEsgBudget();

      return sendSuccess(
        res,
        'Get ESG budget successfully',
        result,
        200
      );
    } catch (error) {
      return next(error);
    }
  }

  // UC013: Cập nhật ngân sách ESG chung
  async updateEsgBudget(req, res, next) {
    try {
      const { budget } = req.body || {};
      const result = await statisticsService.updateEsgBudget(budget);

      return sendSuccess(
        res,
        'Update ESG budget successfully',
        result,
        200
      );
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new StatisticsController();
