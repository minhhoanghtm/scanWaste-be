const voucherService = require('./voucher.service');
const { sendSuccess } = require('../../utils/response');

class VoucherController {
  async list(req, res, next) {
    try {
      const data = await voucherService.list(req.query);
      return sendSuccess(res, 'Lấy danh sách voucher thành công.', data, 200);
    } catch (error) {
      return next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const data = await voucherService.getById(req.params.id);
      return sendSuccess(res, 'Lấy thông tin voucher thành công.', data, 200);
    } catch (error) {
      return next(error);
    }
  }

  async create(req, res, next) {
    try {
      const data = await voucherService.create(req.body);
      return sendSuccess(res, 'Tạo voucher thành công.', data, 201);
    } catch (error) {
      return next(error);
    }
  }

  async update(req, res, next) {
    try {
      const data = await voucherService.update(req.params.id, req.body);
      return sendSuccess(res, 'Cập nhật voucher thành công.', data, 200);
    } catch (error) {
      return next(error);
    }
  }

  async delete(req, res, next) {
    try {
      const data = await voucherService.delete(req.params.id);
      return sendSuccess(res, 'Xóa voucher thành công.', data, 200);
    } catch (error) {
      return next(error);
    }
  }

  async use(req, res, next) {
    try {
      const data = await voucherService.useVoucher({
        code: req.body.code,
        userId: req.user._id,
        userEmail: req.user.email,
        orderValue: req.body.orderValue,
        userPoints: req.user.totalPoints || 0,
      });
      return sendSuccess(res, 'Áp dụng voucher thành công.', data, 200);
    } catch (error) {
      return next(error);
    }
  }

  async exportExcel(req, res, next) {
    try {
      const workbook = await voucherService.exportExcel(req.query);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=vouchers-report.xlsx'
      );
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new VoucherController();
