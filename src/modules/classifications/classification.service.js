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
      confidence: aiResult.confidence,
      metadata: {
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        aiDetails: aiResult.details,
      },
    });

    return {
      id: classification._id,
      userId: classification.userId,
      imageUrl: classification.imageUrl,
      predictedClass: classification.predictedClass,
      confidence: classification.confidence,
      metadata: classification.metadata,
      createdAt: classification.createdAt,
      updatedAt: classification.updatedAt,
    };
  }
}

module.exports = new ClassificationService();
