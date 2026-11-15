const ExcelJS = require('exceljs');
const Reward = require('./reward.model');
const VoucherWallet = require('./voucher-wallet.model');

const ALLOWED_CATEGORIES = ['F&B', 'Eco-Products', 'Donation'];

const appError = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });

const toPositiveInteger = (value, fallback, maximum) => {
  const result = Number(value ?? fallback);
  if (!Number.isInteger(result) || result < 1 || result > maximum) {
    throw appError(`Giá trị phải là số nguyên từ 1 đến ${maximum}.`);
  }
  return result;
};

const normalizeRewardInput = (payload, { partial = false } = {}) => {
  const input = {};
  const requiredText = ['id', 'name', 'partnerName'];

  requiredText.forEach((key) => {
    if (payload[key] !== undefined) {
      const value = String(payload[key]).trim();
      if (!value) throw appError(`${key} không được để trống.`);
      input[key] = value;
    } else if (!partial) {
      throw appError(`${key} là bắt buộc.`);
    }
  });

  if (payload.category !== undefined) {
    if (!ALLOWED_CATEGORIES.includes(payload.category)) {
      throw appError('Danh mục phần quà không hợp lệ.');
    }
    input.category = payload.category;
  } else if (!partial) {
    throw appError('category là bắt buộc.');
  }

  ['points', 'stock'].forEach((key) => {
    if (payload[key] !== undefined) {
      const value = Number(payload[key]);
      if (!Number.isInteger(value) || value < (key === 'points' ? 1 : 0)) {
        throw appError(`${key} không hợp lệ.`);
      }
      input[key] = value;
    } else if (!partial) {
      throw appError(`${key} là bắt buộc.`);
    }
  });

  if (payload.description !== undefined) input.description = String(payload.description).trim();
  if (payload.isActive !== undefined) {
    if (typeof payload.isActive !== 'boolean') throw appError('isActive phải là boolean.');
    input.isActive = payload.isActive;
  }
  return input;
};

class RewardAdminService {
  async list(query) {
    const page = toPositiveInteger(query.page, 1, 100000);
    const limit = toPositiveInteger(query.limit, 20, 100);
    const filter = {};
    if (query.active !== undefined) {
      if (query.active !== 'true' && query.active !== 'false') throw appError('active phải là true hoặc false.');
      filter.isActive = query.active === 'true';
    }
    if (query.q?.trim()) {
      const escaped = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ id: new RegExp(escaped, 'i') }, { name: new RegExp(escaped, 'i') }, { partnerName: new RegExp(escaped, 'i') }];
    }
    const [items, totalCount] = await Promise.all([
      Reward.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Reward.countDocuments(filter),
    ]);
    return { items, pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) } };
  }

  async create(payload) {
    const input = normalizeRewardInput(payload);
    const existing = await Reward.exists({ id: input.id });
    if (existing) throw appError('Mã phần quà đã tồn tại.', 409);
    const reward = await Reward.create(input);
    return reward.toJSON();
  }

  async update(id, payload) {
    const input = normalizeRewardInput(payload, { partial: true });
    if (!Object.keys(input).length) throw appError('Không có dữ liệu cập nhật.');
    if (input.id) {
      const duplicate = await Reward.exists({ id: input.id, _id: { $ne: id } });
      if (duplicate) throw appError('Mã phần quà đã tồn tại.', 409);
    }
    const reward = await Reward.findByIdAndUpdate(id, { $set: input }, { new: true, runValidators: true });
    if (!reward) throw appError('Không tìm thấy phần quà.', 404);
    return reward.toJSON();
  }

  async listRedemptions(query) {
    const page = toPositiveInteger(query.page, 1, 100000);
    const limit = toPositiveInteger(query.limit, 20, 100);
    const filter = query.status ? { status: query.status } : {};
    const [items, totalCount] = await Promise.all([
      VoucherWallet.find(filter).sort({ redeemedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate('userId', 'name email role').lean(),
      VoucherWallet.countDocuments(filter),
    ]);
    return { items, pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) } };
  }
  async delete(id) {
    if (!id) throw appError('Mã ID không hợp lệ.', 400);
    const reward = await Reward.findByIdAndDelete(id);
    if (!reward) throw appError('Không tìm thấy phần quà.', 404);
    return { success: true, message: 'Đã xóa phần quà.' };
  }

  async exportExcel(query = {}) {
    const filter = {};
    if (query.active !== undefined && query.active !== '') {
      filter.isActive = query.active === 'true';
    }
    if (query.q?.trim()) {
      const escaped = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ id: new RegExp(escaped, 'i') }, { name: new RegExp(escaped, 'i') }, { partnerName: new RegExp(escaped, 'i') }];
    }

    const rewards = await Reward.find(filter).sort({ createdAt: -1 }).lean();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ScanWaste Admin';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Danh sách Phần Quà');

    sheet.columns = [
      { header: 'STT', key: 'stt', width: 8 },
      { header: 'Mã Quà', key: 'id', width: 16 },
      { header: 'Tên Phần Quà', key: 'name', width: 32 },
      { header: 'Danh mục', key: 'category', width: 18 },
      { header: 'Đối tác', key: 'partnerName', width: 22 },
      { header: 'Điểm đổi', key: 'points', width: 14 },
      { header: 'Tồn kho', key: 'stock', width: 14 },
      { header: 'Trạng thái', key: 'status', width: 16 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF00B88A' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 24;

    rewards.forEach((r, idx) => {
      const row = sheet.addRow({
        stt: idx + 1,
        id: r.id,
        name: r.name,
        category: r.category,
        partnerName: r.partnerName,
        points: r.points,
        stock: r.stock,
        status: r.isActive ? 'Đang hoạt động' : 'Tạm ẩn',
      });
      row.alignment = { vertical: 'middle' };
      row.getCell('stt').alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell('points').numFmt = '#,##0';
      row.getCell('stock').numFmt = '#,##0';
      row.getCell('status').alignment = { vertical: 'middle', horizontal: 'center' };
    });

    return workbook;
  }

  async exportRedemptionsExcel(query = {}) {
    const filter = query.status ? { status: query.status } : {};
    const items = await VoucherWallet.find(filter)
      .sort({ redeemedAt: -1 })
      .populate('userId', 'name email role')
      .lean();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ScanWaste Admin';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Lịch sử Đổi Thưởng');

    sheet.columns = [
      { header: 'STT', key: 'stt', width: 8 },
      { header: 'Người đổi', key: 'userName', width: 24 },
      { header: 'Email', key: 'userEmail', width: 28 },
      { header: 'Phần quà / Voucher', key: 'voucherName', width: 30 },
      { header: 'Đối tác', key: 'partnerName', width: 20 },
      { header: 'Mã nhận', key: 'voucherCode', width: 18 },
      { header: 'Điểm sử dụng', key: 'pointsUsed', width: 16 },
      { header: 'Thời gian đổi', key: 'redeemedAt', width: 20 },
      { header: 'Trạng thái', key: 'status', width: 16 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF00B88A' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 24;

    items.forEach((item, idx) => {
      const row = sheet.addRow({
        stt: idx + 1,
        userName: item.userId?.name || 'N/A',
        userEmail: item.userId?.email || 'N/A',
        voucherName: item.voucherName,
        partnerName: item.partnerName || '',
        voucherCode: item.voucherCode,
        pointsUsed: item.pointsUsed,
        redeemedAt: new Date(item.redeemedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
        status: item.status === 'used' ? 'Đã sử dụng' : 'Khả dụng',
      });
      row.alignment = { vertical: 'middle' };
      row.getCell('stt').alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell('pointsUsed').numFmt = '#,##0';
      row.getCell('status').alignment = { vertical: 'middle', horizontal: 'center' };
    });

    return workbook;
  }
}

module.exports = new RewardAdminService();
