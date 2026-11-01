const stationService = require('./station.service');
const { parseNearbyQuery, parseOptionalPoint } = require('./station.validation');
const { sendSuccess } = require('../../utils/response');

class StationController {
  /** GET /api/stations/nearby?lat=&lng=&radiusKm=&category=&q=&page=&limit= */
  async getNearby(req, res, next) {
    try {
      const result = await stationService.getNearbyStations(parseNearbyQuery(req.query));
      return sendSuccess(res, 'Get nearby stations successfully', result, 200);
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/stations/:id?lat=&lng= */
  async getById(req, res, next) {
    try {
      const result = await stationService.getStationById(req.params.id, parseOptionalPoint(req.query));
      return sendSuccess(res, 'Get station successfully', result, 200);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new StationController();
