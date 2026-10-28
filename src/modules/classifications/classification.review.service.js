const mongoose = require('mongoose');

const Classification = require('./classification.model');
const userService = require('../users/user.service');
const { SUPPORTED_WASTE_CLASSES } = require('../ai/ai.config');

const REVIEW_CONFIDENCE_THRESHOLD = 0.7;
const REVIEW_POINTS = 10;

class ClassificationReviewService {
  async getReviewQueue({ page = 1, limit = 10 } = {}) {
    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const limitNumber = Math.min(
      100,
      Math.max(1, parseInt(limit, 10) || 10)
    );

    const query = {
      verifiedByAdmin: { $ne: true },
      $or: [
        { confidence: { $lt: REVIEW_CONFIDENCE_THRESHOLD } },
        { reportedIncorrect: true },
        { reviewStatus: 'pending' },
      ],
    };

    const skip = (pageNumber - 1) * limitNumber;

    const [items, totalCount] = await Promise.all([
      Classification.find(query)
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),

      Classification.countDocuments(query),
    ]);

    return {
      items: items.map((item) => {
        const result = { ...item, id: String(item._id) };
        delete result._id;
        delete result.__v;
        return result;
      }),
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNumber),
      },
    };
  }

  async reportIncorrect(userId, classificationId) {
    if (!mongoose.isValidObjectId(classificationId)) {
      const error = new Error('Invalid classification ID');
      error.statusCode = 400;
      throw error;
    }

    const classification = await Classification.findOne({
      _id: classificationId,
      userId,
    });

    if (!classification) {
      const error = new Error('Classification not found');
      error.statusCode = 404;
      throw error;
    }

    if (classification.verifiedByAdmin) {
      const error = new Error('Classification has already been reviewed');
      error.statusCode = 409;
      throw error;
    }

    classification.reportedIncorrect = true;
    classification.reviewStatus = 'pending';

    await classification.save();

    return classification.toJSON();
  }

  async reviewClassification(classificationId, adminId, label) {
    if (!mongoose.isValidObjectId(classificationId)) {
      const error = new Error('Invalid classification ID');
      error.statusCode = 400;
      throw error;
    }

    if (typeof label !== 'string') {
      const error = new Error('A review label is required');
      error.statusCode = 400;
      throw error;
    }

    const normalizedLabel = label.trim().toLowerCase();
    const allowedLabels = [...SUPPORTED_WASTE_CLASSES, 'unknown'];

    if (!allowedLabels.includes(normalizedLabel)) {
      const error = new Error(
        `Label must be one of: ${allowedLabels.join(', ')}`
      );
      error.statusCode = 400;
      throw error;
    }

    const classification = await Classification.findById(
      classificationId
    );

    if (!classification) {
      const error = new Error('Classification not found');
      error.statusCode = 404;
      throw error;
    }

    if (classification.verifiedByAdmin) {
      const error = new Error('Classification has already been reviewed');
      error.statusCode = 409;
      throw error;
    }

    const requiresReview =
      Number(classification.confidence || 0) <
        REVIEW_CONFIDENCE_THRESHOLD ||
      classification.reportedIncorrect === true ||
      classification.reviewStatus === 'pending';

    if (!requiresReview) {
      const error = new Error(
        'Classification is not waiting for review'
      );
      error.statusCode = 400;
      throw error;
    }

    const isUnidentified = normalizedLabel === 'unknown';

    classification.verifiedLabel = normalizedLabel;
    classification.verifiedByAdmin = true;
    classification.reviewedBy = adminId;
    classification.reviewedAt = new Date();
    classification.reviewStatus = isUnidentified
      ? 'unidentified'
      : 'approved';
    classification.retrainingFlag =
      !isUnidentified &&
      normalizedLabel !== classification.predictedClass;

    if (!isUnidentified) {
      const pointsAlreadyAwarded =
        classification.pointsAwarded === true ||
        Number(classification.pointsEarned || 0) > 0;

      if (!pointsAlreadyAwarded) {
        await userService.addPoints(
          classification.userId,
          REVIEW_POINTS
        );

        classification.pointsEarned = REVIEW_POINTS;
        classification.pointsAwarded = true;
      }
    }

    await classification.save();

    return classification.toJSON();
  }
}

module.exports = new ClassificationReviewService();