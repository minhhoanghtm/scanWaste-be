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

    if (
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1
    ) {
      const error = new Error('AI returned invalid confidence');
      error.statusCode = 502;
      throw error;
    }

    const requiresReview =
      confidence < REVIEW_CONFIDENCE_THRESHOLD;

    const pointsEarned = requiresReview
      ? 0
      : CLASSIFICATION_POINTS;

    const classification = await Classification.create({
      userId,
      imageUrl: `/uploads/${file.filename}`,
      predictedClass: aiResult.predictedClass,
      predictedClassVi: aiResult.predictedClassVi,
      confidence,
      scores: aiResult.scores || {},
      modelVersion: aiResult.modelVersion || 'v3',
      inferenceTimeMs: aiResult.inferenceTimeMs || 0,
      classificationSource: 'server',

      // UC011: Review status
      pointsEarned,
      pointsAwarded: !requiresReview,
      reviewStatus: requiresReview ? 'pending' : 'not_required',
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
        topPredictions: aiResult.topPredictions,
        disposalTips: aiResult.disposalTips,
        aiDetails: aiResult.details,
      },
    });

    // UC009: Update points, streak and badges
    const totalClassifications =
      await Classification.countDocuments({ userId });

    await userService.recordClassificationActivity(
      userId,
      totalClassifications,
      pointsEarned
    );

    return {
      id: classification._id,
      classificationId: classification._id.toString(),
      userId: classification.userId,
      imageUrl: classification.imageUrl,
      predictedClass: classification.predictedClass,
      predictedClassVi: classification.predictedClassVi,
      confidence: classification.confidence,
      pointsEarned: classification.pointsEarned,
      reviewStatus: classification.reviewStatus,
      topPredictions: aiResult.topPredictions,
      scores: classification.scores,
      modelVersion: classification.modelVersion,
      inferenceTimeMs: classification.inferenceTimeMs,
      source: classification.classificationSource,
      disposalTips: aiResult.disposalTips,
      metadata: classification.metadata,
      createdAt: classification.createdAt,
      updatedAt: classification.updatedAt,
    };
  }
}

module.exports = new ClassificationService();