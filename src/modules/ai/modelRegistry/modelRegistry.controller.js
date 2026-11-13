const modelRegistryService = require('./modelRegistry.service');
const { sendSuccess } = require('../../../utils/response');

class ModelRegistryController {
  /**
   * GET /api/ai/models/current
   * Public/client endpoint to fetch the currently serving AI model
   */
  async getCurrentActiveModel(req, res, next) {
    try {
      const platform = req.query.platform || 'server';
      const model = await modelRegistryService.getCurrentActiveModel(platform);
      return sendSuccess(res, 'Active model retrieved successfully', model, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/ai/models
   * Admin endpoint to list all registered model versions
   */
  async listModels(req, res, next) {
    try {
      const result = await modelRegistryService.listModels(req.query);
      return sendSuccess(res, 'Model registry retrieved successfully', result, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/ai/models/:id
   * Admin endpoint to inspect single model version details
   */
  async getModelDetail(req, res, next) {
    try {
      const model = await modelRegistryService.getModelById(req.params.id);
      return sendSuccess(res, 'Model details retrieved successfully', model, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/ai/models
   * Admin endpoint to register a new AI model version
   */
  async registerModel(req, res, next) {
    try {
      const model = await modelRegistryService.registerModel({
        user: req.user,
        file: req.file,
        body: req.body,
      });
      return sendSuccess(res, 'AI model registered successfully', model, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/admin/ai/models/:id/activate
   * Admin endpoint to activate a model version for production inference
   */
  async activateModel(req, res, next) {
    try {
      const result = await modelRegistryService.activateModel(req.params.id, req.user);
      return sendSuccess(res, result.deployMessage || 'Model activated successfully', result, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/admin/ai/models/:id/rollback
   * Admin endpoint to roll back to the previous active model version
   */
  async rollbackModel(req, res, next) {
    try {
      const result = await modelRegistryService.rollbackModel(req.params.id, req.user);
      return sendSuccess(res, result.deployMessage || 'Model rolled back successfully', result, 200);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ModelRegistryController();
