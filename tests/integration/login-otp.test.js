process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'login-otp-test-secret';
process.env.OTP_SECRET = 'login-otp-test-hmac';
process.env.REDIS_PREFIX = `test:login-otp:${process.pid}:`;
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.SMTP_SECURE = 'false';
process.env.SMTP_FROM = 'EcoSort Test <test@example.test>';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { SMTPServer } = require('smtp-server');
let server, smtp, redis, User, env, base;
const inbox = [], ids = [];
let phone = crypto.randomInt(10000000, 80000000);
const password = 'LoginOtpPassword123!';
async function fixture() {
  // Explicit fixture: existing account. Registration has its own SMTP integration suite.
  const user = await User.create({ name: 'Login OTP Test', email: `login-otp-${process.pid}-${phone}@example.test`, phone: `+849${phone++}`, password: await bcrypt.hash(password, 12), emailVerified: true });
  ids.push(user._id); return user;
}
const code = email => /\b\d{6}\b/.exec(inbox.findLast(m => m.email === email)?.raw || '')?.[0];
async function request(route, body) {
  const res = await fetch(`${base}/api/auth${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}
const pendingKey = id => `${env.REDIS_PREFIX}login-otp:${id}`;
const cooldownKey = user => `${env.REDIS_PREFIX}login-otp-cooldown:${user._id}`;
async function pending(user, identifier = user.email) {
  const r = await request('/login', { identifier, password });
  assert.equal(r.status, 202, JSON.stringify(r.body));
  assert.equal(r.body.data.token, undefined); assert.equal(r.body.data.refreshToken, undefined);
  return r.body.data;
}
async function sessionsFor(user) {
  let count = 0;
  for await (const keys of redis.scanIterator({ MATCH: `${env.REDIS_PREFIX}session:*` })) for (const k of keys) {
    if (JSON.parse(await redis.get(k)).userId === String(user._id)) count++;
  }
  return count;
}
before(async () => {
  smtp = new SMTPServer({ disabledCommands: ['AUTH', 'STARTTLS'], logger: false,
    onData(stream, session, done) { let raw = ''; stream.on('data', c => raw += c); stream.on('end', () => { inbox.push({ email: session.envelope.rcptTo[0].address, raw }); done(); }); } });
  await new Promise(resolve => smtp.listen(0, '127.0.0.1', resolve));
  process.env.SMTP_PORT = String(smtp.server.address().port);
  const app = require('../../src/app'); env = require('../../src/config/env'); User = require('../../src/modules/users/user.model');
  await mongoose.connect(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/scanwaste_login_otp_test', { serverSelectionTimeoutMS: 5000 });
  await User.init(); redis = await require('../../src/config/redis').getRedis();
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  for await (const keys of redis.scanIterator({ MATCH: `${env.REDIS_PREFIX}rate:*` })) if (keys.length) await redis.del(keys);
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve)); if (smtp) await new Promise(resolve => smtp.close(resolve));
  if (mongoose.connection.readyState === 1) await User.deleteMany({ _id: { $in: ids } }); await mongoose.disconnect();
  if (redis) for await (const keys of redis.scanIterator({ MATCH: `${env.REDIS_PREFIX}*` })) if (keys.length) await redis.del(keys);
  await require('../../src/config/redis').closeRedis();
});
test('password success sends SMTP OTP without session; OTP is hashed/TTL-bound; correct OTP alone issues tokens', async () => {
  const user = await fixture(), d = await pending(user), otp = code(user.email);
  assert.equal(d.status, 'pending_otp'); assert.equal(await sessionsFor(user), 0);
  const raw = await redis.get(pendingKey(d.loginChallengeId)); assert.ok(raw && !raw.includes(otp) && !raw.includes(password));
  assert.ok(await redis.ttl(pendingKey(d.loginChallengeId)) > 0);
  const protectedResponse = await fetch(base+'/api/users/me', { headers: { Authorization: `Bearer ${d.loginChallengeId}` } });
  assert.equal(protectedResponse.status, 401);
  const wrong = otp === '111111' ? '222222' : '111111';
  assert.equal((await request('/login/verify', { loginChallengeId: d.loginChallengeId, otp: wrong })).status, 400);
  assert.equal(await sessionsFor(user), 0);
  const success = await request('/login/verify', { loginChallengeId: d.loginChallengeId, otp });
  assert.equal(success.status, 200); assert.ok(success.body.data.token && success.body.data.refreshToken);
  assert.equal((await fetch(base+'/api/users/me', { headers: { Authorization: `Bearer ${success.body.data.token}` } })).status, 200);
  assert.equal(await sessionsFor(user), 1); assert.equal(await redis.get(pendingKey(d.loginChallengeId)), null);
  assert.equal((await request('/login/verify', { loginChallengeId: d.loginChallengeId, otp })).status, 400);
});
test('phone login sends OTP to stored email; wrong password sends no email', async () => {
  const user = await fixture(), before = inbox.length;
  assert.equal((await request('/login', { phone: user.phone, password: 'wrong-password' })).status, 401);
  assert.equal(inbox.length, before);
  const d = await pending(user, user.phone); assert.equal(d.email, user.email); assert.ok(code(user.email)); assert.equal(await sessionsFor(user), 0);
});
test('OTP fails after five wrong attempts or expiry, and cannot cross login/reset/registration purposes', async () => {
  const user = await fixture(), d = await pending(user), otp = code(user.email);
  const wrong = otp === '111111' ? '222222' : '111111';
  assert.equal((await request('/register/verify', { registrationId: d.loginChallengeId, otp })).status, 400);
  assert.equal((await request('/password/reset', { email: user.email, otp, password: 'DifferentPassword123!' })).status, 400);
  for (let i = 0; i < 5; i++) assert.equal((await request('/login/verify', { loginChallengeId: d.loginChallengeId, otp: wrong })).status, 400);
  assert.equal((await request('/login/verify', { loginChallengeId: d.loginChallengeId, otp })).status, 400);
  await redis.del(cooldownKey(user)); const fresh = await pending(user);
  await redis.pExpire(pendingKey(fresh.loginChallengeId), 1); await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await request('/login/verify', { loginChallengeId: fresh.loginChallengeId, otp: code(user.email) })).status, 400);
  assert.equal(await sessionsFor(user), 0);
});
test('resend cooldown, invalidated old OTP and concurrent confirmation create only one session', async () => {
  const user = await fixture(), d = await pending(user), old = code(user.email);
  assert.equal((await request('/login/resend', { loginChallengeId: d.loginChallengeId })).status, 429);
  assert.equal((await request('/login', { email: user.email, password })).status, 429);
  await redis.del(cooldownKey(user)); assert.equal((await request('/login/resend', { loginChallengeId: d.loginChallengeId })).status, 200);
  const otp = code(user.email);
  if (old !== otp) assert.equal((await request('/login/verify', { loginChallengeId: d.loginChallengeId, otp: old })).status, 400);
  const payload = { loginChallengeId: d.loginChallengeId, otp };
  const results = await Promise.all([request('/login/verify', payload), request('/login/verify', payload)]);
  assert.deepEqual(results.map(r=>r.status).sort(), [200,400]); assert.equal(await sessionsFor(user), 1);
});
test('logout-all/auth version change invalidates pending login OTP', async () => {
  const user = await fixture(), d = await pending(user), otp = code(user.email);
  await require('../../src/modules/auth/auth.session').revokeAll(user._id);
  assert.equal((await request('/login/verify', { loginChallengeId: d.loginChallengeId, otp })).status, 400);
  assert.equal(await sessionsFor(user), 0);
});
test('SMTP failure or missing configuration never issues a session', async () => {
  const user = await fixture(), port = env.SMTP_PORT, host = env.SMTP_HOST;
  env.SMTP_PORT = 1;
  try { assert.equal((await request('/login', { email: user.email, password })).status, 503); }
  finally { env.SMTP_PORT = port; }
  assert.equal(await sessionsFor(user), 0);
  env.SMTP_HOST = '';
  try { assert.equal((await request('/login', { email: user.email, password })).status, 503); }
  finally { env.SMTP_HOST = host; }
  assert.equal(await sessionsFor(user), 0);
  for await (const keys of redis.scanIterator({ MATCH: `${env.REDIS_PREFIX}login-otp:*` })) for (const k of keys) assert.notEqual(JSON.parse(await redis.get(k)).userId, String(user._id));
});
