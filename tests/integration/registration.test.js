process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'registration-test-secret';
process.env.OTP_SECRET = 'registration-test-otp';
process.env.REDIS_PREFIX = `test:registration:${process.pid}:`;
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.SMTP_SECURE = 'false';
process.env.SMTP_FROM = 'EcoSort Test <test@example.test>';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { SMTPServer } = require('smtp-server');
let server, smtp, redis, User, env, base;
const inbox = [], emails = [];
let phone = crypto.randomInt(10000000, 80000000);
const draft = () => {
  const email = `registration-${process.pid}-${phone}@example.test`; emails.push(email);
  return { name: 'Registration Test', email, phone: `09${phone++}`, password: 'Password123!', confirmPassword: 'Password123!', role: 'admin' };
};
const code = email => /\b\d{6}\b/.exec(inbox.findLast(m => m.email === email)?.raw || '')?.[0];
async function request(route, body) {
  const res = await fetch(`${base}/api/auth${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}
const pendingKey = id => `${env.REDIS_PREFIX}registration:${id}`;
const cooldownKey = email => `${env.REDIS_PREFIX}registration-cooldown:${crypto.createHash('sha256').update(email).digest('hex')}`;
async function pending() {
  const input = draft();
  const result = await request('/register', input);
  assert.equal(result.status, 202, JSON.stringify(result.body));
  return { input, data: result.body.data };
}
before(async () => {
  smtp = new SMTPServer({ disabledCommands: ['AUTH', 'STARTTLS'], logger: false,
    onData(stream, session, done) {
      let raw = ''; stream.on('data', chunk => raw += chunk);
      stream.on('end', () => { inbox.push({ email: session.envelope.rcptTo[0].address, raw }); done(); });
    } });
  await new Promise(resolve => smtp.listen(0, '127.0.0.1', resolve));
  process.env.SMTP_PORT = String(smtp.server.address().port);
  const app = require('../../src/app'); env = require('../../src/config/env');
  User = require('../../src/modules/users/user.model');
  await mongoose.connect(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/scanwaste_registration_test', { serverSelectionTimeoutMS: 5000 });
  await User.init(); redis = await require('../../src/config/redis').getRedis();
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (smtp) await new Promise(resolve => smtp.close(resolve));
  if (mongoose.connection.readyState === 1) await User.deleteMany({ email: { $in: emails } });
  await mongoose.disconnect();
  if (redis) for await (const keys of redis.scanIterator({ MATCH: `${env.REDIS_PREFIX}*`, COUNT: 100 })) if (keys.length) await redis.del(keys);
  await require('../../src/config/redis').closeRedis();
});
test('registration sends SMTP OTP but creates no Mongo user or login session until valid OTP', async () => {
  const { input, data } = await pending();
  assert.equal(await User.countDocuments({ email: input.email }), 0);
  assert.equal(data.token, undefined); assert.equal(data.refreshToken, undefined); assert.equal(data.user, undefined);
  const raw = await redis.get(pendingKey(data.registrationId));
  assert.ok(await redis.ttl(pendingKey(data.registrationId)) > 0);
  assert.ok(!raw.includes(input.password)); assert.ok(!raw.includes(code(input.email)));
  assert.ok(await bcrypt.compare(input.password, JSON.parse(raw).passwordHash));
  assert.equal((await request('/login', { email: input.email, password: input.password })).status, 401);
  const wrong = code(input.email) === '111111' ? '222222' : '111111';
  assert.equal((await request('/register/verify', { registrationId: data.registrationId, otp: wrong })).status, 400);
  assert.equal(await User.countDocuments({ email: input.email }), 0);
  const ok = await request('/register/verify', { registrationId: data.registrationId, otp: code(input.email), role: 'admin' });
  assert.equal(ok.status, 201); assert.ok(ok.body.data.token && ok.body.data.refreshToken);
  assert.equal(ok.body.data.user.role, 'user'); assert.equal(ok.body.data.user.emailVerified, true);
  assert.equal(await User.countDocuments({ email: input.email }), 1);
  assert.equal(await redis.get(pendingKey(data.registrationId)), null);
  assert.equal((await request('/login', { email: input.email, password: input.password })).status, 202);
  assert.equal((await request('/register/verify', { registrationId: data.registrationId, otp: code(input.email) })).status, 400);
});
test('five wrong attempts invalidate pending registration and create no account', async () => {
  const { input, data } = await pending(); const correct = code(input.email);
  const wrong = correct === '111111' ? '222222' : '111111';
  for (let i = 0; i < 5; i++) assert.equal((await request('/register/verify', { registrationId: data.registrationId, otp: wrong })).status, 400);
  assert.equal((await request('/register/verify', { registrationId: data.registrationId, otp: correct })).status, 400);
  assert.equal(await User.countDocuments({ email: input.email }), 0);
});
test('expired registration cannot be verified or resent', async () => {
  const { input, data } = await pending();
  await redis.pExpire(pendingKey(data.registrationId), 1); await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await request('/register/verify', { registrationId: data.registrationId, otp: code(input.email) })).status, 400);
  assert.equal((await request('/register/resend', { registrationId: data.registrationId })).status, 400);
  assert.equal(await User.countDocuments({ email: input.email }), 0);
});
test('resend throttles email, invalidates old code, keeps submitted fields, and confirms only once concurrently', async () => {
  const { input, data } = await pending(); const old = code(input.email);
  assert.equal((await request('/register/resend', { registrationId: data.registrationId })).status, 429);
  await redis.del(cooldownKey(input.email));
  assert.equal((await request('/register/resend', { registrationId: data.registrationId })).status, 200);
  const current = code(input.email);
  if (old !== current) assert.equal((await request('/register/verify', { registrationId: data.registrationId, otp: old })).status, 400);
  const payload = { registrationId: data.registrationId, otp: current, email: 'injected@example.test', password: 'injected' };
  const results = await Promise.all([request('/register/verify', payload), request('/register/verify', payload)]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 400]);
  assert.equal(await User.countDocuments({ email: input.email }), 1);
  assert.ok(await bcrypt.compare(input.password, (await User.findOne({ email: input.email }).select('+password')).password));
});
test('SMTP failure does not create user or leave a usable pending registration', async () => {
  const input = draft(), savedPort = env.SMTP_PORT;
  env.SMTP_PORT = 1;
  try { assert.equal((await request('/register', input)).status, 503); }
  finally { env.SMTP_PORT = savedPort; }
  assert.equal(await User.countDocuments({ email: input.email }), 0);
  for await (const keys of redis.scanIterator({ MATCH: `${env.REDIS_PREFIX}registration:*` })) {
    for (const k of keys) assert.notEqual(JSON.parse(await redis.get(k)).email, input.email);
  }
});
test('missing SMTP configuration does not create pending registration or user', async () => {
  const input = draft(), host = env.SMTP_HOST; env.SMTP_HOST = '';
  try { assert.equal((await request('/register', input)).body.code, 'EMAIL_NOT_CONFIGURED'); }
  finally { env.SMTP_HOST = host; }
  assert.equal(await User.countDocuments({ email: input.email }), 0);
});
