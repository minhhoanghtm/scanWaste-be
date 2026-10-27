const mongoose = require('mongoose');
const { SUPPORTED_WASTE_CLASSES } = require('../ai/ai.config');

const DIFFICULTY_TAGS = [
  'standard',
  'transparent_pet_vs_glass',
  'paper_vs_cardboard',
  'reflective_metal_vs_plastic',
  'soiled_organic_vs_paper',
  'crushed_can_vs_foil',
];

const datasetItemSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      enum: {
        values: SUPPORTED_WASTE_CLASSES,
        message: '{VALUE} is not a supported waste class',
      },
      required: [true, 'Label is required'],
      index: true,
    },
    split: {
      type: String,
      enum: ['train', 'val', 'test'],
      default: 'train',
      index: true,
    },
    imageUrl: {
      type: String,
      required: [true, 'Image URL or path is required'],
    },
    imageHash: {
      type: String,
      required: [true, 'Image SHA-256 hash is required for deduplication'],
      unique: true,
      index: true,
    },
    source: {
      type: String,
      enum: ['feedback_approved', 'manual_upload', 'seed_dataset'],
      default: 'manual_upload',
      index: true,
    },
    difficultyTag: {
      type: String,
      enum: DIFFICULTY_TAGS,
      default: 'standard',
      index: true,
    },
    consentGiven: {
      type: Boolean,
      default: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
      index: true,
    },
    feedbackId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Feedback',
      default: null,
    },
    originalClassificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Classification',
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator User ID is required'],
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

datasetItemSchema.index({ label: 1, split: 1, status: 1 });
datasetItemSchema.index({ consentGiven: 1, status: 1 });

const DatasetItem = mongoose.model('DatasetItem', datasetItemSchema);

module.exports = {
  DatasetItem,
  DIFFICULTY_TAGS,
};
