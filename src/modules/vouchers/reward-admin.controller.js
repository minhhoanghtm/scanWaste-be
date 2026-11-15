const rewardAdminService = require('./reward-admin.service');
const { sendSuccess } = require('../../utils/response');

class RewardAdminController {
  async list(req, res, next) {
    try { return sendSuccess(res, 'Lấy danh sách phần quà thành công.', await rewardAdminService.list(req.query), 200); } catch (error) { return next(error); }
  }
  async create(req, res, next) {
    try { return sendSuccess(res, 'Tạo phần quà thành công.', await rewardAdminService.create(req.body || {}), 201); } catch (error) { return next(error); }
  }
  async update(req, res, next) {
    try { return sendSuccess(res, 'Cập nhật phần quà thành công.', await rewardAdminService.update(req.params.id, req.body || {}), 200); } catch (error) { return next(error); }
  }
  async redemptions(req, res, next) {
    try { return sendSuccess(res, 'Lấy lịch sử đổi quà thành công.', await rewardAdminService.listRedemptions(req.query), 200); } catch (error) { return next(error); }
  }
  async delete(req, res, next) {
    try { return sendSuccess(res, 'Xóa phần quà thành công.', await rewardAdminService.delete(req.params.id), 200); } catch (error) { return next(error); }
  }
  async exportExcel(req, res, next) {
    try {
      const workbook = await rewardAdminService.exportExcel(req.query);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=rewards-report.xlsx');
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) { return next(error); }
  }
  async exportRedemptionsExcel(req, res, next) {
    try {
      const workbook = await rewardAdminService.exportRedemptionsExcel(req.query);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=redemptions-report.xlsx');
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) { return next(error); }
  }
}

module.exports = new RewardAdminController();
