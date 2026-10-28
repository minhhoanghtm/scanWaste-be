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
      default: null,
      trim: true,
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
    predictedClassVi: {
      type: String,
      default: '',
    },
    confidence: {
      type: Number,
      default: 0,
      min: [0, 'Confidence cannot be less than 0'],
      max: [1, 'Confidence cannot be greater than 1'],
    },
    scores: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    modelVersion: {
      type: String,
      default: 'v3',
      index: true,
    },
    inferenceTimeMs: {
      type: Number,
      default: 0,
    },
    classificationSource: {
      type: String,
      enum: ['server', 'offline'],
      default: 'server',
      index: true,
    },
    clientClassificationId: {
      type: String,
      index: true,
      trim: true,
    },
    classifiedAt: {
      type: Date,
      default: Date.now,
      index: true,
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

// Compound indexes
classificationSchema.index({ userId: 1, classifiedAt: -1 });
classificationSchema.index({ userId: 1, createdAt: -1 });

// Unique compound index for idempotency: prevents duplicate offline syncs for the same user
classificationSchema.index(
  { userId: 1, clientClassificationId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientClassificationId: { $type: 'string' } },
  }
);

const Classification = mongoose.model('Classification', classificationSchema);

module.exports = Classification;
