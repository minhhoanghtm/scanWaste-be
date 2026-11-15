const classificationService = require('./classification.service');
const classificationReviewService = require('./classification.review.service');
const { sendSuccess } = require('../../utils/response');

class ClassificationController {
  // UC002: Classify uploaded waste image
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
      return next(error);
    }
  }

  // UC011: Get admin review queue
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
      return next(error);
    }
  }

  // UC011: User reports incorrect classification
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
      return next(error);
    }
  }

  // UC011: Admin reviews or relabels classification
  async reviewClassification(req, res, next) {
    try {
      const result =
        await classificationReviewService.reviewClassification(
          req.params.id,
          req.user._id,
          req.body?.label,
          req.body?.notes
        );

      return sendSuccess(
        res,
        'Classification reviewed successfully',
        result,
        200
      );
    } catch (error) {
      return next(error);
    }
  }

  // Admin export review queue to Excel
  async exportReviewQueue(req, res, next) {
    try {
      const workbook = await classificationReviewService.exportReviewQueueExcel();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=review-queue.xlsx');
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new ClassificationController();