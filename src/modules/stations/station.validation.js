const { SUPPORTED_WASTE_CLASSES } = require('../ai/ai.config');
const { STATION_THRESHOLDS } = require('./station.constants');

const badRequest = (errors) =>
  Object.assign(new Error('Validation Error'), { statusCode: 400, errorCode: 'VALIDATION_ERROR', errors });

const toNumber = (value) => (value === undefined || value === '' ? undefined : Number(value));

/**
 * GET /api/stations/nearby – kiểm tra và chuẩn hoá query.
 * lat, lng bắt buộc; radiusKm (mặc định 5), category, q, page, limit tuỳ chọn.
 */
function parseNearbyQuery(query) {
  const errors = [];
  const latitude = toNumber(query.lat);
  const longitude = toNumber(query.lng);
  const radiusKm = toNumber(query.radiusKm) ?? STATION_THRESHOLDS.DEFAULT_RADIUS_KM;
  const page = toNumber(query.page) ?? 1;
  const limit = toNumber(query.limit) ?? STATION_THRESHOLDS.DEFAULT_PAGE_SIZE;
  const category = query.category ? String(query.category).toLowerCase() : null;
  const keyword = typeof query.q === 'string' ? query.q.trim() : '';

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) errors.push('lat must be a number between -90 and 90');
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) errors.push('lng must be a number between -180 and 180');
  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > STATION_THRESHOLDS.MAX_RADIUS_KM) {
    errors.push(`radiusKm must be greater than 0 and at most ${STATION_THRESHOLDS.MAX_RADIUS_KM}`);
  }
  if (!Number.isInteger(page) || page < 1) errors.push('page must be a positive integer');
  if (!Number.isInteger(limit) || limit < 1 || limit > STATION_THRESHOLDS.MAX_PAGE_SIZE) {
    errors.push(`limit must be an integer between 1 and ${STATION_THRESHOLDS.MAX_PAGE_SIZE}`);
  }
  if (category && !SUPPORTED_WASTE_CLASSES.includes(category)) {
    errors.push(`category must be one of: ${SUPPORTED_WASTE_CLASSES.join(', ')}`);
  }
  if (keyword.length > 100) errors.push('q cannot exceed 100 characters');

  if (errors.length) throw badRequest(errors);
  return { latitude, longitude, radiusKm, category, keyword, page, limit };
}

/** Toạ độ tuỳ chọn (để tính khoảng cách ở GET /api/stations/:id) */
function parseOptionalPoint(query) {
  if (query.lat === undefined && query.lng === undefined) return null;
  const latitude = toNumber(query.lat);
  const longitude = toNumber(query.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw badRequest(['lat and lng must be valid coordinates']);
  }
  return { latitude, longitude };
}

module.exports = { parseNearbyQuery, parseOptionalPoint, badRequest };
