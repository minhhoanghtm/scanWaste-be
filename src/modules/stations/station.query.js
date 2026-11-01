/**
 * Hàm thuần (không đụng DB) cho truy vấn trạm – tách riêng để unit test được.
 */
const { SUPPORTED_WASTE_CLASSES } = require('../ai/ai.config');
const { STATION_THRESHOLDS } = require('./station.constants');

const roundKm = (meters) => Math.round(meters / 100) / 10;

/** Khoảng cách Haversine (km, làm tròn 0.1) – dùng khi xem chi tiết 1 trạm */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

function getCapacityLevel(capacityPercent) {
  if (capacityPercent >= STATION_THRESHOLDS.FULL_PERCENT) return 'FULL';
  if (capacityPercent >= STATION_THRESHOLDS.WARNING_PERCENT) return 'WARNING';
  return 'NORMAL';
}

/** Trạng thái tự suy ra khi % đổi. OFFLINE và SERVICING do admin quyết định nên giữ nguyên. */
function deriveStatus(currentStatus, capacityPercent) {
  if (currentStatus === 'OFFLINE' || currentStatus === 'SERVICING') return currentStatus;
  return capacityPercent >= STATION_THRESHOLDS.FULL_PERCENT ? 'FULL' : 'ACTIVE';
}

/** Các mức bán kính sẽ thử: bán kính yêu cầu, rồi các mức nới lớn hơn (UC005 luồng 4a) */
function radiusSteps(radiusKm) {
  return [radiusKm, ...STATION_THRESHOLDS.EXPANDED_RADIUS_STEPS_KM.filter((r) => r > radiusKm)];
}

/**
 * Từ danh sách trạm đã có distanceKm (đã lọc từ khoá, sắp gần → xa) tạo kết quả UC005:
 * đếm theo loại trong bán kính ban đầu → lọc loại rác → nới bán kính nếu rỗng → phân trang.
 */
function buildNearbyResult(candidates, { radiusKm, category, page, limit }) {
  const inBase = candidates.filter((s) => s.distanceKm <= radiusKm);
  const categoryCounts = { all: inBase.length };
  for (const c of SUPPORTED_WASTE_CLASSES) {
    categoryCounts[c] = inBase.filter((s) => s.acceptedCategories.includes(c)).length;
  }

  const filtered = category ? candidates.filter((s) => s.acceptedCategories.includes(category)) : candidates;

  let usedRadius = radiusKm;
  let inRadius = [];
  for (const r of radiusSteps(radiusKm)) {
    usedRadius = r;
    inRadius = filtered.filter((s) => s.distanceKm <= r);
    if (inRadius.length > 0) break;
  }

  const start = (page - 1) * limit;
  return {
    items: inRadius.slice(start, start + limit),
    pagination: {
      page,
      limit,
      totalCount: inRadius.length,
      totalPages: Math.ceil(inRadius.length / limit),
    },
    radiusKm: usedRadius,
    radiusExpanded: usedRadius !== radiusKm,
    categoryCounts,
  };
}

/** Tổng hợp cho màn Giám sát trạm (UC012) */
function summarizeStations(stations) {
  const summary = { total: 0, warning: 0, full: 0, offline: 0, servicing: 0 };
  for (const s of stations) {
    summary.total += 1;
    if (s.status === 'OFFLINE') summary.offline += 1;
    else if (s.status === 'SERVICING') summary.servicing += 1;
    else if (getCapacityLevel(s.capacityPercent) === 'FULL') summary.full += 1;
    else if (getCapacityLevel(s.capacityPercent) === 'WARNING') summary.warning += 1;
  }
  return summary;
}

module.exports = {
  roundKm,
  haversineKm,
  getCapacityLevel,
  deriveStatus,
  radiusSteps,
  buildNearbyResult,
  summarizeStations,
};
