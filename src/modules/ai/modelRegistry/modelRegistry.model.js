const mongoose = require('mongoose');
const { SUPPORTED_WASTE_CLASSES } = require('../ai.config');

const modelRegistrySchema = new mongoose.Schema(
  {
    modelName: {
      type: String,
      required: [true, 'Model name is required'],
      trim: true,
    },
    version: {
      type: String,
      required: [true, 'Model version is required (e.g. v3, v4)'],
      unique: true,
      trim: true,
      index: true,
    },
    artifactPath: {
      type: String,
      required: [true, 'Model artifact path is required'],
      trim: true,
    },
    checksum: {
      type: String,
      required: [true, 'Model SHA-256 checksum is required'],
      trim: true,
      index: true,
    },
    fileSizeBytes: {
      type: Number,
      default: 0,
    },
    inputShape: {
      type: [Number],
      required: true,
      default: [1, 224, 224, 3],
    },
    inputDtype: {
      type: String,
      required: true,
      default: 'float32',
    },
    outputShape: {
      type: [Number],
      required: true,
      default: [1, 7],
    },
    outputDtype: {
      type: String,
      required: true,
      default: 'float32',
    },
    labels: {
      type: [String],
      required: true,
      default: SUPPORTED_WASTE_CLASSES,
    },
    normalization: {
      inputShape: { type: [Number], default: [1, 224, 224, 3] },
      colorSpace: { type: String, default: 'RGB' },
      range: { type: [Number], default: [0, 255] },
      normalization: { type: String, default: 'inside_model' },
    },
    targetPlatform: {
      type: String,
      enum: ['server', 'mobile_bundled', 'universal'],
      default: 'server',
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'deprecated'],
      default: 'inactive',
      index: true,
    },
    trainingAccuracy: {
      type: Number,
      default: null,
      min: [0, 'Training accuracy cannot be less than 0'],
      max: [1, 'Training accuracy cannot be greater than 1'],
    },
    validationAccuracy: {
      type: Number,
      default: null,
      min: [0, 'Validation accuracy cannot be less than 0'],
      max: [1, 'Validation accuracy cannot be greater than 1'],
    },
    testAccuracy: {
      type: Number,
      default: null,
      min: [0, 'Test accuracy cannot be less than 0'],
      max: [1, 'Test accuracy cannot be greater than 1'],
    },
    evaluationNotes: {
      type: String,
      default: '',
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    previousActiveVersion: {
      type: String,
      default: null,
    },
    deployStatus: {
      type: String,
      enum: ['ready', 'hot_reloaded', 'restart_required', 'mobile_build_required', 'failed'],
      default: 'ready',
    },
    deployMessage: {
      type: String,
      default: '',
    },
    activatedAt: {
      type: Date,
      default: null,
    },
    activatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
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

// Indexes
modelRegistrySchema.index({ status: 1, targetPlatform: 1 });
modelRegistrySchema.index({ createdAt: -1 });

const ModelRegistry = mongoose.model('ModelRegistry', modelRegistrySchema);

module.exports = ModelRegistry;
