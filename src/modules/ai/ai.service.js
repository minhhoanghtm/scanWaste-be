const { AI_CONFIG, SUPPORTED_WASTE_CLASSES, WASTE_CLASSES_VI, WASTE_DISPOSAL_TIPS } = require('./ai.config');
const { AIAdapterFactory } = require('./ai.adapter');

class AIService {
  constructor() {
    this.adapter = AIAdapterFactory.getAdapter(AI_CONFIG.ACTIVE_PROVIDER);
  }

  /**
   * Set custom adapter at runtime (e.g. for testing or fallback switching)
   */
  setAdapter(adapter) {
    this.adapter = adapter;
  }

  /**
   * Check health of underlying AI inference provider
   */
  async checkHealth() {
    return await this.adapter.checkHealth();
  }

  /**
   * Reload inference engine with a new model version
   */
  async reloadModel(modelPath, version, labelsPath = null) {
    const result = await this.adapter.reloadModel(modelPath, version, labelsPath);
    AI_CONFIG.CURRENT_MODEL_VERSION = version;
    return result;
  }

  /**
   * Classify an uploaded image
   * @param {string} imagePath - Absolute or relative path to the image file
   * @returns {Promise<object>} Standardized classification result
   */
  async classifyImage(imagePath) {
    if (!imagePath) {
      const error = new Error('Image path is required for classification');
      error.statusCode = 400;
      throw error;
    }

    const prediction = await this.adapter.predict(imagePath);

    // Validate predicted class is supported
    const predictedClass = SUPPORTED_WASTE_CLASSES.includes(prediction.predictedClass)
      ? prediction.predictedClass
      : AI_CONFIG.DEFAULT_CLASS;

    const predictedClassVi = WASTE_CLASSES_VI[predictedClass] || predictedClass;
    const disposalTips = WASTE_DISPOSAL_TIPS[predictedClass] || [];

    return {
      predictedClass,
      predictedClassVi,
      confidence: typeof prediction.confidence === 'number' ? prediction.confidence : 0,
      topPredictions: prediction.topPredictions || [
        {
          class: predictedClass,
          classVi: predictedClassVi,
          score: prediction.confidence || 0,
        },
      ],
      scores: prediction.scores || {},
      modelVersion: prediction.modelVersion || AI_CONFIG.CURRENT_MODEL_VERSION,
      inferenceTimeMs: prediction.inferenceTimeMs || 0,
      source: prediction.source || 'server',
      disposalTips,
      details: prediction.details || {},
    };
  }
}

module.exports = new AIService();
