const express = require('express');
const router = express.Router();
const classificationController = require('./classification.controller');
const { validateClassificationUpload } = require('./classification.validation');
const authMiddleware = require('../../middlewares/auth.middleware');
const upload = require('../../middlewares/upload.middleware');

router.post(
  '/',
  authMiddleware,
  upload.single('image'),
  validateClassificationUpload,
  classificationController.classify
);

module.exports = router;
