const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const Station = require('./station.model');
const StationLog = require('./station-log.model');
const User = require('../users/user.model');
const { STATION_STATUSES, STATION_TYPES } = require('./station.constants');
const { deriveStatus, summarizeStations } = require('./station.query');

const fail = (statusCode, errorCode, message) => Object.assign(new Error(message), { statusCode, errorCode });

/**
 * Cập nhật trạm CÓ ĐIỀU KIỆN trong một lệnh (findOneAndUpdate) để 2 admin bấm cùng lúc
 * không cùng thành công; sau đó ghi StationLog.
 */
async function updateWithLog({ id, actorId, action, allowedFrom, buildUpdate, invalidMessage }) {
  if (!mongoose.isValidObjectId(id)) throw fail(404, 'STATION_NOT_FOUND', 'Station not found');
  const before = await Station.findById(id);
  if (!before) throw fail(404, 'STATION_NOT_FOUND', 'Station not found');
  if (!allowedFrom.includes(before.status)) throw fail(409, 'INVALID_STATION_STATE', invalidMessage);

  const update = buildUpdate(before);
  const after = await Station.findOneAndUpdate(
    { _id: id, status: before.status, capacityPercent: before.capacityPercent },
    { $set: update },
    { returnDocument: 'after', runValidators: true }
  );
  // Có người khác đổi trạm giữa lúc đọc và ghi → báo xung đột, client tải lại
  if (!after) throw fail(409, 'STATION_CHANGED', 'Station was changed by another request. Please reload.');

  await StationLog.create({
    stationId: after._id,
    action,
    actorId,
    fromStatus: before.status,
    toStatus: after.status,
    fromCapacity: before.capacityPercent,
    toCapacity: after.capacityPercent,
  });
  return after.toJSON();
}

class StationAdminService {
  async syncAssignedStaff(station, nextStaffId) {
    const previousStaffId = station.assignedStaff ? String(station.assignedStaff) : null;
    const nextId = nextStaffId ? String(nextStaffId) : null;

    if (previousStaffId && previousStaffId !== nextId) {
      await User.updateOne(
        { _id: previousStaffId, assignedStation: station._id },
        { $set: { assignedStation: null } }
      );
    }

    if (!nextId) return;

    const staff = await User.findById(nextId);
    if (!staff || !['staff', 'admin'].includes(staff.role)) {
      throw fail(404, 'STAFF_NOT_FOUND', 'Không tìm thấy nhân viên để phân công');
    }

    if (staff.assignedStation && String(staff.assignedStation) !== String(station._id)) {
      await Station.updateOne(
        { _id: staff.assignedStation, assignedStaff: staff._id },
        { $set: { assignedStaff: null } }
      );
    }

    await User.updateOne({ _id: staff._id }, { $set: { assignedStation: station._id } });
  }

  /** UC012 – toàn bộ trạm, % sức chứa cao nhất lên đầu, kèm số liệu tổng hợp */
  async listStations({ status } = {}) {
    if (status && !STATION_STATUSES.includes(status)) {
      throw Object.assign(new Error('Validation Error'), {
        statusCode: 400,
        errorCode: 'VALIDATION_ERROR',
        errors: [`status must be one of: ${STATION_STATUSES.join(', ')}`],
      });
    }
    const all = (await Station.find().sort({ capacityPercent: -1, name: 1 })).map((s) => s.toJSON());
    return {
      items: status ? all.filter((s) => s.status === status) : all,
      summary: summarizeStations(all),
    };
  }

  /** UC012 luồng 4a – admin xác nhận đã điều xe → "Đang xử lý" */
  dispatch(id, actorId) {
    return updateWithLog({
      id,
      actorId,
      action: 'DISPATCH',
      allowedFrom: ['ACTIVE', 'FULL'],
      invalidMessage: 'Only ACTIVE or FULL stations can be dispatched.',
      buildUpdate: () => ({ status: 'SERVICING' }),
    });
  }

  /** Xe đã thu gom xong → khay về 0%, trạm hoạt động lại */
  complete(id, actorId) {
    return updateWithLog({
      id,
      actorId,
      action: 'COMPLETE',
      allowedFrom: ['SERVICING'],
      invalidMessage: 'Only SERVICING stations can be completed.',
      buildUpdate: () => ({ status: 'ACTIVE', capacityPercent: 0, capacityUpdatedAt: new Date() }),
    });
  }

  /**
   * Giả lập dữ liệu sức chứa gửi về từ máy RVM (nhóm không có thiết bị thật).
   * delta dương = rác đổ thêm; kết quả kẹp trong 0–100.
   */
  simulateCapacity(id, actorId, delta) {
    return updateWithLog({
      id,
      actorId,
      action: 'CAPACITY',
      allowedFrom: STATION_STATUSES,
      invalidMessage: '',
      buildUpdate: (before) => {
        const capacityPercent = Math.max(0, Math.min(100, before.capacityPercent + delta));
        return {
          capacityPercent,
          status: deriveStatus(before.status, capacityPercent),
          capacityUpdatedAt: new Date(),
        };
      },
    });
  }
  async getById(id) {
    if (!mongoose.isValidObjectId(id)) throw fail(400, 'INVALID_ID', 'ID trạm không hợp lệ');
    const station = await Station.findById(id).populate('assignedStaff', 'name email phone employeeCode role');
    if (!station) throw fail(404, 'STATION_NOT_FOUND', 'Không tìm thấy trạm');
    if (assignedStaff) await this.syncAssignedStaff(station, assignedStaff);
    return (await Station.findById(station._id).populate('assignedStaff', 'name email phone employeeCode role')).toJSON();
  }

  async createStation(payload = {}) {
    const code = String(payload.code || '').trim().toLowerCase();
    const name = String(payload.name || '').trim();
    const address = String(payload.address || '').trim();

    if (!code) throw fail(400, 'VALIDATION_ERROR', 'Mã trạm là bắt buộc');
    if (!name) throw fail(400, 'VALIDATION_ERROR', 'Tên trạm là bắt buộc');
    if (!address) throw fail(400, 'VALIDATION_ERROR', 'Địa chỉ trạm là bắt buộc');

    const existing = await Station.findOne({ code });
    if (existing) throw fail(409, 'DUPLICATE_CODE', 'Mã trạm đã tồn tại');

    const lng = Number(payload.longitude ?? payload.location?.longitude ?? 106.687);
    const lat = Number(payload.latitude ?? payload.location?.latitude ?? 10.822);
    if (isNaN(lng) || isNaN(lat)) throw fail(400, 'VALIDATION_ERROR', 'Tọa độ không hợp lệ');

    const normalizeStationType = (type) => {
      if (type === 'RVM' || type === 'SMART_RVM') return 'SMART_RVM';
      return 'STANDARD_BIN';
    };

    const stationType = normalizeStationType(payload.stationType);

    const acceptedCategories = Array.isArray(payload.acceptedCategories) && payload.acceptedCategories.length > 0
      ? payload.acceptedCategories
      : ['plastic', 'paper', 'metal', 'cardboard'];

    let assignedStaff = null;
    if (payload.assignedStaff && mongoose.isValidObjectId(payload.assignedStaff)) {
      const staff = await User.findById(payload.assignedStaff);
      if (staff) assignedStaff = staff._id;
    }

    const station = await Station.create({
      code,
      name,
      address,
      location: {
        type: 'Point',
        coordinates: [lng, lat],
      },
      stationType,
      acceptedCategories,
      openTime: payload.openTime || '07:00',
      closeTime: payload.closeTime || '21:00',
      capacityPercent: Math.max(0, Math.min(100, Number(payload.capacityPercent || 0))),
      status: STATION_STATUSES.includes(payload.status) ? payload.status : 'ACTIVE',
      phoneNumber: payload.phoneNumber ? String(payload.phoneNumber).trim() : '',
      assignedStaff,
    });

    return station.toJSON();
  }

  async updateStation(id, payload = {}) {
    if (!mongoose.isValidObjectId(id)) throw fail(400, 'INVALID_ID', 'ID trạm không hợp lệ');
    const station = await Station.findById(id);
    if (!station) throw fail(404, 'STATION_NOT_FOUND', 'Không tìm thấy trạm');

    const update = {};
    let nextAssignedStaff;
    if (payload.name !== undefined) update.name = String(payload.name).trim();
    if (payload.address !== undefined) update.address = String(payload.address).trim();
    if (payload.phoneNumber !== undefined) update.phoneNumber = String(payload.phoneNumber).trim();
    if (payload.openTime !== undefined) update.openTime = String(payload.openTime).trim();
    if (payload.closeTime !== undefined) update.closeTime = String(payload.closeTime).trim();
    if (payload.stationType !== undefined) {
      update.stationType = (payload.stationType === 'RVM' || payload.stationType === 'SMART_RVM')
        ? 'SMART_RVM'
        : 'STANDARD_BIN';
    }
    if (Array.isArray(payload.acceptedCategories) && payload.acceptedCategories.length > 0) {
      update.acceptedCategories = payload.acceptedCategories;
    }
    if (payload.status !== undefined && STATION_STATUSES.includes(payload.status)) {
      update.status = payload.status;
    }
    if (payload.capacityPercent !== undefined) {
      update.capacityPercent = Math.max(0, Math.min(100, Number(payload.capacityPercent)));
      update.capacityUpdatedAt = new Date();
    }
    if (payload.latitude !== undefined && payload.longitude !== undefined) {
      const lng = Number(payload.longitude);
      const lat = Number(payload.latitude);
      if (!isNaN(lng) && !isNaN(lat)) {
        update.location = { type: 'Point', coordinates: [lng, lat] };
      }
    }
    if (payload.assignedStaff !== undefined) {
      if (!payload.assignedStaff) {
        update.assignedStaff = null;
        nextAssignedStaff = null;
      } else if (mongoose.isValidObjectId(payload.assignedStaff)) {
        update.assignedStaff = payload.assignedStaff;
        nextAssignedStaff = payload.assignedStaff;
      } else {
        throw fail(400, 'INVALID_STAFF_ID', 'Nhân viên được phân công không hợp lệ');
      }
    }

    if (payload.assignedStaff !== undefined) {
      await this.syncAssignedStaff(station, nextAssignedStaff);
    }

    const updated = await Station.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    ).populate('assignedStaff', 'name email phone employeeCode role');

    return updated.toJSON();
  }

  async deleteStation(id) {
    if (!mongoose.isValidObjectId(id)) throw fail(400, 'INVALID_ID', 'ID trạm không hợp lệ');
    const station = await Station.findByIdAndDelete(id);
    if (!station) throw fail(404, 'STATION_NOT_FOUND', 'Không tìm thấy trạm');
    return { success: true, message: 'Đã xóa trạm thu gom' };
  }

  async exportExcel(query = {}) {
    const filter = {};
    if (query.status && STATION_STATUSES.includes(query.status)) {
      filter.status = query.status;
    }

    const stations = await Station.find(filter)
      .populate('assignedStaff', 'name email phone')
      .sort({ capacityPercent: -1, name: 1 })
      .lean();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ScanWaste Admin';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Danh sách Trạm Thu Gom');

    sheet.columns = [
      { header: 'STT', key: 'stt', width: 8 },
      { header: 'Mã Trạm', key: 'code', width: 14 },
      { header: 'Tên Trạm Thu Gom', key: 'name', width: 32 },
      { header: 'Địa chỉ', key: 'address', width: 40 },
      { header: 'Loại trạm', key: 'type', width: 16 },
      { header: 'Sức chứa', key: 'capacity', width: 14 },
      { header: 'Trạng thái', key: 'status', width: 16 },
      { header: 'Giờ mở cửa', key: 'hours', width: 18 },
      { header: 'Nhân viên phụ trách', key: 'staff', width: 24 },
      { header: 'Số ĐT liên hệ', key: 'phone', width: 16 },
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

    const STATUS_MAP = {
      ACTIVE: 'Hoạt động',
      FULL: 'Đầy rác',
      SERVICING: 'Đang bảo dưỡng / điều xe',
      INACTIVE: 'Tạm ngưng',
    };

    stations.forEach((s, idx) => {
      const row = sheet.addRow({
        stt: idx + 1,
        code: s.code,
        name: s.name,
        address: s.address,
        type: s.stationType === 'RVM' ? 'Máy tự động RVM' : 'Điểm cộng đồng',
        capacity: `${s.capacityPercent}%`,
        status: STATUS_MAP[s.status] || s.status,
        hours: `${s.openTime} - ${s.closeTime}`,
        staff: s.assignedStaff ? `${s.assignedStaff.name} (${s.assignedStaff.phone || s.assignedStaff.email})` : 'Chưa gán',
        phone: s.phoneNumber || '',
      });
      row.alignment = { vertical: 'middle' };
      row.getCell('stt').alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell('code').alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell('capacity').alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell('status').alignment = { vertical: 'middle', horizontal: 'center' };
    });

    return workbook;
  }
}

module.exports = new StationAdminService();
