const mongoose = require('mongoose');

const voucherSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Mã voucher là bắt buộc'],
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: [32, 'Mã voucher không quá 32 ký tự'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Tiêu đề voucher là bắt buộc'],
      trim: true,
      maxlength: [120, 'Tiêu đề không quá 120 ký tự'],
    },
    discountType: {
      type: String,
      enum: ['fixed', 'percentage'],
      default: 'fixed',
    },
    discountValue: {
      type: Number,
      required: [true, 'Giá trị ưu đãi là bắt buộc'],
      min: [0, 'Giá trị ưu đãi không được âm'],
    },
    minOrderValue: {
      type: Number,
      default: 0,
      min: [0, 'Giá trị đơn tối thiểu không được âm'],
    },
    minPoints: {
      type: Number,
      default: 0,
      min: [0, 'Điểm tích lũy tối thiểu không được âm'],
    },
    maxUsage: {
      type: Number,
      default: 100,
      min: [1, 'Lượt sử dụng tối đa phải từ 1'],
    },
    currentUsage: {
      type: Number,
      default: 0,
      min: [0, 'Lượt sử dụng hiện tại không được âm'],
    },
    validFrom: {
      type: Date,
      required: [true, 'Ngày bắt đầu là bắt buộc'],
    },
    validTo: {
      type: Date,
      required: [true, 'Ngày kết thúc là bắt buộc'],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    usageHistory: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        userEmail: {
          type: String,
          default: '',
        },
        usedAt: {
          type: Date,
          default: Date.now,
        },
        discountApplied: {
          type: Number,
          default: 0,
        },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

voucherSchema.index({ validFrom: 1, validTo: 1, isActive: 1 });

module.exports = mongoose.model('Voucher', voucherSchema);
