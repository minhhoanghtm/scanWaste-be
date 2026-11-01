const mongoose = require('mongoose');
const { STATION_ACTIONS, STATION_STATUSES } = require('./station.constants');

/**
 * Nhật ký thao tác của admin trên trạm (UC012) – ai làm gì, lúc nào, trạng thái/% trước và sau.
 * Chỉ ghi thêm, không sửa/xoá.
 */
const stationLogSchema = new mongoose.Schema(
  {
    stationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Station', required: true, index: true },
    action: { type: String, enum: STATION_ACTIONS, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fromStatus: { type: String, enum: STATION_STATUSES, required: true },
    toStatus: { type: String, enum: STATION_STATUSES, required: true },
    fromCapacity: { type: Number, min: 0, max: 100, required: true },
    toCapacity: { type: Number, min: 0, max: 100, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model('StationLog', stationLogSchema);
