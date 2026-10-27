const statisticsService = require('./statistics.service');
const { sendSuccess } = require('../../utils/response');

class StatisticsController {
  async getStatistics(req, res, next) {
    try {
      const result = await statisticsService.getUserStatistics(req.user._id);
      return sendSuccess(res, 'Get statistics successfully', result, 200);
    } catch (error) {
      next(error);
    }
  }

  async getAdminStatistics(req, res, next) {
    try {
      const result = await statisticsService.getAdminAIStatistics(req.query);
      return sendSuccess(res, 'Admin AI statistics retrieved successfully', result, 200);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new StatisticsController();
