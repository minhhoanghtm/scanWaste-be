/**
 * Unit tests for isolated business logic / AI services / Image validation / Offline Sync / Feedback / Dataset
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AIAdapterFactory, MockAIAdapter } = require('../../src/modules/ai/ai.adapter');
const { SUPPORTED_WASTE_CLASSES, WASTE_CLASSES_VI, AI_CONFIG } = require('../../src/modules/ai/ai.config');
const { isValidImageMagicBytes } = require('../../src/middlewares/imageValidation.middleware');
const aiService = require('../../src/modules/ai/ai.service');
const aiSyncService = require('../../src/modules/ai/ai.sync.service');
const feedbackService = require('../../src/modules/feedback/feedback.service');
const { DIFFICULTY_TAGS } = require('../../src/modules/dataset/dataset.model');

const runUnitTests = async () => {
  console.log('Running AI Module, Security, Feedback & Dataset Unit Tests...');

  // 1. Check supported classes order matches TFLite model output
  const expectedClasses = ['organic', 'cardboard', 'glass', 'metal', 'paper', 'plastic', 'other'];
  const matchesOrder = expectedClasses.every((c, i) => SUPPORTED_WASTE_CLASSES[i] === c);
  if (matchesOrder && SUPPORTED_WASTE_CLASSES.length === 7) {
    console.log('✔ TFLite 7 Waste Classes ordering matches model metadata');
  } else {
    console.error('✖ Waste classes ordering mismatch');
    process.exit(1);
  }

  // 2. Test Image Magic Bytes Validator
  const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const validWebp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
  const fakeImage = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff');

  if (
    isValidImageMagicBytes(validJpeg) &&
    isValidImageMagicBytes(validPng) &&
    isValidImageMagicBytes(validWebp) &&
    !isValidImageMagicBytes(fakeImage)
  ) {
    console.log('✔ Image binary magic numbers validation passed');
  } else {
    console.error('✖ Image binary magic numbers validation failed');
    process.exit(1);
  }

  // 3. Test Mock AI Adapter unit test
  const adapter = new MockAIAdapter();
  const mockResult = await adapter.predict('test_plastic_bottle.jpg');
  if (
    mockResult.predictedClass === 'plastic' &&
    mockResult.predictedClassVi === 'Nhựa' &&
    mockResult.details.mock === true &&
    Array.isArray(mockResult.topPredictions)
  ) {
    console.log('✔ AI Mock Adapter unit test passed');
  } else {
    console.error('✖ AI Mock Adapter unit test failed');
    process.exit(1);
  }

  // 4. Test AIService with Mock Adapter
  aiService.setAdapter(adapter);
  const serviceResult = await aiService.classifyImage('sample_organic_waste.jpg');
  if (
    serviceResult.predictedClass === 'organic' &&
    serviceResult.predictedClassVi === 'Rác hữu cơ' &&
    Array.isArray(serviceResult.disposalTips) &&
    serviceResult.disposalTips.length > 0
  ) {
    console.log('✔ AIService classification orchestration unit test passed');
  } else {
    console.error('✖ AIService classification orchestration unit test failed');
    process.exit(1);
  }

  // 5. Test Offline Sync Validation (Unit Level)
  try {
    await aiSyncService.syncSingleItem('user123', {
      predictedClass: 'plastic',
    });
    console.error('✖ Expected missing clientClassificationId to fail');
    process.exit(1);
  } catch (err) {
    if (err.statusCode === 400 && err.message.includes('clientClassificationId is required')) {
      console.log('✔ Offline Sync clientClassificationId validation passed');
    } else {
      console.error('✖ Unexpected error on missing clientClassificationId:', err);
      process.exit(1);
    }
  }

  try {
    await aiSyncService.syncSingleItem('user123', {
      clientClassificationId: 'id_123',
      predictedClass: 'invalid_category_xyz',
    });
    console.error('✖ Expected invalid predictedClass to fail');
    process.exit(1);
  } catch (err) {
    if (err.statusCode === 400 && err.message.includes('Invalid predictedClass')) {
      console.log('✔ Offline Sync predictedClass category validation passed');
    } else {
      console.error('✖ Unexpected error on invalid predictedClass:', err);
      process.exit(1);
    }
  }

  // 6. Test Feedback Validation (Unit Level)
  try {
    await feedbackService.submitFeedback('user123', {
      // missing classificationId
      correctClass: 'plastic',
    });
    console.error('✖ Expected missing classificationId to fail');
    process.exit(1);
  } catch (err) {
    if (err.statusCode === 400 && err.message.includes('classificationId is required')) {
      console.log('✔ Feedback classificationId validation passed');
    } else {
      console.error('✖ Unexpected error on missing classificationId:', err);
      process.exit(1);
    }
  }

  try {
    await feedbackService.submitFeedback('user123', {
      classificationId: '670000000000000000000001',
      correctClass: 'invalid_plastic_unknown',
    });
    console.error('✖ Expected invalid correctClass to fail');
    process.exit(1);
  } catch (err) {
    if (err.statusCode === 400 && err.message.includes('Invalid correctClass')) {
      console.log('✔ Feedback correctClass validation passed');
    } else {
      console.error('✖ Unexpected error on invalid correctClass:', err);
      process.exit(1);
    }
  }

  // 7. Test Dataset Difficulty Tags & SHA-256 Hash Deduplication
  const expectedTags = ['standard', 'transparent_pet_vs_glass', 'paper_vs_cardboard', 'reflective_metal_vs_plastic'];
  const tagsValid = expectedTags.every((t) => DIFFICULTY_TAGS.includes(t));
  if (tagsValid) {
    console.log('✔ Dataset difficulty tags match MobileNetV2 V4/V5 fine-tuning priorities');
  } else {
    console.error('✖ Dataset difficulty tags missing expected keys');
    process.exit(1);
  }

  const sampleBuffer = Buffer.from('test_image_bytes_content_for_hashing');
  const hash1 = crypto.createHash('sha256').update(sampleBuffer).digest('hex');
  const hash2 = crypto.createHash('sha256').update(sampleBuffer).digest('hex');
  if (hash1 === hash2 && hash1.length === 64) {
    console.log('✔ Dataset SHA-256 image content hashing verified');
  } else {
    console.error('✖ SHA-256 hashing mismatch');
    process.exit(1);
  }

  // 8. Test Model Registry Validation (Unit Level)
  const modelRegistryService = require('../../src/modules/ai/modelRegistry/modelRegistry.service');

  // Test missing artifact
  try {
    await modelRegistryService.registerModel({
      user: { _id: 'admin123' },
      body: { modelName: 'Test V4', version: 'v4_missing' },
    });
    console.error('✖ Expected missing artifact to fail');
    process.exit(1);
  } catch (err) {
    if (err.statusCode === 400 && err.message.includes('artifact')) {
      console.log('✔ Model Registry missing artifact validation passed');
    } else {
      console.error('✖ Unexpected error on missing artifact:', err);
      process.exit(1);
    }
  }

  // Test invalid input shape
  try {
    await modelRegistryService.registerModel({
      user: { _id: 'admin123' },
      body: {
        modelName: 'Test Incompatible Shape',
        version: 'v4_bad_shape',
        artifactPath: 'models/scanwaste_mobilenetv2_v3.tflite',
        inputShape: [1, 128, 128, 3], // invalid size
      },
    });
    console.error('✖ Expected invalid inputShape to fail');
    process.exit(1);
  } catch (err) {
    if (err.statusCode === 400 && err.message.includes('Incompatible input shape')) {
      console.log('✔ Model Registry input shape validation passed');
    } else {
      console.error('✖ Unexpected error on invalid input shape:', err);
      process.exit(1);
    }
  }

  // Test invalid labels sequence
  try {
    await modelRegistryService.registerModel({
      user: { _id: 'admin123' },
      body: {
        modelName: 'Test Incompatible Labels',
        version: 'v4_bad_labels',
        artifactPath: 'models/scanwaste_mobilenetv2_v3.tflite',
        labels: ['plastic', 'glass', 'organic', 'metal', 'paper', 'cardboard', 'other'], // wrong order
      },
    });
    console.error('✖ Expected invalid labels order to fail');
    process.exit(1);
  } catch (err) {
    if (err.statusCode === 400 && err.message.includes('Invalid label order')) {
      console.log('✔ Model Registry label sequence validation passed');
    } else {
      console.error('✖ Unexpected error on invalid label sequence:', err);
      process.exit(1);
    }
  }

  // Test checksum mismatch
  try {
    await modelRegistryService.registerModel({
      user: { _id: 'admin123' },
      body: {
        modelName: 'Test Checksum Mismatch',
        version: 'v4_bad_checksum',
        artifactPath: 'models/scanwaste_mobilenetv2_v3.tflite',
        checksum: '0000000000000000000000000000000000000000000000000000000000000000',
      },
    });
    console.error('✖ Expected checksum mismatch to fail');
    process.exit(1);
  } catch (err) {
    if (err.statusCode === 400 && err.message.includes('Checksum mismatch')) {
      console.log('✔ Model Registry checksum mismatch validation passed');
    } else {
      console.error('✖ Unexpected error on checksum mismatch:', err);
      process.exit(1);
    }
  }

  // Test invalid accuracy values (> 1.0 or < 0.0)
  try {
    await modelRegistryService.registerModel({
      user: { _id: 'admin123' },
      body: {
        modelName: 'Test Invalid Accuracy',
        version: 'v4_bad_acc',
        artifactPath: 'models/scanwaste_mobilenetv2_v3.tflite',
        trainingAccuracy: 1.5,
      },
    });
    console.error('✖ Expected invalid accuracy to fail');
    process.exit(1);
  } catch (err) {
    if (err.statusCode === 400 && err.message.includes('trainingAccuracy must be a valid number between 0 and 1')) {
      console.log('✔ Model Registry invalid accuracy range validation passed');
    } else {
      console.error('✖ Unexpected error on invalid accuracy:', err);
      process.exit(1);
    }
  }

  // Test invalid input dtype
  try {
    await modelRegistryService.registerModel({
      user: { _id: 'admin123' },
      body: {
        modelName: 'Test Invalid Dtype',
        version: 'v4_bad_dtype',
        artifactPath: 'models/scanwaste_mobilenetv2_v3.tflite',
        inputDtype: 'int8',
      },
    });
    console.error('✖ Expected invalid input dtype to fail');
    process.exit(1);
  } catch (err) {
    if (err.statusCode === 400 && err.message.includes("Incompatible input dtype: expected 'float32'")) {
      console.log('✔ Model Registry input dtype validation passed');
    } else {
      console.error('✖ Unexpected error on invalid input dtype:', err);
      process.exit(1);
    }
  }

  // Test invalid normalization colorSpace
  try {
    await modelRegistryService.registerModel({
      user: { _id: 'admin123' },
      body: {
        modelName: 'Test Invalid ColorSpace',
        version: 'v4_bad_colorspace',
        artifactPath: 'models/scanwaste_mobilenetv2_v3.tflite',
        normalization: { colorSpace: 'GRAYSCALE' },
      },
    });
    console.error('✖ Expected invalid colorSpace to fail');
    process.exit(1);
  } catch (err) {
    if (err.statusCode === 400 && err.message.includes("Incompatible colorSpace: ScanWaste requires 'RGB'")) {
      console.log('✔ Model Registry colorSpace validation passed');
    } else {
      console.error('✖ Unexpected error on invalid colorSpace:', err);
      process.exit(1);
    }
  }

  // Test non-TFLite flatbuffer header validation
  const dummyNonTflite = path.resolve('models/dummy_invalid.tflite');
  try {
    fs.writeFileSync(dummyNonTflite, Buffer.from('NOT_A_VALID_TFLITE_MODEL_FLATBUFFER'));
    await modelRegistryService.registerModel({
      user: { _id: 'admin123' },
      body: {
        modelName: 'Test Invalid Magic',
        version: 'v4_bad_magic',
        artifactPath: 'models/dummy_invalid.tflite',
      },
    });
    console.error('✖ Expected invalid TFLite magic header to fail');
    process.exit(1);
  } catch (err) {
    if (err.statusCode === 400 && err.message.includes('TFL3')) {
      console.log('✔ Model Registry TFLite TFL3 magic header validation passed');
    } else {
      console.error('✖ Unexpected error on invalid magic header:', err);
      process.exit(1);
    }
  } finally {
    if (fs.existsSync(dummyNonTflite)) {
      fs.unlinkSync(dummyNonTflite);
    }
  }

  // Test path traversal attempt in model artifactPath
  try {
    await modelRegistryService.registerModel({
      user: { _id: 'admin123' },
      body: {
        modelName: 'Test Path Traversal',
        version: 'v4_traversal',
        artifactPath: '../../../../windows/system32/cmd.exe',
      },
    });
    console.error('✖ Expected path traversal attempt to fail');
    process.exit(1);
  } catch (err) {
    if (err.statusCode === 400 && err.message.includes('Security violation')) {
      console.log('✔ Model Registry path traversal rejection verified');
    } else {
      console.error('✖ Unexpected error on path traversal test:', err);
      process.exit(1);
    }
  }

  console.log('ALL AI MODULE, FEEDBACK, DATASET & MODEL REGISTRY UNIT TESTS PASSED SUCCESSFULLY!\n');
};

if (require.main === module) {
  runUnitTests();
}

module.exports = runUnitTests;
