const feedbackService = require('./feedback.service');
const { sendSuccess } = require('../../utils/response');

class FeedbackController {
  /**
   * POST /api/ai/feedback
   * User reports an incorrect AI classification
   */
  async submitFeedback(req, res, next) {
    try {
      const result = await feedbackService.submitFeedback(req.user._id, req.body);
      return sendSuccess(res, 'Feedback submitted successfully', result, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/ai/feedback
   * Admin lists feedbacks
   */
  async getAdminFeedback(req, res, next) {
    try {
      const result = await feedbackService.getAdminFeedbackList(req.query);
      return sendSuccess(res, 'Feedbacks retrieved successfully', result, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/ai/feedback/:id
   * Admin views single feedback detail
   */
  async getAdminFeedbackDetail(req, res, next) {
    try {
      const { id } = req.params;
      const result = await feedbackService.getAdminFeedbackDetail(id);
      return sendSuccess(res, 'Feedback detail retrieved successfully', result, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/admin/ai/feedback/:id/review
   * Admin reviews/approves/rejects feedback
   */
  async reviewFeedback(req, res, next) {
    try {
      const { id } = req.params;
      const result = await feedbackService.reviewFeedback(req.user._id, id, req.body);
      return sendSuccess(res, 'Feedback reviewed successfully', result, 200);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new FeedbackController();
