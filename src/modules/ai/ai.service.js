const { AI_CONFIG, SUPPORTED_WASTE_CLASSES } = require('./ai.config');
const { AIAdapterFactory } = require('./ai.adapter');

class AIService {
  constructor() {
    this.adapter = AIAdapterFactory.getAdapter(AI_CONFIG.ACTIVE_PROVIDER);
  }

  /**
   * Set custom adapter at runtime (e.g. for switching models or running integration tests)
   */
  setAdapter(adapter) {
    this.adapter = adapter;
  }

  /**
   * Classify an uploaded image
   * @param {string} imagePath - Absolute or relative path to the image file
   * @returns {Promise<{predictedClass: string, confidence: number, details: object}>}
   */
  async classifyImage(imagePath) {
    if (!imagePath) {
      const error = new Error('Image path is required for classification');
      error.statusCode = 400;
      throw error;
    }

    const prediction = await this.adapter.predict(imagePath);

    // Validate predicted class
    const predictedClass = SUPPORTED_WASTE_CLASSES.includes(prediction.predictedClass)
      ? prediction.predictedClass
      : AI_CONFIG.DEFAULT_CLASS;

    return {
      predictedClass,
      confidence: typeof prediction.confidence === 'number' ? prediction.confidence : 0,
      details: prediction.details || {},
    };
  }
}

module.exports = new AIService();
