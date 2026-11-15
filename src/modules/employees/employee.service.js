const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const User = require('../users/user.model');
const Station = require('../stations/station.model');

const appError = (message, statusCode = 400, errorCode = 'VALIDATION_ERROR') =>
  Object.assign(new Error(message), { statusCode, errorCode });

const toPositiveInteger = (value, fallback, maximum) => {
  const result = Number(value ?? fallback);
  if (!Number.isInteger(result) || result < 1 || result > maximum) {
    throw appError(`Giá trị phải là số nguyên từ 1 đến ${maximum}.`);
  }
  return result;
};

const normalizePhone = (phone) => {
  if (!phone) return undefined;
  let p = String(phone).trim().replace(/[\s.-]/g, '');
  if (p.startsWith('0')) p = '+84' + p.slice(1);
  return p;
};

class EmployeeService {
  async syncStationAssignment(user, nextStationId) {
    const previousStationId = user.assignedStation ? String(user.assignedStation) : null;
    const nextId = nextStationId ? String(nextStationId) : null;

    if (previousStationId && previousStationId !== nextId) {
      await Station.updateOne(
        { _id: previousStationId, assignedStaff: user._id },
        { $set: { assignedStaff: null } }
      );
    }

    if (!nextId) return;

    const station = await Station.findById(nextId);
    if (!station) throw appError('Trạm thu gom không tồn tại.', 404);

    if (station.assignedStaff && String(station.assignedStaff) !== String(user._id)) {
      await User.updateOne(
        { _id: station.assignedStaff, assignedStation: station._id },
        { $set: { assignedStation: null } }
      );
    }

    await Station.updateOne({ _id: station._id }, { $set: { assignedStaff: user._id } });
  }

  async list(query = {}) {
    const page = toPositiveInteger(query.page, 1, 100000);
    const limit = toPositiveInteger(query.limit, 20, 100);

    const filter = {
      role: { $in: ['staff', 'admin'] },
    };

    if (query.role && ['staff', 'admin'].includes(query.role)) {
      filter.role = query.role;
    }

    if (query.status !== undefined && query.status !== '') {
      filter.isActive = query.status === 'active' || query.status === 'true';
    }

    if (query.stationId && mongoose.isValidObjectId(query.stationId)) {
      filter.assignedStation = query.stationId;
    }

    if (query.q && query.q.trim()) {
      const escaped = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: new RegExp(escaped, 'i') },
        { email: new RegExp(escaped, 'i') },
        { phone: new RegExp(escaped, 'i') },
        { employeeCode: new RegExp(escaped, 'i') },
      ];
    }

    const [items, totalCount] = await Promise.all([
      User.find(filter)
        .populate('assignedStation', 'name code address stationType status')
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    return {
      items: items.map((doc) => {
        const item = { ...doc, id: String(doc._id) };
        delete item._id;
        delete item.__v;
        delete item.password;
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
    if (!mongoose.isValidObjectId(id)) throw appError('Mã nhân viên không hợp lệ.', 400);
    const user = await User.findById(id).populate('assignedStation', 'name code address stationType status');
    if (!user || !['staff', 'admin'].includes(user.role)) {
      throw appError('Không tìm thấy nhân viên.', 404);
    }
    const item = user.toJSON();
    delete item.password;
    return item;
  }

  async create(payload = {}) {
    const name = String(payload.name || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const phone = normalizePhone(payload.phone);
    const role = ['staff', 'admin'].includes(payload.role) ? payload.role : 'staff';
    const password = String(payload.password || 'ScanWaste@2026');

    if (!name) throw appError('Họ tên nhân viên là bắt buộc.');
    if (!email) throw appError('Email nhân viên là bắt buộc.');

    const existing = await User.findOne({ email });
    if (existing) throw appError('Email này đã được sử dụng.', 409, 'DUPLICATE_EMAIL');

    let assignedStation = null;
    if (payload.assignedStation && mongoose.isValidObjectId(payload.assignedStation)) {
      const station = await Station.findById(payload.assignedStation);
      if (!station) throw appError('Trạm thu gom được gán không tồn tại.', 404);
      assignedStation = station._id;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const employeeCode = payload.employeeCode
      ? String(payload.employeeCode).trim().toUpperCase()
      : `SW-${Date.now().toString().slice(-6)}`;

    const user = await User.create({
      name,
      email,
      phone,
      password: hashedPassword,
      role,
      assignedStation,
      employeeCode,
      department: payload.department ? String(payload.department).trim() : 'Vận hành thu gom',
      isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : true,
    });

    if (assignedStation) await this.syncStationAssignment(user, assignedStation);

    const item = user.toJSON();
    delete item.password;
    return item;
  }

  async update(id, payload = {}) {
    if (!mongoose.isValidObjectId(id)) throw appError('Mã nhân viên không hợp lệ.', 400);
    const updateData = {};
    let nextAssignedStation;

    if (payload.name !== undefined) {
      const name = String(payload.name).trim();
      if (!name) throw appError('Họ tên không được để trống.');
      updateData.name = name;
    }

    if (payload.phone !== undefined) {
      updateData.phone = normalizePhone(payload.phone);
    }

    if (payload.role !== undefined) {
      if (!['staff', 'admin'].includes(payload.role)) {
        throw appError('Vai trò chỉ có thể là staff hoặc admin.');
      }
      updateData.role = payload.role;
    }

    if (payload.assignedStation !== undefined) {
      if (payload.assignedStation === null || payload.assignedStation === '') {
        updateData.assignedStation = null;
        nextAssignedStation = null;
      } else {
        if (!mongoose.isValidObjectId(payload.assignedStation)) {
          throw appError('Trạm thu gom không hợp lệ.');
        }
        const station = await Station.findById(payload.assignedStation);
        if (!station) throw appError('Trạm thu gom không tồn tại.', 404);
        updateData.assignedStation = station._id;
        nextAssignedStation = station._id;
      }
    }

    if (payload.employeeCode !== undefined) {
      updateData.employeeCode = String(payload.employeeCode).trim().toUpperCase();
    }

    if (payload.department !== undefined) {
      updateData.department = String(payload.department).trim();
    }

    if (payload.isActive !== undefined) {
      updateData.isActive = Boolean(payload.isActive);
    }

    if (payload.password) {
      const pass = String(payload.password).trim();
      if (pass.length < 8) throw appError('Mật khẩu phải từ 8 ký tự.');
      updateData.password = await bcrypt.hash(pass, 10);
    }

    const existing = await User.findById(id);
    if (!existing || !['staff', 'admin'].includes(existing.role)) {
      throw appError('Không tìm thấy nhân viên.', 404);
    }

    if (payload.assignedStation !== undefined) {
      await this.syncStationAssignment(existing, nextAssignedStation);
    }

    const updated = await User.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate('assignedStation', 'name code address stationType status');

    if (!updated) throw appError('Không tìm thấy nhân viên.', 404);
    const item = updated.toJSON();
    delete item.password;
    return item;
  }

  async delete(id) {
    if (!mongoose.isValidObjectId(id)) throw appError('Mã nhân viên không hợp lệ.', 400);
    const user = await User.findById(id);
    if (!user) throw appError('Không tìm thấy nhân viên.', 404);

    // If deleting admin, prevent self-deletion or lock instead
    await User.findByIdAndUpdate(id, { $set: { isActive: false } });
    return { success: true, message: 'Đã khóa tài khoản nhân viên.' };
  }

  async exportExcel(query = {}) {
    const filter = { role: { $in: ['staff', 'admin'] } };
    if (query.role) filter.role = query.role;
    if (query.status) filter.isActive = query.status === 'active' || query.status === 'true';

    const employees = await User.find(filter)
      .populate('assignedStation', 'name code')
      .sort({ createdAt: -1 })
      .lean();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ScanWaste Admin';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Danh sách Nhân Viên');

    sheet.columns = [
      { header: 'STT', key: 'stt', width: 8 },
      { header: 'Mã NV', key: 'code', width: 14 },
      { header: 'Họ và tên', key: 'name', width: 26 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Số điện thoại', key: 'phone', width: 16 },
      { header: 'Vai trò', key: 'role', width: 16 },
      { header: 'Trạm phụ trách', key: 'station', width: 28 },
      { header: 'Phòng ban', key: 'department', width: 20 },
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

    employees.forEach((e, idx) => {
      const row = sheet.addRow({
        stt: idx + 1,
        code: e.employeeCode || `SW-${String(e._id).slice(-4)}`,
        name: e.name,
        email: e.email,
        phone: e.phone || '',
        role: e.role === 'admin' ? 'Quản trị viên' : 'Nhân viên',
        station: e.assignedStation ? `${e.assignedStation.name} (${e.assignedStation.code})` : 'Chưa phân công',
        department: e.department || 'Vận hành thu gom',
        status: e.isActive !== false ? 'Đang hoạt động' : 'Đã khóa',
      });
      row.alignment = { vertical: 'middle' };
      row.getCell('stt').alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell('code').alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell('role').alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell('status').alignment = { vertical: 'middle', horizontal: 'center' };
    });

    return workbook;
  }
}

module.exports = new EmployeeService();
