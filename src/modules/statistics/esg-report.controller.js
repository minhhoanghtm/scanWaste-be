const ExcelJS = require('exceljs');
const esgReportService = require('./esg-report.service');
const { sendSuccess, sendError } = require('../../utils/response');

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_REGEX.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return !Number.isNaN(date.getTime())
    && date.toISOString().slice(0, 10) === value;
}

function validatePeriod(query) {
  const { from, to } = query;

  if (!isValidDate(from) || !isValidDate(to)) {
    return 'Vui long nhap from va to theo dinh dang YYYY-MM-DD.';
  }

  if (from > to) {
    return 'Ngay bat dau khong duoc lon hon ngay ket thuc.';
  }

  return null;
}

class EsgReportController {
  // GET /api/admin/reports/statistics
  async getAdminReport(req, res, next) {
    try {
      const validationError = validatePeriod(req.query);

      if (validationError) {
        return sendError(
          res,
          validationError,
          [],
          400,
          'INVALID_DATE_RANGE'
        );
      }

      const report = await esgReportService.getAdminReport(req.query);

      const message = report.hasData
        ? 'Lay bao cao ESG thanh cong.'
        : 'Khong co du lieu trong khoang thoi gian da chon.';

      return sendSuccess(res, message, report, 200);
    } catch (error) {
      return next(error);
    }
  }

  // GET /api/admin/reports/export
  async exportAdminReport(req, res, next) {
    try {
      const validationError = validatePeriod(req.query);

      if (validationError) {
        return sendError(
          res,
          validationError,
          [],
          400,
          'INVALID_DATE_RANGE'
        );
      }

      const format = req.query.format || 'xlsx';

      if (format !== 'xlsx') {
        return sendError(
          res,
          'Hien tai chi ho tro xuat file Excel (.xlsx).',
          [],
          400,
          'UNSUPPORTED_EXPORT_FORMAT'
        );
      }

      const report = await esgReportService.getAdminReport(req.query);

      if (!report.hasData) {
        return sendError(
          res,
          'Khong co du lieu de xuat bao cao trong khoang thoi gian da chon.',
          [],
          404,
          'NO_REPORT_DATA'
        );
      }

      const workbook = new ExcelJS.Workbook();

      workbook.creator = 'EcoSort AI';
      workbook.subject = 'ESG Statistics Report';
      workbook.title = 'EcoSort AI - ESG Report';
      workbook.created = new Date();

      // Sheet 1: Overview
      const overview = workbook.addWorksheet('Tổng quan');

      overview.columns = [
        { header: 'Chỉ số', key: 'metric', width: 32 },
        { header: 'Giá trị', key: 'value', width: 25 },
        { header: 'Trạng thái', key: 'status', width: 22 },
        { header: 'Ghi chú', key: 'note', width: 65 },
      ];

      overview.addRow({
        metric: 'Báo cáo ESG - ScanWaste',
      });

      overview.addRow({
        metric: 'Từ ngày',
        value: report.period.from,
      });

      overview.addRow({
        metric: 'Đến ngày',
        value: report.period.to,
      });

      overview.addRow({
        metric: 'Múi giờ',
        value: report.period.timeZone,
      });

      overview.addRow({});

      overview.addRows([
        {
          metric: 'Tổng lượt quét',
          value: report.summary.totalScans,
          status: 'Khả dụng',
          note: 'Tính từ Classification.createdAt',
        },
        {
          metric: 'Tổng điểm đã cấp',
          value: 'Chưa có dữ liệu',
          status: 'Chưa khả dụng',
          note: report.notes.pointsIssued,
        },
        {
          metric: 'Voucher đã đổi',
          value: 'Chưa có dữ liệu',
          status: 'Chưa khả dụng',
          note: report.notes.vouchersRedeemed,
        },
        {
          metric: 'Khối lượng rác (kg)',
          value: 'Chưa có dữ liệu',
          status: 'Chưa khả dụng',
          note: report.notes.wasteWeightKg,
        },
        {
          metric: 'CO2 giảm thải (kg)',
          value: 'Chưa có dữ liệu',
          status: 'Chưa khả dụng',
          note: report.notes.co2ReducedKg,
        },
      ]);

      overview.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF00B88A' } };
      overview.getRow(6).font = { bold: true };

      // Sheet 2: Waste classification breakdown
      const categorySheet = workbook.addWorksheet('Phân loại rác');

      categorySheet.columns = [
        { header: 'Loại rác', key: 'wasteClass', width: 30 },
        { header: 'Số lượt', key: 'count', width: 20 },
      ];

      Object.entries(report.summary.byWasteClass).forEach(
        ([wasteClass, count]) => {
          categorySheet.addRow({
            wasteClass,
            count,
          });
        }
      );

      // Sheet 3: Daily statistics
      const dailySheet = workbook.addWorksheet('Thống kê theo ngày');

      dailySheet.columns = [
        { header: 'Ngày', key: 'date', width: 22 },
        { header: 'Số lượt quét', key: 'count', width: 20 },
      ];

      report.dailyScans.forEach((item) => {
        dailySheet.addRow(item);
      });

      // Sheet 4: Data notes
      const notesSheet = workbook.addWorksheet('Ghi chú');

      notesSheet.columns = [
        { header: 'Chỉ số', key: 'metric', width: 30 },
        { header: 'Ghi chú', key: 'note', width: 90 },
      ];

      notesSheet.addRows([
        {
          metric: 'Thời gian',
          note: 'Dữ liệu được lọc theo múi giờ Việt Nam (Asia/Ho_Chi_Minh).',
        },
        {
          metric: 'Lượt quét',
          note: report.notes.classificationDate,
        },
        {
          metric: 'Điểm thưởng',
          note: report.notes.pointsIssued,
        },
        {
          metric: 'Voucher',
          note: report.notes.vouchersRedeemed,
        },
        {
          metric: 'Khối lượng rác',
          note: report.notes.wasteWeightKg,
        },
        {
          metric: 'CO2',
          note: report.notes.co2ReducedKg,
        },
      ]);

      [categorySheet, dailySheet, notesSheet].forEach((sheet) => {
        sheet.getRow(1).font = { bold: true };
        sheet.views = [{ state: 'frozen', ySplit: 1 }];
      });

      overview.views = [{ state: 'frozen', ySplit: 5 }];

      const buffer = await workbook.xlsx.writeBuffer();

      const filename =
        `ecosort-esg-report-${report.period.from}-to-${report.period.to}.xlsx`;

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`
      );

      res.setHeader('Cache-Control', 'no-store');

      return res.status(200).send(Buffer.from(buffer));
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new EsgReportController();