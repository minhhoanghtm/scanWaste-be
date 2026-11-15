const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const Voucher = require('./voucher.model');

const appError = (message, statusCode = 400, errorCode = 'VALIDATION_ERROR') =>
  Object.assign(new Error(message), { statusCode, errorCode });

const toPositiveInteger = (value, fallback, maximum) => {
  const result = Number(value ?? fallback);
  if (!Number.isInteger(result) || result < 1 || result > maximum) {
    throw appError(`Giá trị phải là số nguyên từ 1 đến ${maximum}.`);
  }
  return result;
};

class VoucherService {
  async list(query = {}) {
    const page = toPositiveInteger(query.page, 1, 100000);
    const limit = toPositiveInteger(query.limit, 20, 100);
    const filter = {};

    if (query.isActive !== undefined && query.isActive !== '') {
      filter.isActive = String(query.isActive) === 'true';
    }

    if (query.q && query.q.trim()) {
      const escaped = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { code: new RegExp(escaped, 'i') },
        { title: new RegExp(escaped, 'i') },
        { description: new RegExp(escaped, 'i') },
      ];
    }

    const [items, totalCount] = await Promise.all([
      Voucher.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Voucher.countDocuments(filter),
    ]);

    return {
      items: items.map((doc) => {
        const item = { ...doc, id: String(doc._id) };
        delete item._id;
        delete item.__v;
        return item;
      }),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
    };
  }

  async getById(id) {
    if (!mongoose.isValidObjectId(id)) throw appError('Mã ID không hợp lệ.', 400);
    const voucher = await Voucher.findById(id);
    if (!voucher) throw appError('Không tìm thấy voucher.', 404);
    return voucher.toJSON();
  }

  async create(payload = {}) {
    const code = String(payload.code || '').trim().toUpperCase();
    const title = String(payload.title || '').trim();
    if (!code) throw appError('Mã voucher là bắt buộc.');
    if (!title) throw appError('Tiêu đề voucher là bắt buộc.');

    const existing = await Voucher.findOne({ code });
    if (existing) throw appError('Mã voucher đã tồn tại.', 409, 'DUPLICATE_CODE');

    const discountType = ['fixed', 'percentage'].includes(payload.discountType)
      ? payload.discountType
      : 'fixed';
    const discountValue = Number(payload.discountValue);
    if (isNaN(discountValue) || discountValue < 0) {
      throw appError('Giá trị ưu đãi không hợp lệ.');
    }
    if (discountType === 'percentage' && discountValue > 100) {
      throw appError('Tỷ lệ giảm giá không được vượt quá 100%.');
    }

    const validFrom = new Date(payload.validFrom);
    const validTo = new Date(payload.validTo);
    if (isNaN(validFrom.getTime()) || isNaN(validTo.getTime())) {
      throw appError('Ngày bắt đầu hoặc kết thúc không hợp lệ.');
    }
    if (validFrom > validTo) {
      throw appError('Ngày bắt đầu không được sau ngày kết thúc.');
    }

    const maxUsage = Number(payload.maxUsage || 100);
    if (!Number.isInteger(maxUsage) || maxUsage < 1) {
      throw appError('Lượt sử dụng tối đa phải từ 1.');
    }

    const voucher = await Voucher.create({
      code,
      title,
      discountType,
      discountValue,
      minOrderValue: Math.max(0, Number(payload.minOrderValue || 0)),
      minPoints: Math.max(0, Number(payload.minPoints || 0)),
      maxUsage,
      currentUsage: 0,
      validFrom,
      validTo,
      isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : true,
      description: String(payload.description || '').trim(),
    });

    return voucher.toJSON();
  }

  async update(id, payload = {}) {
    if (!mongoose.isValidObjectId(id)) throw appError('Mã ID không hợp lệ.', 400);
    const updateData = {};

    if (payload.title !== undefined) {
      const title = String(payload.title).trim();
      if (!title) throw appError('Tiêu đề không được để trống.');
      updateData.title = title;
    }

    if (payload.code !== undefined) {
      const code = String(payload.code).trim().toUpperCase();
      if (!code) throw appError('Mã voucher không được để trống.');
      const duplicate = await Voucher.findOne({ code, _id: { $ne: id } });
      if (duplicate) throw appError('Mã voucher đã tồn tại.', 409, 'DUPLICATE_CODE');
      updateData.code = code;
    }

    if (payload.discountType !== undefined) {
      if (!['fixed', 'percentage'].includes(payload.discountType)) {
        throw appError('Loại ưu đãi không hợp lệ.');
      }
      updateData.discountType = payload.discountType;
    }

    if (payload.discountValue !== undefined) {
      const val = Number(payload.discountValue);
      if (isNaN(val) || val < 0) throw appError('Giá trị ưu đãi không hợp lệ.');
      updateData.discountValue = val;
    }

    if (payload.validFrom !== undefined && payload.validTo !== undefined) {
      const from = new Date(payload.validFrom);
      const to = new Date(payload.validTo);
      if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) {
        throw appError('Khoảng thời gian hiệu lực không hợp lệ.');
      }
      updateData.validFrom = from;
      updateData.validTo = to;
    }

    if (payload.maxUsage !== undefined) {
      const max = Number(payload.maxUsage);
      if (!Number.isInteger(max) || max < 1) throw appError('Lượt sử dụng tối đa phải từ 1.');
      updateData.maxUsage = max;
    }

    if (payload.minOrderValue !== undefined) updateData.minOrderValue = Math.max(0, Number(payload.minOrderValue));
    if (payload.minPoints !== undefined) updateData.minPoints = Math.max(0, Number(payload.minPoints));
    if (payload.isActive !== undefined) updateData.isActive = Boolean(payload.isActive);
    if (payload.description !== undefined) updateData.description = String(payload.description).trim();

    const voucher = await Voucher.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
    if (!voucher) throw appError('Không tìm thấy voucher.', 404);
    return voucher.toJSON();
  }

  async delete(id) {
    if (!mongoose.isValidObjectId(id)) throw appError('Mã ID không hợp lệ.', 400);
    const voucher = await Voucher.findByIdAndDelete(id);
    if (!voucher) throw appError('Không tìm thấy voucher.', 404);
    return { success: true, message: 'Đã xóa voucher.' };
  }

  async useVoucher({ code, userId, userEmail = '', orderValue = 0, userPoints = 0 }) {
    if (!code) throw appError('Mã voucher là bắt buộc.');
    const normalizedCode = String(code).trim().toUpperCase();

    const now = new Date();
    const voucher = await Voucher.findOne({
      code: normalizedCode,
      isActive: true,
      validFrom: { $lte: now },
      validTo: { $gte: now },
    });

    if (!voucher) {
      throw appError('Voucher không hợp lệ hoặc đã hết hạn.', 404, 'VOUCHER_EXPIRED_OR_INVALID');
    }

    if (voucher.currentUsage >= voucher.maxUsage) {
      throw appError('Voucher đã hết lượt sử dụng.', 400, 'VOUCHER_LIMIT_REACHED');
    }

    if (voucher.minPoints > 0 && userPoints < voucher.minPoints) {
      throw appError(`Bạn cần tối thiểu ${voucher.minPoints} điểm để sử dụng voucher này.`, 400, 'INSUFFICIENT_POINTS');
    }

    if (voucher.minOrderValue > 0 && orderValue < voucher.minOrderValue) {
      throw appError(`Đơn hàng cần tối thiểu ${voucher.minOrderValue.toLocaleString('vi-VN')}đ.`, 400, 'MIN_ORDER_VALUE_NOT_MET');
    }

    // Atomic increment usage preventing race conditions
    const updated = await Voucher.findOneAndUpdate(
      {
        _id: voucher._id,
        currentUsage: { $lt: voucher.maxUsage },
      },
      {
        $inc: { currentUsage: 1 },
        $push: {
          usageHistory: {
            userId,
            userEmail,
            usedAt: now,
            discountApplied:
              voucher.discountType === 'percentage'
                ? Math.round((orderValue * voucher.discountValue) / 100)
                : voucher.discountValue,
          },
        },
      },
      { new: true }
    );

    if (!updated) {
      throw appError('Voucher vừa hết lượt sử dụng.', 409, 'VOUCHER_EXHAUSTED');
    }

    return updated.toJSON();
  }

  async exportExcel(query = {}) {
    const filter = {};
    if (query.isActive !== undefined && query.isActive !== '') {
      filter.isActive = String(query.isActive) === 'true';
    }
    if (query.q && query.q.trim()) {
      const escaped = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { code: new RegExp(escaped, 'i') },
        { title: new RegExp(escaped, 'i') },
      ];
    }

    const vouchers = await Voucher.find(filter).sort({ createdAt: -1 }).lean();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ScanWaste Admin';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Danh sách Voucher');

    sheet.columns = [
      { header: 'STT', key: 'stt', width: 8 },
      { header: 'Mã Voucher', key: 'code', width: 18 },
      { header: 'Tiêu đề', key: 'title', width: 30 },
      { header: 'Loại ưu đãi', key: 'discountType', width: 16 },
      { header: 'Giá trị ưu đãi', key: 'discountValue', width: 18 },
      { header: 'Lượt sử dụng', key: 'usage', width: 16 },
      { header: 'Hiệu lực từ', key: 'validFrom', width: 20 },
      { header: 'Hiệu lực đến', key: 'validTo', width: 20 },
      { header: 'Trạng thái', key: 'status', width: 16 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF00B88A' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 24;

    vouchers.forEach((v, index) => {
      const row = sheet.addRow({
        stt: index + 1,
        code: v.code,
        title: v.title,
        discountType: v.discountType === 'percentage' ? 'Giảm %' : 'Giảm tiền mặt',
        discountValue:
          v.discountType === 'percentage'
            ? `${v.discountValue}%`
            : `${v.discountValue.toLocaleString('vi-VN')} đ`,
        usage: `${v.currentUsage} / ${v.maxUsage}`,
        validFrom: new Date(v.validFrom).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
        validTo: new Date(v.validTo).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
        status: v.isActive ? 'Đang hoạt động' : 'Tạm dừng',
      });
      row.alignment = { vertical: 'middle' };
      row.getCell('stt').alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell('code').alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell('status').alignment = { vertical: 'middle', horizontal: 'center' };
    });

    return workbook;
  }
}

module.exports = new VoucherService();
