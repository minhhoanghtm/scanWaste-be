const datasetService = require('./dataset.service');
const { sendSuccess } = require('../../utils/response');

class DatasetController {
  /**
   * POST /api/admin/ai/datasets
   * Admin uploads new image to dataset
   */
  async createDatasetItem(req, res, next) {
    try {
      const result = await datasetService.createDatasetItem(req.user._id, req.file, req.body);
      return sendSuccess(res, 'Dataset item created successfully', result, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/ai/datasets
   * Admin retrieves paginated dataset items with filters
   */
  async getDatasetList(req, res, next) {
    try {
      const result = await datasetService.getDatasetList(req.query);
      return sendSuccess(res, 'Dataset items retrieved successfully', result, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/ai/datasets/:id
   * Admin gets single dataset item detail
   */
  async getDatasetItemDetail(req, res, next) {
    try {
      const { id } = req.params;
      const result = await datasetService.getDatasetItemDetail(id);
      return sendSuccess(res, 'Dataset item detail retrieved successfully', result, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/admin/ai/datasets/:id
   * Admin updates dataset item
   */
  async updateDatasetItem(req, res, next) {
    try {
      const { id } = req.params;
      const result = await datasetService.updateDatasetItem(id, req.body);
      return sendSuccess(res, 'Dataset item updated successfully', result, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/ai/datasets/export
   * Admin exports dataset as streaming ZIP archive for Google Colab
   */
  async exportDataset(req, res, next) {
    try {
      await datasetService.streamExportZip(res, req.body || req.query);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new DatasetController();
