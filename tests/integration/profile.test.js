process.env.NODE_ENV = 'test';
process.env.SMTP_HOST = '';
process.env.JWT_SECRET = 'profile-integration-test-secret-only';
process.env.REDIS_PREFIX = `test:profile:${process.pid}:`;

const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const app = require('../../src/app');
const User = require('../../src/modules/users/user.model');
const Classification = require('../../src/modules/classifications/classification.model');
const VoucherWallet = require('../../src/modules/vouchers/voucher-wallet.model');
const session = require('../../src/modules/auth/auth.session');
const redis = require('../../src/config/redis');
const env = require('../../src/config/env');
const userService = require('../../src/modules/users/user.service');

const runId = randomUUID();
const owners = [];
let server, base, owner, other, token;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT6kAAAAASUVORK5CYII=', 'base64');
const request = async (route, { method = 'GET', body, auth = token } = {}) => {
  const response = await fetch(`${base}/api/users/me${route}`, {
    method,
    headers: { ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
  });
  return { status: response.status, ...(await response.json()) };
};
const imageBody = (bytes = png, type = 'image/png', filename = 'photo.png') => {
  const body = new FormData(); body.append('avatar', new Blob([bytes], { type }), filename); return body;
};
before(async () => {
  await mongoose.connect(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/scanwaste_profile_test', { serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.init(), VoucherWallet.init(), Classification.init()]);
  for (const [suffix, points] of [['owner', 1250], ['other', 9000]]) {
    const user = await User.create({ name: suffix, email: `${suffix}-${runId}@example.test`, password: 'fixture-hash-only', totalPoints: points });
    owners.push(user._id);
  }
  owner = await User.findById(owners[0]); other = await User.findById(owners[1]);
  token = (await session.create(owner)).token;
  const now = Date.now();
  await VoucherWallet.create([
    { userId: owner._id, voucherName: 'Quà còn hạn', voucherCode: runId+'1', pointsUsed: 200 },
    { userId: owner._id, voucherName: 'Quà đã dùng', voucherCode: runId+'2', pointsUsed: 150, status: 'used', usedAt: new Date(now-1000) },
    { userId: owner._id, voucherName: 'Quà hết hạn', voucherCode: runId+'3', pointsUsed: 100, expiresAt: new Date(now-1000) },
    { userId: other._id, voucherName: 'Quà của người khác', voucherCode: runId+'4', pointsUsed: 8000 },
  ]);
  await Classification.create([
    { userId: owner._id, predictedClass: 'plastic', predictedClassVi: 'Nhựa', pointsEarned: 10, pointsAwarded: true },
    { userId: owner._id, predictedClass: 'paper', pointsEarned: 0, reviewStatus: 'pending' },
    { userId: other._id, predictedClass: 'glass', predictedClassVi: 'PRIVATE', pointsEarned: 100 },
  ]);
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (mongoose.connection.readyState === 1) {
    const users = await User.find({ _id: { $in: owners } });
    for (const user of users) {
      if (user.avatarUrl) await fs.unlink(path.resolve(env.UPLOAD_DIR, 'avatars', path.basename(user.avatarUrl))).catch(() => {});
    }
    await Promise.all([User.deleteMany({ _id: { $in: owners } }), Classification.deleteMany({ userId: { $in: owners } }), VoucherWallet.deleteMany({ userId: { $in: owners } })]);
  }
  const client = await redis.getRedis();
  const keys = await client.keys(`${env.REDIS_PREFIX}*`);
  if (keys.length) await client.del(keys);
  await mongoose.disconnect(); await redis.closeRedis();
});

test('all profile endpoints require a genuine session before reading or uploading', async () => {
  for (const [route, method, body] of [
    ['', 'GET'], ['', 'PATCH', { name: 'bad' }], ['/points/history', 'GET'],
    ['/avatar', 'POST', imageBody()], ['/avatar', 'DELETE'],
  ]) assert.equal((await request(route, { method, body, auth: null })).status, 401);
});
test('profile shows lifetime, spent and available points; used and expired gifts stay spent', async () => {
  const result = await request(''); assert.equal(result.status, 200);
  assert.equal(result.data.totalPoints, 1250); assert.equal(result.data.spentPoints, 450); assert.equal(result.data.availablePoints, 800);
  for (const field of ['password', 'googleId', 'authVersion']) assert.equal(result.data[field], undefined);
  assert.equal(result.data.avatarUrl, '');
});
test('legacy accounts without profile fields get zero balances without data migration', async () => {
  const id = new mongoose.Types.ObjectId(); owners.push(id);
  await User.collection.insertOne({ _id: id, name: 'Legacy', email: `legacy-${runId}@example.test`, password: 'legacy-hash' });
  const legacy = await User.findById(id);
  const auth = (await session.create(legacy)).token;
  const result = await request('', { auth });
  assert.equal(result.status, 200); assert.equal(result.data.availablePoints, 0); assert.equal(result.data.spentPoints, 0); assert.equal(result.data.totalPoints, 0);
});
test('history merges earned and redeemed entries without leaking another user or unearned pending points', async () => {
  const result = await request('/points/history'); assert.equal(result.status, 200);
  assert.equal(result.data.pagination.totalCount, 4);
  assert.deepEqual(result.data.items.map(x => x.points).sort((a,b)=>a-b), [-200,-150,-100,10]);
  assert.ok(result.data.items.every(x => !['PRIVATE', 'Quà của người khác'].includes(x.title)));
  const earned = await request('/points/history?type=earned'); assert.equal(earned.data.items.length, 1); assert.equal(earned.data.items[0].points, 10);
  const redeemed = await request('/points/history?type=redeemed'); assert.equal(redeemed.data.items.length, 3);
});
test('history pagination is stable, filters preserve counts, and invalid inputs are rejected', async () => {
  const a = await request('/points/history?limit=2&page=1'); const b = await request('/points/history?limit=2&page=2');
  assert.equal(a.data.pagination.hasNextPage, true); assert.equal(b.data.pagination.hasNextPage, false);
  assert.equal(new Set([...a.data.items, ...b.data.items].map(x=>x.id)).size, 4);
  for (const query of ['page=-1','limit=101','page=1x','page=0','type=other','type[$ne]=x','page=1&page=2']) {
    assert.equal((await request('/points/history?'+query)).status, 400, query);
  }
  const empty = await request('/points/history?page=99'); assert.deepEqual(empty.data.items, []);
});
test('profile edits persist and normalize phone/email while protected balance and role cannot be assigned', async () => {
  const result = await request('', { method:'PATCH', body: { name:'  Nguyễn Văn X  ', email:`EDIT-${runId}@EXAMPLE.TEST`, phone:'090 123 4567', totalPoints:999999, availablePoints:999999, spentPoints:0, role:'admin', avatarUrl:'https://invalid.test/x.svg' } });
  assert.equal(result.status, 200); assert.equal(result.data.name,'Nguyễn Văn X'); assert.equal(result.data.phone,'+84901234567');
  assert.equal(result.data.email,`edit-${runId}@example.test`); assert.equal(result.data.emailVerified,false);
  assert.equal(result.data.role,'user'); assert.equal(result.data.totalPoints,1250); assert.equal(result.data.availablePoints,800); assert.equal(result.data.avatarUrl,'');
  assert.equal((await request('')).data.name,'Nguyễn Văn X');
});
test('invalid profile input and duplicate email return errors without changing stored profile', async () => {
  for (const body of [{ name:' ' },{ name:'x'.repeat(101) },{ name:{$ne:null} },{ email:'bad' },{ phone:'0123456789' },{ phone:12 },{ totalPoints:500 }]) {
    assert.equal((await request('',{ method:'PATCH',body })).status,400);
  }
  assert.equal((await request('',{method:'PATCH',body:{email:other.email}})).status,409);
  assert.equal((await request('')).data.name,'Nguyễn Văn X');
  assert.equal((await request('',{method:'PATCH',body:{phone:''}})).data.phone,'');
});
test('avatar saves real bytes, survives profile reload, ignores unsafe filename and does not change points', async () => {
  const result = await request('/avatar',{method:'POST',body:imageBody(png,'image/png','../../photo.svg')});
  assert.equal(result.status,200); assert.match(result.data.avatarUrl,/^\/uploads\/avatars\/[a-f0-9-]+\.png$/);
  const response = await fetch(base+result.data.avatarUrl); assert.equal(response.status,200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
  assert.equal((await request('')).data.avatarUrl,result.data.avatarUrl); assert.equal(result.data.availablePoints,800);
});
test('invalid content, SVG, missing upload, and oversized files are rejected; prior avatar remains', async () => {
  const previous = (await request('')).data.avatarUrl;
  assert.equal((await request('/avatar',{method:'POST',body:imageBody(Buffer.from('<script>alert(1)</script>'))})).status,400);
  assert.equal((await request('/avatar',{method:'POST',body:imageBody(Buffer.from('<svg></svg>'),'image/svg+xml','x.svg')})).status,400);
  assert.equal((await request('/avatar',{method:'POST',body:new FormData()})).status,400);
  assert.equal((await request('/avatar',{method:'POST',body:imageBody(Buffer.alloc(env.MAX_FILE_SIZE+1))})).status,413);
  assert.equal((await request('')).data.avatarUrl,previous);
});
test('replacing and removing an avatar cleans up only its old uploaded file', async () => {
  const old = (await request('')).data.avatarUrl;
  const updated = await request('/avatar',{method:'POST',body:imageBody()}); assert.equal(updated.status,200); assert.notEqual(updated.data.avatarUrl,old);
  assert.equal((await fetch(base+old)).status,404);
  assert.equal((await request('/avatar',{method:'DELETE'})).data.avatarUrl,'');
  assert.equal((await fetch(base+updated.data.avatarUrl)).status,404);
});
test('new classification rewards appear on the next profile read without resetting existing points', async () => {
  await userService.recordClassificationActivity(owner._id,3,10);
  const result = await request(''); assert.equal(result.data.totalPoints,1260); assert.equal(result.data.availablePoints,810); assert.equal(result.data.spentPoints,450);
});
test('each account gets its own balance; historical overspend never displays a negative available balance', async () => {
  const otherToken = (await session.create(other)).token;
  const result = await request('',{auth:otherToken}); assert.equal(result.data.totalPoints,9000); assert.equal(result.data.availablePoints,1000);
  await User.updateOne({_id:other._id},{$set:{totalPoints:10}});
  assert.equal((await request('',{auth:otherToken})).data.availablePoints,0);
});
