process.env.SMTP_HOST = ''; // Tests never send email through the user's configured provider.
process.env.REDIS_PREFIX = `test:stations:${process.pid}:`;
// Chạy trên database test; chỉ xoá đúng những bản ghi do test này tạo ra.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'stations-integration-test-secret-only';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomUUID, randomInt } = require('node:crypto');
const { before, after, test } = require('node:test');
const mongoose = require('mongoose');
const app = require('../../src/app');
const User = require('../../src/modules/users/user.model');
const Station = require('../../src/modules/stations/station.model');
const StationLog = require('../../src/modules/stations/station-log.model');
const { verifiedRegistrationFetch, verifiedLoginFetch } = require('../helpers/verified-registration');

const runId = randomUUID().slice(0, 8);
// Toạ độ gốc ngẫu nhiên giữa đại dương phía nam → không trùng trạm seed hay dữ liệu test khác
const BASE = { latitude: -45 - Math.random(), longitude: 160 + Math.random() * 5 };
const KM = 1 / 111; // ~1 km theo vĩ độ

let server;
let baseUrl;
let userToken;
let adminToken;
const userIds = [];
const stationIds = {};

const api = async (path, { method = 'GET', token, body } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, ...(await response.json()) };
};

const makeStation = (key, offsetKm, overrides = {}) =>
  Station.create({
    code: `t-${runId}-${key}`,
    name: `Trạm kiểm thử ${key} ${runId}`,
    address: `Đường Thử Nghiệm ${key}, Gò Vấp`,
    location: { type: 'Point', coordinates: [BASE.longitude, BASE.latitude + offsetKm * KM] },
    stationType: 'SMART_RVM',
    acceptedCategories: ['plastic', 'metal'],
    openTime: '06:00',
    closeTime: '22:00',
    capacityPercent: 40,
    status: 'ACTIVE',
    ...overrides,
  });

async function registerAndLogin(role) {
  const email = `stations-${role}-${runId}@example.com`;
  const password = 'Password123!';
  const reg = await verifiedRegistrationFetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Station ${role}`,
      email,
      phone: `09${randomInt(10000000, 99999999)}`,
      password,
      confirmPassword: password,
    }),
  });
  const regData = await reg.json();
  assert.equal(reg.status, 201, JSON.stringify(regData));
  userIds.push(regData.data.user.id);
  if (role === 'admin') await User.updateOne({ email }, { role: 'admin' });

  const login = await verifiedLoginFetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: email, password }),
  });
  const loginData = await login.json();
  assert.equal(login.status, 200, JSON.stringify(loginData));
  return loginData.data.token;
}

before(async () => {
  await mongoose.connect(
    process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/scanwaste_stations_test',
    { serverSelectionTimeoutMS: 5000 }
  );
  await Promise.all([User.init(), Station.init()]);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  stationIds.near = (await makeStation('near', 1)).id; // ~1 km
  stationIds.full = (await makeStation('full', 2, { capacityPercent: 100, status: 'FULL' })).id; // ~2 km
  stationIds.offline = (await makeStation('offline', 3, { status: 'OFFLINE' })).id; // ~3 km
  stationIds.organic = (await makeStation('organic', 12, { acceptedCategories: ['organic'] })).id; // ~12 km

  userToken = await registerAndLogin('user');
  adminToken = await registerAndLogin('admin');
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState === 1) {
    const ids = Object.values(stationIds);
    await StationLog.deleteMany({ stationId: { $in: ids } });
    await Station.deleteMany({ _id: { $in: ids } });
    if (userIds.length) await User.deleteMany({ _id: { $in: userIds } });
  }
  await mongoose.disconnect();
  await require('../../src/config/redis').closeRedis();
});

const nearbyPath = (params = {}) =>
  `/api/stations/nearby?${new URLSearchParams({ lat: BASE.latitude, lng: BASE.longitude, ...params })}`;

test('nearby: thiếu toạ độ hoặc tham số sai → 400 VALIDATION_ERROR', async () => {
  const missing = await api('/api/stations/nearby');
  assert.equal(missing.status, 400);
  assert.equal(missing.code, 'VALIDATION_ERROR');

  const badCategory = await api(nearbyPath({ category: 'battery' }));
  assert.equal(badCategory.status, 400);
});

test('nearby (không cần đăng nhập): 3 trạm trong 5 km, gần → xa, có khoảng cách và số đếm', async () => {
  const res = await api(nearbyPath());
  assert.equal(res.status, 200);
  const codes = res.data.items.map((s) => s.code);
  assert.deepEqual(codes, [`t-${runId}-near`, `t-${runId}-full`, `t-${runId}-offline`]);
  assert.equal(res.data.radiusKm, 5);
  assert.equal(res.data.radiusExpanded, false);
  assert.equal(res.data.categoryCounts.all, 3);
  assert.equal(res.data.categoryCounts.organic, 0);
  const first = res.data.items[0];
  assert.ok(first.distanceKm > 0.5 && first.distanceKm < 1.5);
  assert.deepEqual(Object.keys(first.location).sort(), ['latitude', 'longitude']);
  assert.equal(first.searchText, undefined);
});

test('nearby: phân trang', async () => {
  const res = await api(nearbyPath({ limit: 2, page: 2 }));
  assert.equal(res.data.items.length, 1);
  assert.equal(res.data.pagination.totalCount, 3);
  assert.equal(res.data.pagination.totalPages, 2);
});

test('nearby: tìm không dấu theo tên/địa chỉ', async () => {
  const res = await api(nearbyPath({ q: `tram kiem thu near ${runId}` }));
  assert.deepEqual(res.data.items.map((s) => s.code), [`t-${runId}-near`]);
});

test('UC005 luồng 4a: lọc organic → tự nới bán kính lên 20 km', async () => {
  const res = await api(nearbyPath({ category: 'organic' }));
  assert.equal(res.data.radiusExpanded, true);
  assert.equal(res.data.radiusKm, 20);
  assert.deepEqual(res.data.items.map((s) => s.code), [`t-${runId}-organic`]);
});

test('GET /api/stations/:id: có khoảng cách khi truyền toạ độ; id sai → 404', async () => {
  const ok = await api(`/api/stations/${stationIds.near}?lat=${BASE.latitude}&lng=${BASE.longitude}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.data.id, stationIds.near);
  assert.ok(ok.data.distanceKm > 0.5 && ok.data.distanceKm < 1.5);

  const noPoint = await api(`/api/stations/${stationIds.near}`);
  assert.equal(noPoint.data.distanceKm, null);

  assert.equal((await api('/api/stations/not-an-id')).status, 404);
  assert.equal((await api(`/api/stations/${new mongoose.Types.ObjectId()}`)).status, 404);
});

test('admin API: chưa đăng nhập → 401, user thường → 403', async () => {
  assert.equal((await api('/api/admin/stations')).status, 401);
  assert.equal((await api('/api/admin/stations', { token: userToken })).status, 403);
  const patch = await api(`/api/admin/stations/${stationIds.near}/status`, {
    method: 'PATCH', token: userToken, body: { action: 'DISPATCH' },
  });
  assert.equal(patch.status, 403);
});

test('admin: danh sách xếp % giảm dần, có tổng hợp, lọc theo trạng thái', async () => {
  const res = await api('/api/admin/stations', { token: adminToken });
  assert.equal(res.status, 200);
  const percents = res.data.items.map((s) => s.capacityPercent);
  assert.deepEqual(percents, [...percents].sort((a, b) => b - a));
  assert.ok(res.data.summary.total >= 4);

  const offline = await api('/api/admin/stations?status=OFFLINE', { token: adminToken });
  assert.ok(offline.data.items.every((s) => s.status === 'OFFLINE'));
  assert.ok(offline.data.items.some((s) => s.id === stationIds.offline));
});

test('UC012 luồng 4a: điều xe → SERVICING, ghi log; điều xe lần 2 → 409; thu gom xong → ACTIVE 0%', async () => {
  const dispatch = await api(`/api/admin/stations/${stationIds.full}/status`, {
    method: 'PATCH', token: adminToken, body: { action: 'DISPATCH' },
  });
  assert.equal(dispatch.status, 200);
  assert.equal(dispatch.data.status, 'SERVICING');

  const again = await api(`/api/admin/stations/${stationIds.full}/status`, {
    method: 'PATCH', token: adminToken, body: { action: 'DISPATCH' },
  });
  assert.equal(again.status, 409);
  assert.equal(again.code, 'INVALID_STATION_STATE');

  const complete = await api(`/api/admin/stations/${stationIds.full}/status`, {
    method: 'PATCH', token: adminToken, body: { action: 'COMPLETE' },
  });
  assert.equal(complete.status, 200);
  assert.equal(complete.data.status, 'ACTIVE');
  assert.equal(complete.data.capacityPercent, 0);

  const logs = await StationLog.find({ stationId: stationIds.full }).sort({ createdAt: 1 });
  assert.deepEqual(logs.map((l) => l.action), ['DISPATCH', 'COMPLETE']);
  assert.equal(logs[0].fromStatus, 'FULL');
  assert.equal(logs[0].toStatus, 'SERVICING');
  assert.equal(String(logs[0].actorId), userIds[1]);
});

test('admin: trạm OFFLINE không điều xe được; action sai → 400', async () => {
  const offline = await api(`/api/admin/stations/${stationIds.offline}/status`, {
    method: 'PATCH', token: adminToken, body: { action: 'DISPATCH' },
  });
  assert.equal(offline.status, 409);

  const bad = await api(`/api/admin/stations/${stationIds.near}/status`, {
    method: 'PATCH', token: adminToken, body: { action: 'LOCK' },
  });
  assert.equal(bad.status, 400);
});

test('giả lập sức chứa: +60 từ 40% → 100% tự chuyển FULL; delta không hợp lệ → 400', async () => {
  const res = await api(`/api/admin/stations/${stationIds.near}/capacity`, {
    method: 'PATCH', token: adminToken, body: { delta: 60 },
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.capacityPercent, 100);
  assert.equal(res.data.status, 'FULL');

  for (const delta of [0, 101, 2.5, '10']) {
    const bad = await api(`/api/admin/stations/${stationIds.near}/capacity`, {
      method: 'PATCH', token: adminToken, body: { delta },
    });
    assert.equal(bad.status, 400, `delta ${delta}`);
  }
});
