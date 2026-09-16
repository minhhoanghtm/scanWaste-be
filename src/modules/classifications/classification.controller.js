const classificationService = require('./classification.service');
const { sendSuccess } = require('../../utils/response');

class ClassificationController {
  async classify(req, res, next) {
    try {
      const result = await classificationService.createClassification(req.user._id, req.file);
      return sendSuccess(res, 'Classification successfully', result, 201);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ClassificationController();
