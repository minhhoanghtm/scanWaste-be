
const mongoose = require('mongoose');

const Classification = require('./classification.model');
const userService = require('../users/user.service');
const { SUPPORTED_WASTE_CLASSES } = require('../ai/ai.config');

const REVIEW_CONFIDENCE_THRESHOLD = 0.7;
const REVIEW_POINTS = 10;

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

class ClassificationReviewService {
  // UC011: Get classifications waiting for admin review
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

  // UC011: User reports an incorrect AI classification
  async reportIncorrect(userId, classificationId) {
    if (!mongoose.isValidObjectId(classificationId)) {
      throw createError('Invalid classification ID', 400);
    }

    const classification = await Classification.findOneAndUpdate(
      {
        _id: classificationId,
        userId,
        verifiedByAdmin: { $ne: true },
      },
      {
        $set: {
          reportedIncorrect: true,
          reviewStatus: 'pending',
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!classification) {
      const existing = await Classification.findOne({
        _id: classificationId,
        userId,
      }).select('_id verifiedByAdmin');

      if (!existing) {
        throw createError('Classification not found', 404);
      }

      throw createError(
        'Classification has already been reviewed',
        409
      );
    }

    return classification.toJSON();
  }

  // UC011: Admin verifies or relabels a classification
  async reviewClassification(classificationId, adminId, label) {
    if (!mongoose.isValidObjectId(classificationId)) {
      throw createError('Invalid classification ID', 400);
    }

    if (typeof label !== 'string') {
      throw createError('A review label is required', 400);
    }

    const normalizedLabel = label.trim().toLowerCase();
    const allowedLabels = [...SUPPORTED_WASTE_CLASSES, 'unknown'];

    if (!allowedLabels.includes(normalizedLabel)) {
      throw createError(
        `Label must be one of: ${allowedLabels.join(', ')}`,
        400
      );
    }

    const session = await mongoose.connection.startSession();
    let reviewedResult = null;

    try {
      await session.withTransaction(async () => {
        const classification = await Classification.findById(
          classificationId
        ).session(session);

        if (!classification) {
          throw createError('Classification not found', 404);
        }

        if (classification.verifiedByAdmin) {
          throw createError(
            'Classification has already been reviewed',
            409
          );
        }

        const requiresReview =
          Number(classification.confidence || 0) <
            REVIEW_CONFIDENCE_THRESHOLD ||
          classification.reportedIncorrect === true ||
          classification.reviewStatus === 'pending';

        if (!requiresReview) {
          throw createError(
            'Classification is not waiting for review',
            400
          );
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

        const pointsAlreadyAwarded =
          classification.pointsAwarded === true ||
          Number(classification.pointsEarned || 0) > 0;

        if (!isUnidentified && !pointsAlreadyAwarded) {
          await userService.addPoints(
            classification.userId,
            REVIEW_POINTS,
            { session }
          );

          classification.pointsEarned = REVIEW_POINTS;
          classification.pointsAwarded = true;
        } else if (!isUnidentified && pointsAlreadyAwarded) {
          classification.pointsAwarded = true;
        }

        // Save review result in the same transaction as point update.
        await classification.save({ session });

        reviewedResult = classification.toJSON();
      });
    } finally {
      await session.endSession();
    }

    return reviewedResult;
  }
}

module.exports = new ClassificationReviewService();
