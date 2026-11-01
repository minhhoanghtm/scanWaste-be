const mongoose = require('mongoose');
const Station = require('./station.model');
const StationLog = require('./station-log.model');
const { STATION_STATUSES } = require('./station.constants');
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
}

module.exports = new StationAdminService();
