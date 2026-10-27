const express = require('express');
const router = express.Router();
const feedbackController = require('../modules/feedback/feedback.controller');
const datasetController = require('../modules/dataset/dataset.controller');
const modelRegistryController = require('../modules/ai/modelRegistry/modelRegistry.controller');
const statisticsController = require('../modules/statistics/statistics.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const adminMiddleware = require('../middlewares/admin.middleware');
const upload = require('../middlewares/upload.middleware');
const { validateImageUpload } = require('../middlewares/imageValidation.middleware');

// All Admin AI routes require both JWT Authentication and Admin Role Authorization
router.use(authMiddleware, adminMiddleware);

/**
 * ----------------------------------------------------
 * Admin AI Model Registry & Lifecycle Management
 * ----------------------------------------------------
 */
router.get('/models', modelRegistryController.listModels);
router.get('/models/current', modelRegistryController.getCurrentActiveModel);
router.get('/models/:id', modelRegistryController.getModelDetail);
router.post('/models', upload.single('modelFile'), modelRegistryController.registerModel);
router.patch('/models/:id/activate', modelRegistryController.activateModel);
router.patch('/models/:id/rollback', modelRegistryController.rollbackModel);

/**
 * ----------------------------------------------------
 * Admin AI Comprehensive Statistics
 * GET /api/admin/ai/statistics
 * ----------------------------------------------------
 */
router.get('/statistics', statisticsController.getAdminStatistics);

/**
 * ----------------------------------------------------
 * Admin AI Feedback Management
 * ----------------------------------------------------
 */
router.get('/feedback', feedbackController.getAdminFeedback);
router.get('/feedback/:id', feedbackController.getAdminFeedbackDetail);
router.patch('/feedback/:id/review', feedbackController.reviewFeedback);

/**
 * ----------------------------------------------------
 * Admin Dataset Management (for MobileNetV2 V4/V5)
 * ----------------------------------------------------
 */
router.get('/datasets', datasetController.getDatasetList);
router.post(
  '/datasets',
  upload.single('image'),
  validateImageUpload,
  datasetController.createDatasetItem
);
router.get('/datasets/:id', datasetController.getDatasetItemDetail);
router.patch('/datasets/:id', datasetController.updateDatasetItem);

// Export dataset as ZIP for Google Colab fine-tuning (supports both POST and GET)
router.post('/datasets/export', datasetController.exportDataset);
router.get('/datasets/export', datasetController.exportDataset);

module.exports = router;
