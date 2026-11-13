// Redis + MongoDB + actual SMTP transport; no provider credential or email sent outside localhost.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'session-otp-tests-only';
process.env.OTP_SECRET = 'otp-test-hmac-only';
process.env.REDIS_PREFIX = `test:session-otp:${process.pid}:`;
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.SMTP_SECURE = 'false';
process.env.SMTP_FROM = 'EcoSort Test <no-reply@example.test>';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { SMTPServer } = require('smtp-server');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
let app, server, secondServer, base, secondBase, smtp, redis, User, sessions, env;
const inbox = [];
const ids = [];
let counter = 10000000 + crypto.randomInt(70000000);
const password = 'FirstPassword123!';
async function req(path, body, token, origin = base) {
  const r = await fetch(origin + '/api' + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: r.status, body: await r.json(), headers: r.headers };
}
async function register() {
  const data = { name: 'Redis Test', email: `redis-${process.pid}-${counter}@example.test`, phone: `09${counter++}`, password };
  const r = await req('/auth/register', data);
  assert.equal(r.status, 202, JSON.stringify(r.body));
  assert.equal(await User.countDocuments({ email: data.email }), 0);
  assert.equal(r.body.data.token, undefined);
  const verified = await req('/auth/register/verify', { registrationId: r.body.data.registrationId, otp: codeFor(data.email, '') });
  assert.equal(verified.status, 201, JSON.stringify(verified.body));
  ids.push(verified.body.data.user.id);
  return { ...data, ...verified.body.data };
}
async function login(u, pass = password) {
  const r = await req('/auth/login', { email: u.email, password: pass });
  assert.equal(r.status, 202, JSON.stringify(r.body));
  assert.equal(r.body.data.token, undefined);
  const result = await req('/auth/login/verify', { loginChallengeId: r.body.data.loginChallengeId, otp: codeFor(u.email, '') });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  await redis.del(`${env.REDIS_PREFIX}login-otp-cooldown:${result.body.data.user.id}`);
  return result.body.data;
}

function codeFor(email, purpose) {
  const msg = inbox.findLast(m => m.to === email && m.raw.includes(purpose));
  assert.ok(msg, `SMTP message missing for ${purpose}`);
  // Nodemailer quoted-printable encodes Vietnamese but leaves the ASCII OTP intact.
  const code = /\b\d{6}\b/.exec(msg.raw);
  assert.ok(code);
  return code[0];
}
const otpKey = (purpose, email) => `${env.REDIS_PREFIX}otp:${purpose}:${crypto.createHash('sha256').update(email).digest('hex')}`;
before(async () => {
  smtp = new SMTPServer({ disabledCommands: ['AUTH', 'STARTTLS'], logger: false,
    onData(stream, session, callback) {
      let raw = ''; stream.on('data', b => { raw += b; });
      stream.on('end', () => { inbox.push({ to: session.envelope.rcptTo[0].address, raw }); callback(); });
    },
  });
  await new Promise(resolve => smtp.listen(0, '127.0.0.1', resolve));
  process.env.SMTP_PORT = String(smtp.server.address().port);
  app = require('../../src/app');
  env = require('../../src/config/env');
  User = require('../../src/modules/users/user.model');
  sessions = require('../../src/modules/auth/auth.session');
  redis = await require('../../src/config/redis').getRedis();
  await mongoose.connect(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/scanwaste_session_test');
  await User.init();
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  secondServer = app.listen(0, '127.0.0.1'); await once(secondServer, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
  secondBase = `http://127.0.0.1:${secondServer.address().port}`;
});
after(async () => {
  for (const s of [server, secondServer]) if (s) await new Promise(resolve => s.close(resolve));
  if (smtp) await new Promise(resolve => smtp.close(resolve));
  if (User) await User.deleteMany({ _id: { $in: ids } });
  await mongoose.disconnect();
  if (redis) {
    for await (const keys of redis.scanIterator({ MATCH: `${env.REDIS_PREFIX}*`, COUNT: 100 })) if (keys.length) await redis.del(keys);
  }
  await require('../../src/config/redis').closeRedis();
});
beforeEach(async () => {
  for await (const keys of redis.scanIterator({ MATCH: `${env.REDIS_PREFIX}rate:*`, COUNT: 100 })) if (keys.length) await redis.del(keys);
});
test('register persists only hashed refresh/OTP, TTLs, and delivers SMTP without exposing OTP in API', async () => {
  const u = await register();
  assert.equal(u.user.emailVerified, true);
  const claims = jwt.verify(u.token, process.env.JWT_SECRET);
  assert.equal(claims.type, 'access'); assert.ok(claims.sid && claims.jti);
  assert.equal(claims.exp - claims.iat, 900);
  const raw = await redis.get(`${env.REDIS_PREFIX}session:${claims.sid}`);
  assert.ok(!raw.includes(u.refreshToken));
  assert.ok(await redis.ttl(`${env.REDIS_PREFIX}session:${claims.sid}`) > 0);
  const otp = codeFor(u.email, '');
  assert.equal(otp.length, 6);
  assert.ok(!JSON.stringify(u).includes(otp));
});
// Remaining cases independently register users so a failure cannot invalidate unrelated tests.
test('refresh rotates once, rejects forged token without revoking session, replay revokes family', async () => {
  const u = await register();
  const forged = u.refreshToken.slice(0, 33) + '0'.repeat(64);
  assert.equal((await req('/auth/refresh', { refreshToken: forged })).status, 401);
  const r = await req('/auth/refresh', { refreshToken: u.refreshToken });
  assert.equal(r.status, 200); assert.notEqual(r.body.data.refreshToken, u.refreshToken);
  assert.equal((await req('/users/me', undefined, r.body.data.token)).status, 200);
  const replay = await req('/auth/refresh', { refreshToken: u.refreshToken });
  assert.equal(replay.body.code, 'REFRESH_TOKEN_REUSED');
  assert.equal((await req('/users/me', undefined, r.body.data.token)).status, 401);
  assert.equal((await req('/auth/refresh', { refreshToken: r.body.data.refreshToken })).status, 401);
});
test('concurrent refresh cannot issue two usable successor sessions', async () => {
  const u = await register();
  const results = await Promise.all([req('/auth/refresh', { refreshToken: u.refreshToken }), req('/auth/refresh', { refreshToken: u.refreshToken })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 401]);
  const winner = results.find(r => r.status === 200).body.data;
  assert.equal((await req('/users/me', undefined, winner.token)).status, 401);
});
test('logout immediately invalidates access and refresh, leaves another device active, blacklist has TTL', async () => {
  const u = await register(); const device = await login(u);
  assert.equal((await req('/auth/logout', {}, u.token)).status, 200);
  const claims = jwt.decode(u.token);
  assert.ok(await redis.ttl(`${env.REDIS_PREFIX}blacklist:${claims.jti}`) > 0);
  assert.equal((await req('/users/me', undefined, u.token)).status, 401);
  assert.equal((await req('/auth/refresh', { refreshToken: u.refreshToken })).status, 401);
  assert.equal((await req('/users/me', undefined, device.token)).status, 200);
});
test('logout-all invalidates every previous device; new login works', async () => {
  const u = await register(); const device = await login(u);
  assert.equal((await req('/auth/logout-all', {}, u.token)).status, 200);
  assert.equal((await req('/users/me', undefined, device.token)).status, 401);
  assert.equal((await req('/auth/refresh', { refreshToken: device.refreshToken })).status, 401);
  const fresh = await login(u);
  assert.equal((await req('/users/me', undefined, fresh.token)).status, 200);
});
async function legacyUnverified() {
  const u = await register();
  await User.updateOne({ _id: u.user.id }, { emailVerified: false });
  assert.equal((await req('/auth/email/send-otp', {}, u.token)).status, 200);
  return u;
}
test('email OTP validates once, expires, is purpose-bound, and five wrong attempts exhaust the code', async () => {
  const u = await legacyUnverified();
  const code = codeFor(u.email, '');
  const key = otpKey('verify-email', u.email);
  const raw = await redis.get(key);
  assert.ok(!raw.includes(code)); assert.ok(await redis.ttl(key) > 0);
  assert.ok(!JSON.stringify(u).includes(code));
  assert.equal((await req('/auth/email/send-otp', {}, u.token)).status, 429);
  assert.equal((await req('/auth/password/reset', { email: u.email, otp: code, password: 'NewPassword123!' })).status, 400);
  assert.equal((await req('/auth/email/verify', { otp: code }, u.token)).status, 200);
  assert.equal((await User.findById(u.user.id)).emailVerified, true);
  assert.equal((await req('/auth/email/verify', { otp: code }, u.token)).status, 400);
  const v = await legacyUnverified(); const codeV = codeFor(v.email, '');
  const wrong = codeV === '111111' ? '222222' : '111111';
  for (let i = 0; i < 5; i++) assert.equal((await req('/auth/email/verify', { otp: wrong }, v.token)).status, 400);
  assert.equal((await req('/auth/email/verify', { otp: codeV }, v.token)).status, 400);
  const w = await legacyUnverified(); const codeW = codeFor(w.email, '');
  await redis.pExpire(otpKey('verify-email', w.email), 1);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await req('/auth/email/verify', { otp: codeW }, w.token)).status, 400);
});
test('password reset sends generic response, changes bcrypt password, revokes sessions, blocks OTP replay', async () => {
  const u = await register(); const device = await login(u);
  const known = await req('/auth/password/forgot', { email: u.email });
  const unknown = await req('/auth/password/forgot', { email: 'missing@example.test' });
  assert.equal(known.status, 202); assert.deepEqual(known.body, unknown.body);
  const otp = codeFor(u.email, ''); const next = 'NewPassword123!';
  const reset = await req('/auth/password/reset', { email: u.email, otp, password: next, confirmPassword: next });
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  assert.equal((await req('/users/me', undefined, device.token)).status, 401);
  assert.equal((await req('/auth/refresh', { refreshToken: u.refreshToken })).status, 401);
  assert.equal((await req('/auth/login', { email: u.email, password })).status, 401);
  const fresh = await login(u, next); assert.equal((await req('/users/me', undefined, fresh.token)).status, 200);
  assert.equal((await req('/auth/password/reset', { email: u.email, otp, password: next })).status, 400);
  const stored = await User.findById(u.user.id).select('+password');
  assert.notEqual(stored.password, next);
});
test('expired session and legacy stateless access token cannot access protected APIs', async () => {
  const u = await register();
  const legacy = jwt.sign({ sub: u.user.id }, process.env.JWT_SECRET);
  assert.equal((await req('/users/me', undefined, legacy)).status, 401);
  await redis.pExpire(`${env.REDIS_PREFIX}session:${jwt.decode(u.token).sid}`, 1);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await req('/users/me', undefined, u.token)).status, 401);
});
test('resending invalidates previous OTP; parallel verification succeeds only once', async () => {
  const u = await legacyUnverified(); const old = codeFor(u.email, '');
  await redis.del(otpKey('verify-email', u.email) + ':cooldown');
  assert.equal((await req('/auth/email/send-otp', {}, u.token)).status, 200);
  const current = codeFor(u.email, '');
  if (old !== current) assert.equal((await req('/auth/email/verify', { otp: old }, u.token)).status, 400);
  const results = await Promise.all([req('/auth/email/verify', { otp: current }, u.token), req('/auth/email/verify', { otp: current }, u.token)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
});
test('SMTP failure removes undelivered OTP and never reports it as sent', async () => {
  const u = await legacyUnverified();
  const key = otpKey('verify-email', u.email);
  await redis.del(key + ':cooldown');
  const original = env.SMTP_PORT;
  try {
    env.SMTP_PORT = 1;
    const r = await req('/auth/email/send-otp', {}, u.token);
    assert.equal(r.status, 503);
    assert.equal(await redis.get(key), null);
  } finally { env.SMTP_PORT = original; }
});
test('failed-login limit is shared across two HTTP servers through Redis', async () => {
  let last;
  for (let i = 0; i < 25; i++) {
    last = await req('/auth/login', {}, null, i % 2 ? secondBase : base);
    if (last.status === 429) break;
  }
  assert.equal(last.status, 429); assert.ok(last.headers.get('retry-after'));
  assert.equal((await req('/auth/login', {}, null, secondBase)).status, 429);
});
test('Redis unavailable fails closed with 503 rather than using in-memory authentication', () => {
  const child = spawnSync(process.execPath, ['-e', `require('./src/modules/auth/auth.session').refresh('${'a'.repeat(32)}.${'b'.repeat(64)}').then(()=>process.exit(2)).catch(e=>{process.exit(e.statusCode===503?0:3)})`],
    { cwd: process.cwd(), env: { ...process.env, REDIS_URL: 'redis://127.0.0.1:1' }, timeout: 10000 });
  assert.equal(child.status, 0, String(child.stderr));
});

test('HTTP rate limiter also fails closed with 503 when Redis cannot be reached', () => {
  const child = spawnSync(process.execPath, ['-e', `
    const app = require('./src/app');
    const s = app.listen(0, '127.0.0.1', async () => {
      try {
        const r = await fetch('http://127.0.0.1:'+s.address().port+'/api/users/me');
        process.exit(r.status===503 ? 0 : 4);
      } catch { process.exit(5); }
    });
  `], { cwd: process.cwd(), env: { ...process.env, REDIS_URL: 'redis://127.0.0.1:1' }, timeout: 10000 });
  assert.equal(child.status, 0, String(child.stderr));
});
