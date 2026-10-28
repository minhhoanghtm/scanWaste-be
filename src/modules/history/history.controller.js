const historyService = require('./history.service');
const { sendSuccess } = require('../../utils/response');

class HistoryController {
  async getHistory(req, res, next) {
    try {
      const { page, limit, from, to } = req.query;
const result = await historyService.getUserHistory(req.user._id, {
  page,
  limit,
  from,
  to,
});
      return sendSuccess(res, 'Get history successfully', result, 200);
    } catch (error) {
      next(error);
    }
  }

  async getHistoryDetail(req, res, next) {
    try {
      const { id } = req.params;
      const result = await historyService.getHistoryDetail(req.user._id, id);
      return sendSuccess(res, 'Get classification detail successfully', result, 200);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new HistoryController();
