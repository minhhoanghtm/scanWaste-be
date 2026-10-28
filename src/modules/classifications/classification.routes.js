const express = require('express');
const router = express.Router();

const classificationController = require('./classification.controller');
const {
  validateClassificationUpload,
} = require('./classification.validation');

const authMiddleware = require('../../middlewares/auth.middleware');
const adminMiddleware = require('../../middlewares/admin.middleware');
const upload = require('../../middlewares/upload.middleware');

// UC002: Quet va phan loai rac
router.post(
  '/',
  authMiddleware,
  upload.single('image'),
  validateClassificationUpload,
  classificationController.classify
);

// UC011: Nguoi dung bao cao AI nhan dien sai
router.post(
  '/:id/report-incorrect',
  authMiddleware,
  classificationController.reportIncorrect
);

// UC011: Quan tri vien xem hang doi duyet
router.get(
  '/admin/review-queue',
  authMiddleware,
  adminMiddleware,
  classificationController.getReviewQueue
);

// UC011: Quan tri vien duyet hoac dan nhan lai
router.patch(
  '/admin/:id/review',
  authMiddleware,
  adminMiddleware,
  classificationController.reviewClassification
);

module.exports = router;