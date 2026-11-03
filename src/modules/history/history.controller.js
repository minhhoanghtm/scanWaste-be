const historyService = require('./history.service');
const { sendSuccess } = require('../../utils/response');

class HistoryController {
  // UC010: Get classification history
  async getHistory(req, res, next) {
    try {
      const {
        page,
        limit,
        source,
        category,
        startDate,
        endDate,
        from,
        to,
      } = req.query;

      const result = await historyService.getUserHistory(
        req.user._id,
        {
          page,
          limit,
          source,
          category,
          startDate,
          endDate,
          from,
          to,
        }
      );

      return sendSuccess(
        res,
        'Get history successfully',
        result,
        200
      );
    } catch (error) {
      return next(error);
    }
  }

  // Get classification detail
  async getHistoryDetail(req, res, next) {
    try {
      const { id } = req.params;

      const result = await historyService.getHistoryDetail(
        req.user._id,
        id,
        req.user.role
      );

      return sendSuccess(
        res,
        'Get classification detail successfully',
        result,
        200
      );
    } catch (error) {
      return next(error);
    }
  }

  // Delete classification history
  async deleteHistory(req, res, next) {
    try {
      const { id } = req.params;

      const result = await historyService.deleteHistoryItem(
        req.user._id,
        id,
        req.user.role
      );

      return sendSuccess(
        res,
        'Classification history deleted successfully',
        result,
        200
      );
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new HistoryController();