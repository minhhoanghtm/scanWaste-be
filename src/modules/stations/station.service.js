const mongoose = require('mongoose');
const Station = require('./station.model');
const { normalizeSearchText } = require('./station.model');
const { roundKm, haversineKm, radiusSteps, buildNearbyResult } = require('./station.query');

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const notFound = () =>
  Object.assign(new Error('Station not found'), { statusCode: 404, errorCode: 'STATION_NOT_FOUND' });

class StationService {
  /**
   * UC005 – trạm gần vị trí, sắp gần → xa.
   * Lấy một lần mọi trạm trong bán kính lớn nhất có thể dùng ($geoNear + index 2dsphere),
   * rồi đếm / lọc loại / nới bán kính / phân trang trong bộ nhớ (buildNearbyResult).
   */
  async getNearbyStations({ latitude, longitude, radiusKm, category, keyword, page, limit }) {
    const maxRadiusKm = Math.max(...radiusSteps(radiusKm));
    const normalizedKeyword = normalizeSearchText(keyword);

    const docs = await Station.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [longitude, latitude] },
          distanceField: 'distanceMeters',
          maxDistance: maxRadiusKm * 1000,
          spherical: true,
          ...(normalizedKeyword ? { query: { searchText: { $regex: escapeRegex(normalizedKeyword) } } } : {}),
        },
      },
    ]);

    const candidates = docs.map(({ distanceMeters, ...doc }) => ({
      ...Station.hydrate(doc).toJSON(),
      distanceKm: roundKm(distanceMeters),
    }));

    return buildNearbyResult(candidates, { radiusKm, category, page, limit });
  }

  /** UC005/UC006 – chi tiết 1 trạm; truyền toạ độ thì kèm khoảng cách */
  async getStationById(id, from = null) {
    if (!mongoose.isValidObjectId(id)) throw notFound();
    const station = await Station.findById(id);
    if (!station) throw notFound();

    const json = station.toJSON();
    return {
      ...json,
      distanceKm: from
        ? haversineKm(from.latitude, from.longitude, json.location.latitude, json.location.longitude)
        : null,
    };
  }
}

module.exports = new StationService();
