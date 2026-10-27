const Classification = require('./classification.model');
const aiService = require('../ai/ai.service');

class ClassificationService {
  /**
   * Process uploaded image through AI and save classification record
   * @param {string} userId
   * @param {object} file - Multer file object
   * @returns {Promise<object>}
   */
  async createClassification(userId, file) {
    if (!file) {
      const error = new Error('No image file provided');
      error.statusCode = 400;
      throw error;
    }

    // Process classification through AI service
    const aiResult = await aiService.classifyImage(file.path);

    const imageUrl = `/uploads/${file.filename}`;

    const classification = await Classification.create({
      userId,
      imageUrl,
      predictedClass: aiResult.predictedClass,
      predictedClassVi: aiResult.predictedClassVi,
      confidence: aiResult.confidence,
      scores: aiResult.scores || {},
      modelVersion: aiResult.modelVersion || 'v3',
      inferenceTimeMs: aiResult.inferenceTimeMs || 0,
      classificationSource: 'server',
      metadata: {
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        topPredictions: aiResult.topPredictions,
        disposalTips: aiResult.disposalTips,
        aiDetails: aiResult.details,
      },
    });

    return {
      id: classification._id,
      classificationId: classification._id.toString(),
      userId: classification.userId,
      imageUrl: classification.imageUrl,
      predictedClass: classification.predictedClass,
      predictedClassVi: classification.predictedClassVi,
      confidence: classification.confidence,
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
