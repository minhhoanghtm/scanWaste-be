const stationAdminService = require('./station.admin.service');
const { badRequest } = require('./station.validation');
const { sendSuccess } = require('../../utils/response');

class StationAdminController {
  /** GET /api/admin/stations?status= */
  async list(req, res, next) {
    try {
      const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
      const result = await stationAdminService.listStations({ status });
      return sendSuccess(res, 'Get stations successfully', result, 200);
    } catch (error) {
      next(error);
    }
  }

  /** PATCH /api/admin/stations/:id/status  body: { action: 'DISPATCH' | 'COMPLETE' } */
  async updateStatus(req, res, next) {
    try {
      const { action } = req.body || {};
      let result;
      if (action === 'DISPATCH') result = await stationAdminService.dispatch(req.params.id, req.user._id);
      else if (action === 'COMPLETE') result = await stationAdminService.complete(req.params.id, req.user._id);
      else throw badRequest(["action must be 'DISPATCH' or 'COMPLETE'"]);
      return sendSuccess(res, 'Station status updated', result, 200);
    } catch (error) {
      next(error);
    }
  }

  /** PATCH /api/admin/stations/:id/capacity  body: { delta: số nguyên -100…100 } */
  async simulateCapacity(req, res, next) {
    try {
      const delta = req.body?.delta;
      if (!Number.isInteger(delta) || delta < -100 || delta > 100 || delta === 0) {
        throw badRequest(['delta must be a non-zero integer between -100 and 100']);
      }
      const result = await stationAdminService.simulateCapacity(req.params.id, req.user._id, delta);
      return sendSuccess(res, 'Station capacity updated (simulated telemetry)', result, 200);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new StationAdminController();
