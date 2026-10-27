const mongoose = require('mongoose');
const { SUPPORTED_WASTE_CLASSES } = require('../ai/ai.config');

const feedbackSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    classificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Classification',
      required: [true, 'Classification ID is required'],
      index: true,
    },
    predictedClass: {
      type: String,
      enum: {
        values: SUPPORTED_WASTE_CLASSES,
        message: '{VALUE} is not a valid waste class',
      },
      required: [true, 'Predicted class is required'],
    },
    correctClass: {
      type: String,
      enum: {
        values: SUPPORTED_WASTE_CLASSES,
        message: '{VALUE} is not a supported waste class',
      },
      required: [true, 'Correct class is required'],
    },
    isCorrect: {
      type: Boolean,
      default: false,
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [500, 'Comment cannot exceed 500 characters'],
      default: '',
    },
    modelVersion: {
      type: String,
      default: 'v3',
    },
    userConsentForTraining: {
      type: Boolean,
      default: false,
      index: true,
    },
    imageUrl: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'approved', 'rejected'],
      default: 'pending',
      index: true,
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
    verifiedClass: {
      type: String,
      enum: SUPPORTED_WASTE_CLASSES,
      default: null,
    },
    adminNotes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Admin notes cannot exceed 1000 characters'],
      default: '',
    },
    addedToDataset: {
      type: Boolean,
      default: false,
    },
    datasetItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DatasetItem',
      default: null,
    },
    auditLog: [
      {
        action: { type: String, required: true },
        performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        timestamp: { type: Date, default: Date.now },
        details: { type: mongoose.Schema.Types.Mixed },
      },
    ],
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

// Prevent duplicate feedback from the same user for the same classification
feedbackSchema.index({ userId: 1, classificationId: 1 }, { unique: true });
feedbackSchema.index({ status: 1, createdAt: -1 });

const Feedback = mongoose.model('Feedback', feedbackSchema);

module.exports = Feedback;
