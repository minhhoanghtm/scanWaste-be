const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Feedback = require('./feedback.model');
const Classification = require('../classifications/classification.model');
const { DatasetItem } = require('../dataset/dataset.model');
const { SUPPORTED_WASTE_CLASSES } = require('../ai/ai.config');
const env = require('../../config/env');

class FeedbackService {
  /**
   * User submits feedback on an AI classification result
   */
  async submitFeedback(userId, data) {
    const {
      classificationId,
      correctClass,
      isCorrect = false,
      comment = '',
      userConsentForTraining = false,
    } = data;

    if (!classificationId) {
      const error = new Error('classificationId is required');
      error.statusCode = 400;
      throw error;
    }

    if (!correctClass || !SUPPORTED_WASTE_CLASSES.includes(correctClass.toLowerCase())) {
      const error = new Error(
        `Invalid correctClass: "${correctClass}". Must be one of: ${SUPPORTED_WASTE_CLASSES.join(', ')}`
      );
      error.statusCode = 400;
      throw error;
    }

    // 1. Verify classification ownership (User can only feedback their own classifications)
    const classification = await Classification.findOne({
      _id: classificationId,
      userId,
    });

    if (!classification) {
      const error = new Error('Classification record not found or access denied');
      error.statusCode = 404;
      throw error;
    }

    // 2. Prevent duplicate feedback for the same classification
    const existingFeedback = await Feedback.findOne({
      userId,
      classificationId,
    });

    if (existingFeedback) {
      const error = new Error('Feedback for this classification has already been submitted');
      error.statusCode = 409;
      throw error;
    }

    // 3. Create feedback record
    const feedback = await Feedback.create({
      userId,
      classificationId,
      predictedClass: classification.predictedClass,
      correctClass: correctClass.toLowerCase(),
      isCorrect: !!isCorrect,
      comment: typeof comment === 'string' ? comment.trim() : '',
      modelVersion: classification.modelVersion || 'v3',
      userConsentForTraining: !!userConsentForTraining,
      imageUrl: classification.imageUrl || null,
      status: 'pending',
      auditLog: [
        {
          action: 'submitted',
          performedBy: userId,
          timestamp: new Date(),
          details: {
            predictedClass: classification.predictedClass,
            correctClass: correctClass.toLowerCase(),
            consentGiven: !!userConsentForTraining,
          },
        },
      ],
    });

    return feedback;
  }

  /**
   * Admin lists all submitted feedbacks with filters and pagination
   */
  async getAdminFeedbackList(query = {}) {
    const {
      page = 1,
      limit = 20,
      status,
      predictedClass,
      correctClass,
      hasConsent,
    } = query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};
    if (status && ['pending', 'reviewed', 'approved', 'rejected'].includes(status.toLowerCase())) {
      filter.status = status.toLowerCase();
    }
    if (predictedClass && SUPPORTED_WASTE_CLASSES.includes(predictedClass.toLowerCase())) {
      filter.predictedClass = predictedClass.toLowerCase();
    }
    if (correctClass && SUPPORTED_WASTE_CLASSES.includes(correctClass.toLowerCase())) {
      filter.correctClass = correctClass.toLowerCase();
    }
    if (typeof hasConsent === 'string') {
      filter.userConsentForTraining = hasConsent.toLowerCase() === 'true';
    }

    const [items, totalCount] = await Promise.all([
      Feedback.find(filter)
        .populate('userId', 'name email role')
        .populate('reviewedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Feedback.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalCount / limitNum) || 1;

    return {
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
    };
  }

  /**
   * Admin gets detail of single feedback
   */
  async getAdminFeedbackDetail(id) {
    const feedback = await Feedback.findById(id)
      .populate('userId', 'name email role')
      .populate('classificationId')
      .populate('reviewedBy', 'name email')
      .populate('datasetItemId');

    if (!feedback) {
      const error = new Error('Feedback record not found');
      error.statusCode = 404;
      throw error;
    }

    return feedback;
  }

  /**
   * Admin reviews, approves, or rejects feedback and optionally creates approved dataset item
   */
  async reviewFeedback(adminUserId, id, reviewData) {
    const {
      status,
      verifiedClass,
      adminNotes = '',
      addToDataset = false,
      split = 'train',
      difficultyTag = 'standard',
    } = reviewData;

    if (!status || !['reviewed', 'approved', 'rejected'].includes(status.toLowerCase())) {
      const error = new Error('Valid review status is required (reviewed, approved, rejected)');
      error.statusCode = 400;
      throw error;
    }

    const normalizedStatus = status.toLowerCase();

    if (verifiedClass && !SUPPORTED_WASTE_CLASSES.includes(verifiedClass.toLowerCase())) {
      const error = new Error(`Invalid verifiedClass: "${verifiedClass}"`);
      error.statusCode = 400;
      throw error;
    }

    const feedback = await Feedback.findById(id);
    if (!feedback) {
      const error = new Error('Feedback record not found');
      error.statusCode = 404;
      throw error;
    }

    const finalVerifiedClass = verifiedClass
      ? verifiedClass.toLowerCase()
      : feedback.correctClass;

    feedback.status = normalizedStatus;
    feedback.reviewedBy = adminUserId;
    feedback.reviewedAt = new Date();
    feedback.verifiedClass = finalVerifiedClass;
    if (adminNotes) {
      feedback.adminNotes = adminNotes.trim();
    }

    feedback.auditLog.push({
      action: `review_${normalizedStatus}`,
      performedBy: adminUserId,
      timestamp: new Date(),
      details: {
        status: normalizedStatus,
        verifiedClass: finalVerifiedClass,
        adminNotes,
        addToDataset: !!addToDataset,
      },
    });

    // If approved and addToDataset requested
    if (normalizedStatus === 'approved' && addToDataset) {
      if (!feedback.userConsentForTraining) {
        const err = new Error(
          'Cannot add to dataset: User has not given consent to use this image for AI training.'
        );
        err.statusCode = 400;
        throw err;
      }

      if (!feedback.imageUrl) {
        const err = new Error('Cannot add to dataset: Classification record has no image URL.');
        err.statusCode = 400;
        throw err;
      }

      // Read physical file and compute hash for deduplication
      const uploadDirResolved = path.resolve(process.cwd(), env.UPLOAD_DIR);
      const relativePath = feedback.imageUrl.replace(/^\/uploads\//, '');
      const fullPath = path.resolve(uploadDirResolved, relativePath);

      if (!fs.existsSync(fullPath)) {
        const err = new Error(`Image file not found on disk at: ${fullPath}`);
        err.statusCode = 404;
        throw err;
      }

      const fileBuffer = fs.readFileSync(fullPath);
      const imageHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      // Check if already in dataset
      let datasetItem = await DatasetItem.findOne({ imageHash });
      if (!datasetItem) {
        datasetItem = await DatasetItem.create({
          label: finalVerifiedClass,
          split: ['train', 'val', 'test'].includes(split) ? split : 'train',
          imageUrl: feedback.imageUrl,
          imageHash,
          source: 'feedback_approved',
          difficultyTag: difficultyTag || 'standard',
          consentGiven: true,
          status: 'active',
          feedbackId: feedback._id,
          originalClassificationId: feedback.classificationId,
          createdBy: adminUserId,
          metadata: {
            approvedFromFeedback: true,
            originalPrediction: feedback.predictedClass,
            reviewedBy: adminUserId,
          },
        });
      }

      feedback.addedToDataset = true;
      feedback.datasetItemId = datasetItem._id;
    }

    await feedback.save();
    return feedback;
  }
}

module.exports = new FeedbackService();
