const dashboardService = require('./dashboard.service');
const { sendSuccess } = require('../../utils/response');

class DashboardController {
  async getKpis(req, res, next) {
    try {
      const data = await dashboardService.getKpis();
      return sendSuccess(res, 'Lấy dữ liệu KPI dashboard thành công.', data, 200);
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new DashboardController();
