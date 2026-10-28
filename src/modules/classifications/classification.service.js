const Classification = require('./classification.model');
const aiService = require('../ai/ai.service');
const userService = require('../users/user.service');

const REVIEW_CONFIDENCE_THRESHOLD = 0.7;
const CLASSIFICATION_POINTS = 10;

class ClassificationService {
  async createClassification(userId, file) {
    if (!file) {
      const error = new Error('No image file provided');
      error.statusCode = 400;
      throw error;
    }

    const aiResult = await aiService.classifyImage(file.path);

    const confidence = Number(aiResult.confidence ?? 0);
    const requiresReview =
      confidence < REVIEW_CONFIDENCE_THRESHOLD;

    const pointsEarned = requiresReview
      ? 0
      : CLASSIFICATION_POINTS;

    const imageUrl = `/uploads/${file.filename}`;

    const classification = await Classification.create({
      userId,
      imageUrl,
      predictedClass: aiResult.predictedClass,
      confidence,
      pointsEarned,
      pointsAwarded: !requiresReview,
      reviewStatus: requiresReview
        ? 'pending'
        : 'not_required',
      verifiedByAdmin: false,
      reportedIncorrect: false,
      verifiedLabel: null,
      reviewedBy: null,
      reviewedAt: null,
      retrainingFlag: false,
      metadata: {
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        aiDetails: aiResult.details,
      },
    });

    const totalClassifications =
      await Classification.countDocuments({ userId });

    await userService.recordClassificationActivity(
      userId,
      totalClassifications,
      pointsEarned
    );

    return {
      id: classification._id,
      userId: classification.userId,
      imageUrl: classification.imageUrl,
      predictedClass: classification.predictedClass,
      confidence: classification.confidence,
      pointsEarned: classification.pointsEarned,
      reviewStatus: classification.reviewStatus,
      metadata: classification.metadata,
      createdAt: classification.createdAt,
      updatedAt: classification.updatedAt,
    };
  }
}

module.exports = new ClassificationService();