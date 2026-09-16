const path = require('path');
const { SUPPORTED_WASTE_CLASSES } = require('./ai.config');

/**
 * Base AI Adapter Interface
 */
class BaseAIAdapter {
  async predict(imagePath) {
    throw new Error('Method predict(imagePath) must be implemented by concrete AI adapter');
  }
}

/**
 * Mock AI Adapter for Development & Testing
 * Transparently indicates mock execution without generating fake random confidence scores
 */
class MockAIAdapter extends BaseAIAdapter {
  async predict(imagePath) {
    const filename = path.basename(imagePath).toLowerCase();
    
    // Deterministic matching for testing purposes based on file keywords
    let matchedClass = 'plastic';
    for (const wasteClass of SUPPORTED_WASTE_CLASSES) {
      if (filename.includes(wasteClass)) {
        matchedClass = wasteClass;
        break;
      }
    }

    return {
      predictedClass: matchedClass,
      confidence: 0, // Explicitly 0 for mock mode (no fake random numbers)
      details: {
        mock: true,
        provider: 'mock_adapter',
        status: 'AI_MODEL_NOT_CONFIGURED',
        note: 'Mock prediction for development/testing. Replace with real AI model adapter when available.',
        sourceFile: filename,
      },
    };
  }
}

/**
 * Factory to get the active AI Adapter based on configuration
 */
class AIAdapterFactory {
  static getAdapter(provider = 'mock') {
    switch (provider) {
      case 'mock':
      default:
        return new MockAIAdapter();
    }
  }
}

module.exports = {
  BaseAIAdapter,
  MockAIAdapter,
  AIAdapterFactory,
};
