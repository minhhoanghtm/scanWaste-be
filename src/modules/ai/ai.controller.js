const classificationService = require('../classifications/classification.service');
const aiService = require('./ai.service');
const aiSyncService = require('./ai.sync.service');
const { sendSuccess } = require('../../utils/response');

class AIController {
  /**
   * POST /api/ai/classify
   * Real MobileNetV2 V3 TFLite waste image classification
   */
  async classify(req, res, next) {
    try {
      const result = await classificationService.createClassification(req.user._id, req.file);

      // Unified response format strictly adhering to ScanWaste API specification
      const responsePayload = {
        classificationId: result.classificationId,
        predictedClass: result.predictedClass,
        predictedClassVi: result.predictedClassVi,
        confidence: result.confidence,
        topPredictions: result.topPredictions,
        modelVersion: result.modelVersion,
        inferenceTimeMs: result.inferenceTimeMs,
        source: result.source,
        imageUrl: result.imageUrl,
        disposalTips: result.disposalTips,
      };

      return sendSuccess(res, 'Waste image classified successfully', responsePayload, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/ai/sync
   * Synchronize offline TFLite classification results from React Native
   */
  async syncOffline(req, res, next) {
    try {
      const result = await aiSyncService.syncOfflineData(req.user._id, req.body);
      const isDuplicate = result && result.isDuplicate === true;
      const statusCode = isDuplicate ? 200 : 201;
      const message = isDuplicate
        ? 'Offline classification already exists (idempotent sync)'
        : 'Offline classification synchronized successfully';

      return sendSuccess(res, message, result, statusCode);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/ai/health
   * Check status of AI model & inference engine
   */
  async checkHealth(req, res, next) {
    try {
      const health = await aiService.checkHealth();
      return sendSuccess(res, 'AI service health check', health, 200);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AIController();
