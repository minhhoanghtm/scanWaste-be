const mongoose = require('mongoose');

const voucherWalletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  voucherName: {
    type: String,
    required: true,
    trim: true,
  },
  partnerName: {
    type: String,
    default: '',
    trim: true,
  },
  voucherCode: {
    type: String,
    required: true,
    trim: true,
  },
  pointsUsed: {
    type: Number,
    default: 0,
    min: 0,
  },
  status: {
    type: String,
    enum: ['active', 'used'],
    default: 'active',
    index: true,
  },
  redeemedAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    default: null,
    index: true,
  },
  usedAt: {
    type: Date,
    default: null,
  },

  // Thoi diem gui email nhac han thanh cong
  reminderEmailSentAt: {
    type: Date,
    default: null,
  },

  // Thoi diem nhan xu ly gui email, tranh gui trung
  reminderEmailClaimedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
});

voucherWalletSchema.index({ userId: 1, redeemedAt: -1 });

module.exports = mongoose.model('VoucherWallet', voucherWalletSchema);