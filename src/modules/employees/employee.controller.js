const employeeService = require('./employee.service');
const { sendSuccess } = require('../../utils/response');

class EmployeeController {
  async list(req, res, next) {
    try {
      const data = await employeeService.list(req.query);
      return sendSuccess(res, 'Lấy danh sách nhân viên thành công.', data, 200);
    } catch (error) {
      return next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const data = await employeeService.getById(req.params.id);
      return sendSuccess(res, 'Lấy thông tin nhân viên thành công.', data, 200);
    } catch (error) {
      return next(error);
    }
  }

  async create(req, res, next) {
    try {
      const data = await employeeService.create(req.body);
      return sendSuccess(res, 'Tạo hồ sơ nhân viên thành công.', data, 201);
    } catch (error) {
      return next(error);
    }
  }

  async update(req, res, next) {
    try {
      const data = await employeeService.update(req.params.id, req.body);
      return sendSuccess(res, 'Cập nhật nhân viên thành công.', data, 200);
    } catch (error) {
      return next(error);
    }
  }

  async delete(req, res, next) {
    try {
      const data = await employeeService.delete(req.params.id);
      return sendSuccess(res, 'Khóa tài khoản nhân viên thành công.', data, 200);
    } catch (error) {
      return next(error);
    }
  }

  async exportExcel(req, res, next) {
    try {
      const workbook = await employeeService.exportExcel(req.query);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=employees-report.xlsx'
      );
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new EmployeeController();
