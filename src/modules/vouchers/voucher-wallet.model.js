
const mongoose = require('mongoose');

const voucherWalletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    voucherName: {
      type: String,
      required: [true, 'Voucher name is required'],
      trim: true,
    },
    partnerName: {
      type: String,
      default: '',
      trim: true,
    },
    voucherCode: {
      type: String,
      required: [true, 'Voucher code is required'],
      trim: true,
    },
    pointsUsed: {
      type: Number,
      default: 0,
      min: [0, 'Points used cannot be negative'],
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

    // UC010: Successful reminder email timestamp
    reminderEmailSentAt: {
      type: Date,
      default: null,
    },

    // UC010: Prevent concurrent reminder processing
    reminderEmailClaimedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// User voucher wallet lookup
voucherWalletSchema.index({
  userId: 1,
  redeemedAt: -1,
});

// Voucher reminder lookup
voucherWalletSchema.index({
  status: 1,
  expiresAt: 1,
  reminderEmailSentAt: 1,
});

module.exports = mongoose.model(
  'VoucherWallet',
  voucherWalletSchema
);
