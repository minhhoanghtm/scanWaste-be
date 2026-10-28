const classificationService = require('./classification.service');
const classificationReviewService = require('./classification.review.service');
const { sendSuccess } = require('../../utils/response');

class ClassificationController {
  async classify(req, res, next) {
    try {
      const result = await classificationService.createClassification(
        req.user._id,
        req.file
      );

      return sendSuccess(
        res,
        'Classification successfully',
        result,
        201
      );
    } catch (error) {
      next(error);
    }
  }

  async getReviewQueue(req, res, next) {
    try {
      const result = await classificationReviewService.getReviewQueue({
        page: req.query.page,
        limit: req.query.limit,
      });

      return sendSuccess(
        res,
        'Get AI review queue successfully',
        result,
        200
      );
    } catch (error) {
      next(error);
    }
  }

  async reportIncorrect(req, res, next) {
    try {
      const result = await classificationReviewService.reportIncorrect(
        req.user._id,
        req.params.id
      );

      return sendSuccess(
        res,
        'Classification reported successfully',
        result,
        200
      );
    } catch (error) {
      next(error);
    }
  }

  async reviewClassification(req, res, next) {
    try {
      const result =
        await classificationReviewService.reviewClassification(
          req.params.id,
          req.user._id,
          req.body.label
        );

      return sendSuccess(
        res,
        'Classification reviewed successfully',
        result,
        200
      );
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ClassificationController();