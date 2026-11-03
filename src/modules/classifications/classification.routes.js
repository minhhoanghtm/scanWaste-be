
const express = require('express');
const router = express.Router();

const classificationController = require('./classification.controller');
const {
  validateClassificationUpload,
} = require('./classification.validation');

const authMiddleware = require('../../middlewares/auth.middleware');
const adminMiddleware = require('../../middlewares/admin.middleware');
const upload = require('../../middlewares/upload.middleware');

// UC002: Upload and classify waste image
router.post(
  '/',
  authMiddleware,
  upload.single('image'),
  validateClassificationUpload,
  classificationController.classify
);

// UC011: User reports incorrect AI classification
router.post(
  '/:id/report-incorrect',
  authMiddleware,
  classificationController.reportIncorrect
);

// UC011: Admin gets classification review queue
router.get(
  '/admin/review-queue',
  authMiddleware,
  adminMiddleware,
  classificationController.getReviewQueue
);

// UC011: Admin reviews or relabels classification
router.patch(
  '/admin/:id/review',
  authMiddleware,
  adminMiddleware,
  classificationController.reviewClassification
);

module.exports = router;
