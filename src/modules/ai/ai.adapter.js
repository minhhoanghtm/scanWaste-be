const path = require('path');
const fs = require('fs');
const { AI_CONFIG, SUPPORTED_WASTE_CLASSES, WASTE_CLASSES_VI } = require('./ai.config');

/**
 * Base AI Adapter Interface
 */
class BaseAIAdapter {
  async predict(imagePath) {
    throw new Error('Method predict(imagePath) must be implemented by concrete AI adapter');
  }

  async checkHealth() {
    return { status: 'unknown' };
  }

  async reloadModel(modelPath, version, labelsPath) {
    return { success: true };
  }
}

/**
 * Mock AI Adapter for Development & Testing
 * Deterministic matching without generating fake random confidence scores
 */
class MockAIAdapter extends BaseAIAdapter {
  async reloadModel(modelPath, version, labelsPath) {
    return {
      success: true,
      message: `Mock model reloaded to version ${version}`,
      model_info: { model_version: version, ready: true },
    };
  }
  async predict(imagePath) {
    const filename = path.basename(imagePath).toLowerCase();

    let matchedClass = 'plastic';
    for (const wasteClass of SUPPORTED_WASTE_CLASSES) {
      if (filename.includes(wasteClass)) {
        matchedClass = wasteClass;
        break;
      }
    }

    const predictions = SUPPORTED_WASTE_CLASSES.map((wc) => ({
      class: wc,
      classVi: WASTE_CLASSES_VI[wc] || wc,
      score: wc === matchedClass ? 1.0 : 0.0,
    })).sort((a, b) => b.score - a.score);

    return {
      predictedClass: matchedClass,
      predictedClassVi: WASTE_CLASSES_VI[matchedClass] || matchedClass,
      confidence: 1.0,
      topPredictions: predictions,
      scores: predictions.reduce((acc, curr) => ({ ...acc, [curr.class]: curr.score }), {}),
      modelVersion: 'v3-mock',
      inferenceTimeMs: 1,
      source: 'server_mock',
      details: {
        mock: true,
        provider: 'mock_adapter',
        sourceFile: filename,
      },
    };
  }

  async checkHealth() {
    return { status: 'healthy', provider: 'mock' };
  }
}

/**
 * FastAPI TFLite Inference Adapter
 * Calls the dedicated Python FastAPI microservice running MobileNetV2 V3 TFLite
 */
class FastApiTFLiteAdapter extends BaseAIAdapter {
  constructor(baseUrl = AI_CONFIG.SERVICE_URL, timeoutMs = AI_CONFIG.TIMEOUT_MS) {
    super();
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
  }

  async checkHealth() {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(`${this.baseUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        return { status: 'unhealthy', statusCode: response.status };
      }
      return await response.json();
    } catch (err) {
      return { status: 'unreachable', error: err.message };
    }
  }

  async reloadModel(modelPath, version, labelsPath = null) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/reload-model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_path: path.resolve(modelPath),
          model_version: version,
          labels_path: labelsPath ? path.resolve(labelsPath) : undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Inference service reload error (${response.status}): ${errText}`);
      }

      return await response.json();
    } catch (err) {
      if (err.name === 'AbortError') {
        const timeoutErr = new Error(`AI model reload request timed out after ${this.timeoutMs}ms`);
        timeoutErr.statusCode = 504;
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async predict(imagePath) {
    const absoluteImagePath = path.resolve(imagePath);
    if (!fs.existsSync(absoluteImagePath)) {
      const err = new Error(`Image file not found for inference: ${absoluteImagePath}`);
      err.statusCode = 404;
      throw err;
    }

    // Try fast local IPC predict-path endpoint first
    try {
      return await this._predictViaPath(absoluteImagePath);
    } catch (ipcErr) {
      // If predict-path fails (e.g. remote container filesystem), fall back to multipart upload
      return await this._predictViaMultipart(absoluteImagePath);
    }
  }

  async _predictViaPath(absoluteImagePath) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/predict-path`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_path: absoluteImagePath }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Inference service error (${response.status}): ${errText}`);
      }

      const resJson = await response.json();
      return this._formatPredictionResult(resJson.data);
    } catch (err) {
      if (err.name === 'AbortError') {
        const timeoutErr = new Error(`AI inference request timed out after ${this.timeoutMs}ms`);
        timeoutErr.statusCode = 504;
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async _predictViaMultipart(absoluteImagePath) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const fileBuffer = fs.readFileSync(absoluteImagePath);
      const filename = path.basename(absoluteImagePath);
      const blob = new Blob([fileBuffer]);
      const formData = new FormData();
      formData.append('file', blob, filename);

      const response = await fetch(`${this.baseUrl}/predict`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Inference service multipart error (${response.status}): ${errText}`);
      }

      const resJson = await response.json();
      return this._formatPredictionResult(resJson.data);
    } catch (err) {
      if (err.name === 'AbortError') {
        const timeoutErr = new Error(`AI inference request timed out after ${this.timeoutMs}ms`);
        timeoutErr.statusCode = 504;
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  _formatPredictionResult(data) {
    const predictedClass = data.predictedClass;
    const predictedClassVi = WASTE_CLASSES_VI[predictedClass] || predictedClass;

    const topPredictions = (data.topPredictions || []).map((p) => ({
      class: p.class,
      classVi: WASTE_CLASSES_VI[p.class] || p.class,
      score: p.score,
    }));

    return {
      predictedClass,
      predictedClassVi,
      confidence: data.confidence,
      topPredictions,
      scores: data.scores || {},
      modelVersion: data.modelVersion || AI_CONFIG.CURRENT_MODEL_VERSION,
      inferenceTimeMs: data.inferenceTimeMs || 0,
      source: 'server',
      details: {
        provider: 'fastapi_tflite',
      },
    };
  }
}

/**
 * Factory to get active AI Adapter
 */
class AIAdapterFactory {
  static getAdapter(provider = AI_CONFIG.ACTIVE_PROVIDER) {
    switch (provider) {
      case 'mock':
        return new MockAIAdapter();
      case 'fastapi_tflite':
      default:
        return new FastApiTFLiteAdapter();
    }
  }
}

module.exports = {
  BaseAIAdapter,
  MockAIAdapter,
  FastApiTFLiteAdapter,
  AIAdapterFactory,
};
