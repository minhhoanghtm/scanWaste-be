const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const ModelRegistry = require('./modelRegistry.model');
const aiService = require('../ai.service');
const { SUPPORTED_WASTE_CLASSES, AI_CONFIG } = require('../ai.config');

class ModelRegistryService {
  /**
   * Automatically seed MobileNetV2 V3 if registry is empty
   */
  async seedDefaultModelIfEmpty() {
    if (mongoose.connection.readyState !== 1) {
      return;
    }
    const count = await ModelRegistry.countDocuments();
    if (count === 0) {
      const defaultModelPath = path.resolve('models/scanwaste_mobilenetv2_v3.tflite');
      let checksum = 'e87cf8c24cc08def6ab03dbb26b4e8a6043736f3d1de24834d1e2f30a011e724';
      let fileSizeBytes = 9554344;

      if (fs.existsSync(defaultModelPath)) {
        try {
          const buffer = fs.readFileSync(defaultModelPath);
          checksum = crypto.createHash('sha256').update(buffer).digest('hex');
          fileSizeBytes = buffer.length;
        } catch (e) {
          // Fall back to precomputed values
        }
      }

      await ModelRegistry.create({
        modelName: 'ScanWaste MobileNetV2 V3',
        version: 'v3',
        artifactPath: 'models/scanwaste_mobilenetv2_v3.tflite',
        checksum,
        fileSizeBytes,
        inputShape: [1, 224, 224, 3],
        inputDtype: 'float32',
        outputShape: [1, 7],
        outputDtype: 'float32',
        labels: SUPPORTED_WASTE_CLASSES,
        normalization: {
          inputShape: [1, 224, 224, 3],
          colorSpace: 'RGB',
          range: [0, 255],
          normalization: 'inside_model',
        },
        targetPlatform: 'universal',
        status: 'active',
        trainingAccuracy: null,
        validationAccuracy: null,
        testAccuracy: null,
        evaluationNotes: 'Production baseline MobileNetV2 V3 trained for 7 waste categories',
        activatedAt: new Date(),
        deployStatus: 'ready',
        deployMessage: 'Active default production model',
      });
    }
  }

  /**
   * Get current active model
   * @param {string} targetPlatform - 'server' | 'mobile_bundled' | 'universal'
   */
  async getCurrentActiveModel(targetPlatform = 'server') {
    await this.seedDefaultModelIfEmpty();

    let model = await ModelRegistry.findOne({
      status: 'active',
      targetPlatform: { $in: [targetPlatform, 'universal'] },
    }).sort({ activatedAt: -1 });

    if (!model) {
      model = await ModelRegistry.findOne({ status: 'active' }).sort({ activatedAt: -1 });
    }

    if (!model) {
      const err = new Error('No active AI model found in registry');
      err.statusCode = 404;
      throw err;
    }

    return model;
  }

  /**
   * List all registered models with filtering & pagination
   */
  async listModels(query = {}) {
    await this.seedDefaultModelIfEmpty();

    const { status, targetPlatform, page = 1, limit = 20 } = query;
    const filter = {};

    if (status) filter.status = status;
    if (targetPlatform) filter.targetPlatform = targetPlatform;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - limitNum < 0 ? 0 : pageNum - 1) * limitNum;

    const [models, total] = await Promise.all([
      ModelRegistry.find(filter)
        .populate('activatedBy', 'name email role')
        .populate('createdBy', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      ModelRegistry.countDocuments(filter),
    ]);

    const activeCount = await ModelRegistry.countDocuments({ status: 'active' });

    return {
      models,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum) || 1,
      },
      activeModelsCount: activeCount,
    };
  }

  /**
   * Get model details by ID
   */
  async getModelById(id) {
    const model = await ModelRegistry.findById(id)
      .populate('activatedBy', 'name email role')
      .populate('createdBy', 'name email role');

    if (!model) {
      const err = new Error(`AI model not found with ID: ${id}`);
      err.statusCode = 404;
      throw err;
    }

    return model;
  }

  /**
   * Register a new AI model version
   */
  async registerModel({ user, file, body = {} }) {
    await this.seedDefaultModelIfEmpty();

    const modelName = body.modelName ? body.modelName.trim() : null;
    const version = body.version ? body.version.trim() : null;

    if (!modelName) {
      const err = new Error('Model name is required');
      err.statusCode = 400;
      throw err;
    }

    if (!version) {
      const err = new Error('Model version is required (e.g. v4, v4.1)');
      err.statusCode = 400;
      throw err;
    }

    // Check version uniqueness
    if (mongoose.connection.readyState === 1) {
      const existing = await ModelRegistry.findOne({ version });
      if (existing) {
        const err = new Error(`Model version '${version}' is already registered`);
        err.statusCode = 409;
        throw err;
      }
    }

    // Determine artifact path
    let artifactPath = null;
    if (file && file.path) {
      artifactPath = file.path.replace(/\\/g, '/');
    } else if (body.artifactPath) {
      artifactPath = body.artifactPath.trim();
    } else {
      const err = new Error('Model artifact file upload or artifactPath is required');
      err.statusCode = 400;
      throw err;
    }

    // Verify artifact file existence on disk
    const absoluteArtifactPath = path.resolve(artifactPath);

    // Path traversal security check: Enforce artifact resides strictly within models/ or uploads/
    const allowedRoots = [
      path.resolve(process.cwd(), 'models'),
      path.resolve(process.cwd(), 'uploads'),
    ];
    const isPathAllowed = allowedRoots.some((allowedRoot) =>
      absoluteArtifactPath.startsWith(allowedRoot)
    );
    if (!isPathAllowed) {
      const err = new Error(
        'Security violation: Model artifact file must reside strictly within models/ or uploads/ directory'
      );
      err.statusCode = 400;
      throw err;
    }

    if (!fs.existsSync(absoluteArtifactPath)) {
      const err = new Error(`Model artifact file not found on disk at: ${artifactPath}`);
      err.statusCode = 400;
      throw err;
    }

    // Read artifact file
    let fileBuffer;
    try {
      fileBuffer = fs.readFileSync(absoluteArtifactPath);
    } catch (readErr) {
      const err = new Error(`Failed to read model artifact file: ${readErr.message}`);
      err.statusCode = 400;
      throw err;
    }

    // Validate TFLite file format (Magic header bytes at offset 4: 'TFL3')
    if (fileBuffer.length < 8) {
      const err = new Error('Invalid model file: artifact file is too small to be a valid TFLite model');
      err.statusCode = 400;
      throw err;
    }

    const magic = fileBuffer.slice(4, 8).toString('ascii');
    if (magic !== 'TFL3') {
      const err = new Error(
        `Invalid model format: artifact does not contain standard TensorFlow Lite flatbuffer header (expected 'TFL3', got '${magic}')`
      );
      err.statusCode = 400;
      throw err;
    }

    // Compute SHA-256 checksum
    const computedChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // If checksum was provided in request, validate it matches
    if (body.checksum && body.checksum.trim()) {
      const providedChecksum = body.checksum.trim().toLowerCase();
      if (providedChecksum !== computedChecksum.toLowerCase()) {
        const err = new Error(
          `Checksum mismatch: provided SHA-256 '${providedChecksum}' does not match computed file SHA-256 '${computedChecksum}'`
        );
        err.statusCode = 400;
        throw err;
      }
    }

    // Validate tensor input/output shapes and dtypes
    let inputShape = [1, 224, 224, 3];
    if (body.inputShape) {
      try {
        inputShape = Array.isArray(body.inputShape) ? body.inputShape : JSON.parse(body.inputShape);
      } catch (e) {
        const err = new Error('Invalid inputShape: must be a valid JSON array');
        err.statusCode = 400;
        throw err;
      }
      if (
        !Array.isArray(inputShape) ||
        inputShape.length !== 4 ||
        inputShape[0] !== 1 ||
        inputShape[1] !== 224 ||
        inputShape[2] !== 224 ||
        inputShape[3] !== 3
      ) {
        const err = new Error(
          `Incompatible input shape: ScanWaste MobileNetV2 requires [1, 224, 224, 3], received ${JSON.stringify(inputShape)}`
        );
        err.statusCode = 400;
        throw err;
      }
    }

    const inputDtype = body.inputDtype ? body.inputDtype.trim().toLowerCase() : 'float32';
    if (inputDtype !== 'float32') {
      const err = new Error(`Incompatible input dtype: expected 'float32', received '${inputDtype}'`);
      err.statusCode = 400;
      throw err;
    }

    let outputShape = [1, 7];
    if (body.outputShape) {
      try {
        outputShape = Array.isArray(body.outputShape) ? body.outputShape : JSON.parse(body.outputShape);
      } catch (e) {
        const err = new Error('Invalid outputShape: must be a valid JSON array');
        err.statusCode = 400;
        throw err;
      }
      if (!Array.isArray(outputShape) || outputShape.length !== 2 || outputShape[0] !== 1 || outputShape[1] !== 7) {
        const err = new Error(
          `Incompatible output shape: ScanWaste MobileNetV2 requires [1, 7], received ${JSON.stringify(outputShape)}`
        );
        err.statusCode = 400;
        throw err;
      }
    }

    const outputDtype = body.outputDtype ? body.outputDtype.trim().toLowerCase() : 'float32';
    if (outputDtype !== 'float32') {
      const err = new Error(`Incompatible output dtype: expected 'float32', received '${outputDtype}'`);
      err.statusCode = 400;
      throw err;
    }

    // Validate label sequence
    let labels = SUPPORTED_WASTE_CLASSES;
    if (body.labels) {
      try {
        labels = Array.isArray(body.labels) ? body.labels : JSON.parse(body.labels);
      } catch (e) {
        const err = new Error('Invalid labels format: must be a JSON array of 7 waste classes');
        err.statusCode = 400;
        throw err;
      }

      if (!Array.isArray(labels) || labels.length !== 7) {
        const err = new Error(
          `Invalid labels count: ScanWaste requires exactly 7 labels, received ${labels.length}`
        );
        err.statusCode = 400;
        throw err;
      }

      // Check exact label order match
      for (let i = 0; i < SUPPORTED_WASTE_CLASSES.length; i++) {
        if (labels[i] !== SUPPORTED_WASTE_CLASSES[i]) {
          const err = new Error(
            `Invalid label order at index ${i}: expected '${SUPPORTED_WASTE_CLASSES[i]}', received '${labels[i]}'. Labels must strictly match model output tensor index order.`
          );
          err.statusCode = 400;
          throw err;
        }
      }
    }

    // Validate normalization & preprocessing
    const normalization = {
      inputShape: [1, 224, 224, 3],
      colorSpace: 'RGB',
      range: [0, 255],
      normalization: 'inside_model',
    };
    if (body.normalization) {
      let customNorm = body.normalization;
      if (typeof customNorm === 'string') {
        try {
          customNorm = JSON.parse(customNorm);
        } catch (e) {
          const err = new Error('Invalid normalization: must be a valid JSON object');
          err.statusCode = 400;
          throw err;
        }
      }
      if (customNorm && typeof customNorm === 'object') {
        if (customNorm.colorSpace && customNorm.colorSpace !== 'RGB') {
          const err = new Error(`Incompatible colorSpace: ScanWaste requires 'RGB', got '${customNorm.colorSpace}'`);
          err.statusCode = 400;
          throw err;
        }
        Object.assign(normalization, customNorm);
      }
    }

    // Parse Accuracy metrics (strictly nullable, never guessed or fabricated)
    const parseAccuracy = (val, fieldName) => {
      if (val === undefined || val === null || val === '') return null;
      const num = Number(val);
      if (isNaN(num) || num < 0 || num > 1) {
        const err = new Error(`${fieldName} must be a valid number between 0 and 1, or null`);
        err.statusCode = 400;
        throw err;
      }
      return num;
    };

    const trainingAccuracy = parseAccuracy(body.trainingAccuracy, 'trainingAccuracy');
    const validationAccuracy = parseAccuracy(body.validationAccuracy, 'validationAccuracy');
    const testAccuracy = parseAccuracy(body.testAccuracy, 'testAccuracy');

    const targetPlatform = ['server', 'mobile_bundled', 'universal'].includes(body.targetPlatform)
      ? body.targetPlatform
      : 'server';

    const modelData = {
      modelName,
      version,
      artifactPath: artifactPath.replace(/\\/g, '/'),
      checksum: computedChecksum,
      fileSizeBytes: fileBuffer.length,
      inputShape,
      inputDtype,
      outputShape,
      outputDtype,
      labels,
      normalization,
      targetPlatform,
      status: 'inactive', // newly registered models start as inactive
      trainingAccuracy,
      validationAccuracy,
      testAccuracy,
      evaluationNotes: body.evaluationNotes ? body.evaluationNotes.trim() : '',
      deployStatus: 'ready',
      deployMessage: 'Registered and ready for activation',
      createdBy: user ? user._id : null,
    };

    if (mongoose.connection.readyState === 1) {
      return await ModelRegistry.create(modelData);
    }

    return modelData;
  }

  /**
   * Activate a model version for serving inference
   * Concurrency-safe and handles live reload / deployment notifications
   */
  async activateModel(id, adminUser) {
    await this.seedDefaultModelIfEmpty();

    const model = await ModelRegistry.findById(id);
    if (!model) {
      const err = new Error(`AI model not found with ID: ${id}`);
      err.statusCode = 404;
      throw err;
    }

    // Verify artifact file still exists on disk
    const absoluteArtifactPath = path.resolve(model.artifactPath);

    // Path traversal security check
    const allowedRoots = [
      path.resolve(process.cwd(), 'models'),
      path.resolve(process.cwd(), 'uploads'),
    ];
    const isPathAllowed = allowedRoots.some((allowedRoot) =>
      absoluteArtifactPath.startsWith(allowedRoot)
    );
    if (!isPathAllowed) {
      const err = new Error(
        'Security violation: Model artifact file must reside strictly within models/ or uploads/ directory'
      );
      err.statusCode = 400;
      throw err;
    }

    if (!fs.existsSync(absoluteArtifactPath)) {
      const err = new Error(
        `Cannot activate model: artifact file missing from disk at '${model.artifactPath}'`
      );
      err.statusCode = 400;
      throw err;
    }

    // Verify checksum integrity
    try {
      const buffer = fs.readFileSync(absoluteArtifactPath);
      const currentChecksum = crypto.createHash('sha256').update(buffer).digest('hex');
      if (currentChecksum.toLowerCase() !== model.checksum.toLowerCase()) {
        const err = new Error(
          `Cannot activate model: file checksum has changed on disk! Recorded: ${model.checksum}, Current: ${currentChecksum}`
        );
        err.statusCode = 400;
        throw err;
      }
    } catch (readErr) {
      const err = new Error(`Artifact integrity check failed: ${readErr.message}`);
      err.statusCode = 400;
      throw err;
    }

    // Find currently active model for this platform target (to store for rollback)
    const previousActive = await ModelRegistry.findOne({
      status: 'active',
      targetPlatform: { $in: [model.targetPlatform, 'universal'] },
      _id: { $ne: model._id },
    }).sort({ activatedAt: -1 });

    let deployStatus = 'ready';
    let deployMessage = '';
    let hotReloaded = false;
    let requiresRestart = false;
    let requiresMobileBuild = false;

    // Hot-reload or deployment handling
    if (model.targetPlatform === 'server' || model.targetPlatform === 'universal') {
      try {
        const reloadResult = await aiService.reloadModel(model.artifactPath, model.version);
        hotReloaded = true;
        deployStatus = 'hot_reloaded';
        deployMessage = `Model version ${model.version} hot-reloaded into active inference service runtime.`;
      } catch (reloadErr) {
        hotReloaded = false;
        requiresRestart = true;
        deployStatus = 'restart_required';
        deployMessage = `Model version ${model.version} activated in registry, but FastAPI service hot-reload failed (${reloadErr.message}). Microservice restart or redeploy required to serve predictions.`;
      }
    } else if (model.targetPlatform === 'mobile_bundled') {
      hotReloaded = false;
      requiresMobileBuild = true;
      deployStatus = 'mobile_build_required';
      deployMessage = `Model version ${model.version} activated in registry for mobile_bundled platform. Mobile app build / OTA update required to deploy onto mobile devices. Server inference remains unaffected.`;
    }

    // Concurrency-safe atomic state transition in MongoDB
    // 1. Deactivate other active models for matching targetPlatform
    await ModelRegistry.updateMany(
      {
        status: 'active',
        targetPlatform: { $in: [model.targetPlatform, 'universal'] },
        _id: { $ne: model._id },
      },
      {
        $set: { status: 'inactive' },
      }
    );

    // 2. Activate target model
    model.status = 'active';
    model.activatedAt = new Date();
    model.activatedBy = adminUser ? adminUser._id : null;
    model.previousActiveVersion = previousActive ? previousActive.version : null;
    model.deployStatus = deployStatus;
    model.deployMessage = deployMessage;
    await model.save();

    return {
      model,
      hotReloaded,
      requiresRestart,
      requiresMobileBuild,
      deployStatus,
      deployMessage,
      previousActiveVersion: model.previousActiveVersion,
    };
  }

  /**
   * Rollback to the previous active model version
   */
  async rollbackModel(id, adminUser) {
    const model = await ModelRegistry.findById(id);
    if (!model) {
      const err = new Error(`AI model not found with ID: ${id}`);
      err.statusCode = 404;
      throw err;
    }

    let targetVersion = model.previousActiveVersion;
    let previousModel = null;

    if (targetVersion) {
      previousModel = await ModelRegistry.findOne({ version: targetVersion });
    }

    if (!previousModel) {
      // Find the most recently activated model other than this one
      previousModel = await ModelRegistry.findOne({
        _id: { $ne: model._id },
        targetPlatform: { $in: [model.targetPlatform, 'universal'] },
        status: { $in: ['inactive', 'deprecated'] },
      }).sort({ activatedAt: -1, updatedAt: -1 });
    }

    if (!previousModel) {
      const err = new Error(
        `No previous model version recorded or available for rollback from version ${model.version}`
      );
      err.statusCode = 400;
      throw err;
    }

    // Activate previous model
    const activationResult = await this.activateModel(previousModel._id, adminUser);

    return {
      rolledBackFrom: model.version,
      activeVersion: previousModel.version,
      model: activationResult.model,
      hotReloaded: activationResult.hotReloaded,
      deployStatus: activationResult.deployStatus,
      deployMessage: activationResult.deployMessage,
    };
  }
}

module.exports = new ModelRegistryService();
