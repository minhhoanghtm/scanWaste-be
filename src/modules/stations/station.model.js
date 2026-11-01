const mongoose = require('mongoose');
const { SUPPORTED_WASTE_CLASSES } = require('../ai/ai.config');
const { STATION_STATUSES, STATION_TYPES } = require('./station.constants');

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Chuẩn hoá chuỗi để tìm kiếm không phân biệt dấu & hoa/thường:
 * "Nguyễn Văn Bảo" → "nguyen van bao", "Đức" → "duc"
 */
const normalizeSearchText = (text = '') =>
  String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();

const stationSchema = new mongoose.Schema(
  {
    /** Mã ngắn để seed/đối chiếu (VD: st-01). Không dùng làm khoá API. */
    code: { type: String, required: true, unique: true, trim: true, maxlength: 32 },
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 255 },
    address: { type: String, required: [true, 'Address is required'], trim: true, maxlength: 500 },
    /** GeoJSON Point – lưu ý thứ tự [longitude, latitude] */
    location: {
      type: { type: String, enum: ['Point'], default: 'Point', required: true },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: (c) =>
            Array.isArray(c) && c.length === 2 && c[0] >= -180 && c[0] <= 180 && c[1] >= -90 && c[1] <= 90,
          message: 'coordinates must be [longitude, latitude]',
        },
      },
    },
    stationType: { type: String, enum: STATION_TYPES, required: true },
    acceptedCategories: {
      type: [{ type: String, enum: SUPPORTED_WASTE_CLASSES }],
      validate: { validator: (v) => v.length > 0, message: 'At least one accepted category is required' },
    },
    openTime: { type: String, required: true, match: [HH_MM, 'openTime must be HH:mm'] },
    closeTime: { type: String, required: true, match: [HH_MM, 'closeTime must be HH:mm'] },
    capacityPercent: { type: Number, required: true, min: 0, max: 100 },
    status: { type: String, enum: STATION_STATUSES, default: 'ACTIVE', index: true },
    phoneNumber: { type: String, trim: true, maxlength: 32 },
    /** Thời điểm dữ liệu sức chứa được cập nhật (mô phỏng telemetry RVM) */
    capacityUpdatedAt: { type: Date, default: Date.now },
    /** Tên + địa chỉ đã bỏ dấu để tìm kiếm (tự tính khi lưu) */
    searchText: { type: String, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        const [longitude, latitude] = ret.location?.coordinates || [];
        ret.location = { latitude, longitude };
        delete ret._id;
        delete ret.__v;
        delete ret.searchText;
        return ret;
      },
    },
  }
);

stationSchema.index({ location: '2dsphere' });

stationSchema.pre('save', function setSearchText() {
  if (this.isModified('name') || this.isModified('address') || this.isNew) {
    this.searchText = normalizeSearchText(`${this.name} ${this.address}`);
  }
});

const Station = mongoose.model('Station', stationSchema);

module.exports = Station;
module.exports.normalizeSearchText = normalizeSearchText;
