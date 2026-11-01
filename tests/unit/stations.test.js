/**
 * Unit tests – logic truy vấn trạm (không cần MongoDB).
 * Dùng chính bộ seed 15 trạm để bảo đảm API cho kết quả giống bản dữ liệu giả trên mobile.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const seedData = require('../../src/modules/stations/station.seed-data');
const {
  haversineKm,
  getCapacityLevel,
  deriveStatus,
  radiusSteps,
  buildNearbyResult,
  summarizeStations,
} = require('../../src/modules/stations/station.query');

const IUH = { latitude: 10.8221, longitude: 106.6869 };

// Giả lập kết quả $geoNear: mỗi trạm kèm distanceKm, sắp gần → xa
const candidates = seedData
  .map((s) => ({
    ...s,
    distanceKm: haversineKm(IUH.latitude, IUH.longitude, s.coordinates[1], s.coordinates[0]),
  }))
  .sort((a, b) => a.distanceKm - b.distanceKm);

const query = (overrides = {}) => ({ radiusKm: 5, category: null, page: 1, limit: 5, ...overrides });

test('trong 5 km quanh IUH có 13 trạm, phân trang 5 trạm/trang, gần nhất là st-01', () => {
  const result = buildNearbyResult(candidates, query());
  assert.equal(result.pagination.totalCount, 13);
  assert.equal(result.pagination.totalPages, 3);
  assert.equal(result.items.length, 5);
  assert.equal(result.items[0].code, 'st-01');
  assert.equal(result.radiusExpanded, false);
});

test('trang cuối chỉ còn phần dư', () => {
  const result = buildNearbyResult(candidates, query({ page: 3 }));
  assert.equal(result.items.length, 3);
});

test('categoryCounts đếm trong bán kính ban đầu, không phụ thuộc bộ lọc loại rác', () => {
  const all = buildNearbyResult(candidates, query());
  const filtered = buildNearbyResult(candidates, query({ category: 'glass' }));
  assert.deepEqual(all.categoryCounts, filtered.categoryCounts);
  assert.equal(all.categoryCounts.all, 13);
  assert.equal(all.categoryCounts.plastic, 10);
  assert.equal(all.categoryCounts.organic, 0);
});

test('UC005 luồng 4a: lọc "organic" không có trạm trong 5 km → nới lên 10 km', () => {
  const result = buildNearbyResult(candidates, query({ category: 'organic' }));
  assert.equal(result.radiusKm, 10);
  assert.equal(result.radiusExpanded, true);
  assert.deepEqual(result.items.map((s) => s.code), ['st-14', 'st-15']);
});

test('không có trạm nào kể cả sau khi nới tối đa → danh sách rỗng ở bán kính 20 km', () => {
  const result = buildNearbyResult([], query());
  assert.equal(result.items.length, 0);
  assert.equal(result.radiusKm, 20);
  assert.equal(result.pagination.totalPages, 0);
});

test('radiusSteps chỉ thêm các mức lớn hơn bán kính yêu cầu', () => {
  assert.deepEqual(radiusSteps(5), [5, 10, 20]);
  assert.deepEqual(radiusSteps(15), [15, 20]);
  assert.deepEqual(radiusSteps(30), [30]);
});

test('mức sức chứa và trạng thái tự suy ra', () => {
  assert.equal(getCapacityLevel(94), 'NORMAL');
  assert.equal(getCapacityLevel(95), 'WARNING');
  assert.equal(getCapacityLevel(100), 'FULL');
  assert.equal(deriveStatus('ACTIVE', 100), 'FULL');
  assert.equal(deriveStatus('FULL', 40), 'ACTIVE');
  assert.equal(deriveStatus('SERVICING', 100), 'SERVICING');
  assert.equal(deriveStatus('OFFLINE', 10), 'OFFLINE');
});

test('summarizeStations đếm đúng bộ seed', () => {
  assert.deepEqual(summarizeStations(seedData), { total: 15, warning: 2, full: 1, offline: 1, servicing: 1 });
});
