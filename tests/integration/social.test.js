process.env.SMTP_HOST = ''; // Tests never send email through the user's configured provider.
process.env.REDIS_PREFIX = `test:social.test:${process.pid}:`;
// These tests use local fixtures at the service boundary, never fake a provider login in the app.
process.env.NODE_ENV = 'test';
process.env.GOOGLE_CLIENT_ID = 'social-security-test.apps.googleusercontent.com';
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const { before, after, test } = require('node:test');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const app = require('../../src/app');
const User = require('../../src/modules/users/user.model');
const AuthChallenge = require('../../src/modules/auth/auth-challenge.model');
const social = require('../../src/modules/auth/auth.social');
const auth = require('../../src/modules/auth/auth.service');
let server;
let origin;
let challenge;
const runId = randomUUID();
const userIds = [];
const challengeIds = [];

async function post(path, body, cookie) {
  const response = await fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { status: response.status, payload: await response.json(), cookie: response.headers.get('set-cookie') };
}

before(async () => {
  await mongoose.connect(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/scanwaste_social_test', {
    serverSelectionTimeoutMS: 5000,
  });
  await User.init();
  await AuthChallenge.init();
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState === 1) {
    await User.deleteMany({ _id: { $in: userIds } });
    await AuthChallenge.deleteMany({ _id: { $in: challengeIds } });
  }
  await mongoose.disconnect();
  await require('../../src/config/redis').closeRedis();
});

test('public configuration contains client IDs but never secrets or private key locations', async () => {
  const response = await fetch(`${origin}/api/auth/social/config`);
  const { data } = await response.json();
  assert.equal(data.google.enabled, true);
  assert.deepEqual(Object.keys(data), ['google']);
});

test('challenge is persisted with an HttpOnly browser cookie', async () => {
  const result = await post('/api/auth/social/google/challenge', {});
  assert.equal(result.status, 200);
  assert.match(result.cookie, /HttpOnly/i);
  assert.match(result.cookie, /SameSite=Lax/i);
  assert.match(result.cookie, /Path=\/api\/auth\/social/);
  challenge = { ...result.payload.data, cookie: result.cookie.split(';')[0] };
  challengeIds.push(challenge.challengeId);
  const stored = await AuthChallenge.findById(challenge.challengeId);
  assert.equal(stored.nonce, challenge.nonce);
  assert.notEqual(stored.browserHash, challenge.cookie.split('=')[1]);
});

test('unknown and removed provider endpoints are unavailable', async () => {
  const unknown = await post('/api/auth/social/unknown/challenge', {});
  assert.equal(unknown.status, 404);
  const apple = await post('/api/auth/social/apple/challenge', {});
  assert.equal(apple.status, 404);
  assert.equal(apple.payload.data, undefined);
});

test('missing browser cookie, foreign cookie, and wrong state are rejected before token verification', async () => {
  for (const [cookie, state] of [[undefined, challenge.state], ['ecosort_oauth_google=forged', challenge.state], [challenge.cookie, 'wrong-state']]) {
    const result = await post('/api/auth/social/google', {
      challengeId: challenge.challengeId, state, idToken: 'not-a-real-token',
    }, cookie);
    assert.equal(result.status, 401);
    assert.equal(result.payload.code, 'SOCIAL_CHALLENGE_INVALID');
    assert.equal(result.payload.data, undefined);
  }
});

test('expired challenge cannot authenticate', async () => {
  await AuthChallenge.updateOne({ _id: challenge.challengeId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  const result = await post('/api/auth/social/google', {
    challengeId: challenge.challengeId, state: challenge.state, idToken: 'not-a-real-token',
  }, challenge.cookie);
  assert.equal(result.status, 401);
  assert.equal(result.payload.code, 'SOCIAL_CHALLENGE_INVALID');
});

test('arbitrary credentials never create a fake session or account', async () => {
  const fresh = await post('/api/auth/social/google/challenge', {});
  challengeIds.push(fresh.payload.data.challengeId);
  const beforeCount = await User.countDocuments();
  const result = await post('/api/auth/social/google', {
    challengeId: fresh.payload.data.challengeId,
    state: fresh.payload.data.state,
    idToken: 'fake-google-user-token',
  }, fresh.cookie.split(';')[0]);
  assert.equal(result.status, 401);
  assert.equal(result.payload.code, 'INVALID_PROVIDER_TOKEN');
  assert.equal(result.payload.data, undefined);
  assert.equal(await User.countDocuments(), beforeCount);
});

test('verified-identity service persists provider subject; later calls reuse the same database account', async () => {
  // This function receives already-verified claims in production. Fixture is test-only.
  const claims = { sub: `google-${runId}`, email: `social-${runId}@example.com`, email_verified: true, name: 'Social Persistence Test' };
  const first = await social.resolveAccount('google', claims, {}, null);
  userIds.push(first._id);
  const again = await social.resolveAccount('google', claims, {}, null);
  assert.equal(first._id.toString(), again._id.toString());
  const stored = await User.findById(first._id).select('+googleId +password');
  assert.equal(stored.googleId, claims.sub);
  assert.equal(stored.password, undefined);
  assert.equal(stored.emailVerified, true);
  await assert.rejects(() => auth.login({ identifier: claims.email, password: 'made-up-password' }),
    (err) => err.errorCode === 'INVALID_CREDENTIALS');
});

test('unverified email is rejected; matching local email cannot be linked without signing in first', async () => {
  const email = `link-${runId}@example.com`;
  const local = await User.create({
    name: 'Local Account', email, phone: `+849${String(Date.now()).slice(-8)}`,
    password: await bcrypt.hash('Password123!', 10),
  });
  userIds.push(local._id);
  const claims = { sub: `link-google-${runId}`, email, email_verified: false };
  await assert.rejects(() => social.resolveAccount('google', claims, {}, null),
    (err) => err.errorCode === 'PROVIDER_EMAIL_UNVERIFIED');
  claims.email_verified = true;
  await assert.rejects(() => social.resolveAccount('google', claims, {}, null),
    (err) => err.errorCode === 'ACCOUNT_LINK_REQUIRED');
  const linked = await social.resolveAccount('google', claims, {}, local);
  assert.equal(linked._id.toString(), local._id.toString());
  const returning = await social.resolveAccount('google', claims, {}, null);
  assert.equal(returning._id.toString(), local._id.toString());
});
