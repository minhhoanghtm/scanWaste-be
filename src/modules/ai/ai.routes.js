const express = require('express');
const router = express.Router();
const aiController = require('./ai.controller');
const historyController = require('../history/history.controller');
const feedbackController = require('../feedback/feedback.controller');
const modelRegistryController = require('./modelRegistry/modelRegistry.controller');
const authMiddleware = require('../../middlewares/auth.middleware');
const upload = require('../../middlewares/upload.middleware');
const { validateImageUpload } = require('../../middlewares/imageValidation.middleware');

/**
 * AI Health Check
 * GET /api/ai/health
 */
router.get('/health', aiController.checkHealth);

/**
 * Currently Active AI Model Metadata
 * GET /api/ai/models/current
 */
router.get('/models/current', modelRegistryController.getCurrentActiveModel);

/**
 * Waste Image Classification API
 * POST /api/ai/classify
 */
router.post(
  '/classify',
  authMiddleware,
  upload.single('image'),
  validateImageUpload,
  aiController.classify
);

/**
 * Offline AI Classification Synchronization API
 * POST /api/ai/sync
 */
router.post('/sync', authMiddleware, aiController.syncOffline);

/**
 * AI Misclassification Feedback API
 * POST /api/ai/feedback
 */
router.post('/feedback', authMiddleware, feedbackController.submitFeedback);

/**
 * Classification History APIs (also mounted under /api/ai/history for API spec consistency)
 * GET /api/ai/history
 * GET /api/ai/history/:id
 * DELETE /api/ai/history/:id
 */
router.get('/history', authMiddleware, historyController.getHistory);
router.get('/history/:id', authMiddleware, historyController.getHistoryDetail);
router.delete('/history/:id', authMiddleware, historyController.deleteHistory);

module.exports = router;
