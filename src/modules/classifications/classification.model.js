const mongoose = require('mongoose');
const { SUPPORTED_WASTE_CLASSES } = require('../ai/ai.config');

const classificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    imageUrl: {
      type: String,
      required: [true, 'Image URL is required'],
    },
    predictedClass: {
      type: String,
      enum: {
        values: SUPPORTED_WASTE_CLASSES,
        message: '{VALUE} is not a supported waste category',
      },
      required: [true, 'Predicted class is required'],
      index: true,
    },
    confidence: {
      type: Number,
      default: 0,
      min: [0, 'Confidence cannot be less than 0'],
      max: [1, 'Confidence cannot be greater than 1'],
    },
    pointsEarned: {
      type: Number,
      default: 0,
      min: [0, 'Points earned cannot be negative'],
    },

    // Trang thai kiem duyet AI
    reviewStatus: {
      type: String,
      enum: ['not_required', 'pending', 'approved', 'unidentified'],
      default: 'not_required',
      index: true,
    },
    reportedIncorrect: {
      type: Boolean,
      default: false,
      index: true,
    },
    verifiedByAdmin: {
      type: Boolean,
      default: false,
      index: true,
    },
    verifiedLabel: {
      type: String,
      enum: [...SUPPORTED_WASTE_CLASSES, 'unknown', null],
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    retrainingFlag: {
      type: Boolean,
      default: false,
    },

    // Chot trang thai de tranh cong diem trung khi duyet
    pointsAwarded: {
      type: Boolean,
      default: false,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

classificationSchema.index({
  verifiedByAdmin: 1,
  confidence: 1,
  reportedIncorrect: 1,
  createdAt: -1,
});

const Classification = mongoose.model(
  'Classification',
  classificationSchema
);

module.exports = Classification;