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

const Classification = mongoose.model('Classification', classificationSchema);

module.exports = Classification;
