// Runs against a test database; never drops a database or existing collections.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'auth-integration-test-secret-only';
process.env.JWT_EXPIRES_IN = '15m';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomUUID, randomInt } = require('node:crypto');
const { before, after, test } = require('node:test');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const User = require('../../src/modules/users/user.model');

let server;
let baseUrl;
let currentUser;
let accessToken;
const createdIds = [];
const runId = randomUUID();
let phoneCounter = randomInt(10000000, 90000000);
const makeRegistration = (overrides = {}) => ({
  name: 'Nguyen Minh Anh',
  email: `auth-${runId}-${phoneCounter}@example.com`,
  phone: `09${phoneCounter++}`,
  password: 'Password123!',
  confirmPassword: 'Password123!',
  ...overrides,
});

const request = async (path, body, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (response.status === 201 && data.data?.user?.id) {
    createdIds.push(data.data.user.id);
  }
  return { status: response.status, headers: response.headers, ...data };
};

before(async () => {
  await mongoose.connect(
    process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/scanwaste_auth_test',
    { serverSelectionTimeoutMS: 5000 }
  );
  await User.init();
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (mongoose.connection.readyState === 1 && createdIds.length) {
    await User.deleteMany({ _id: { $in: createdIds } });
  }
  await mongoose.disconnect();
});

test('register normalizes data, hashes password, prevents assigning admin, issues a 15-minute JWT', async () => {
  currentUser = makeRegistration();
  const result = await request('/api/auth/register', {
    ...currentUser,
    name: `  ${currentUser.name}  `,
    email: currentUser.email.toUpperCase(),
    role: 'admin',
  });
  assert.equal(result.status, 201);
  assert.equal(result.data.user.name, currentUser.name);
  assert.equal(result.data.user.email, currentUser.email);
  assert.equal(result.data.user.phone, `+84${currentUser.phone.slice(1)}`);
  assert.equal(result.data.user.role, 'user');
  assert.equal(result.data.user.password, undefined);
  const stored = await User.findById(result.data.user.id).select('+password');
  assert.notEqual(stored.password, currentUser.password);
  assert.equal(await bcrypt.compare(currentUser.password, stored.password), true);
  assert.equal(bcrypt.getRounds(stored.password), 12);
  const claims = jwt.verify(result.data.token, process.env.JWT_SECRET);
  assert.equal(claims.sub, result.data.user.id);
  assert.equal(claims.role, 'user');
  assert.equal(claims.exp - claims.iat, 900);
  accessToken = result.data.token;
});

test('login accepts identifier, legacy email field, and Vietnamese phone formats', async () => {
  for (const identifier of [
    { identifier: currentUser.email.toUpperCase() },
    { email: currentUser.email },
    { identifier: currentUser.phone },
    { phone: `+84${currentUser.phone.slice(1)}` },
    { identifier: `84${currentUser.phone.slice(1)}` },
  ]) {
    const result = await request('/api/auth/login', { ...identifier, password: currentUser.password });
    assert.equal(result.status, 200);
    assert.equal(result.data.user.email, currentUser.email);
    assert.equal(result.data.user.password, undefined);
  }
});

test('duplicate email and duplicate normalized phone have distinct error codes', async () => {
  const emailResult = await request('/api/auth/register', makeRegistration({ email: currentUser.email }));
  assert.equal(emailResult.status, 409);
  assert.equal(emailResult.code, 'EMAIL_EXISTS');
  const phoneResult = await request('/api/auth/register', makeRegistration({
    phone: `+84${currentUser.phone.slice(1)}`,
  }));
  assert.equal(phoneResult.status, 409);
  assert.equal(phoneResult.code, 'PHONE_EXISTS');
});

test('concurrent registration cannot create duplicate email or phone', async () => {
  for (const duplicateField of ['email', 'phone']) {
    const registration = makeRegistration();
    const other = makeRegistration({ [duplicateField]: registration[duplicateField] });
    const results = await Promise.all([
      request('/api/auth/register', registration),
      request('/api/auth/register', other),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
    assert.equal(results.find((result) => result.status === 409).code,
      duplicateField === 'email' ? 'EMAIL_EXISTS' : 'PHONE_EXISTS');
  }
});

test('bad registration data, weak passwords, mismatch, and bcrypt byte overflow are rejected', async () => {
  for (const [overrides, code] of [
    [{ name: 'x'.repeat(101) }, 'VALIDATION_ERROR'],
    [{ email: 'a@@example.com' }, 'VALIDATION_ERROR'],
    [{ phone: '0123456789' }, 'VALIDATION_ERROR'],
    [{ password: 'short', confirmPassword: 'short' }, 'WEAK_PASSWORD'],
    [{ password: ' '.repeat(8), confirmPassword: ' '.repeat(8) }, 'WEAK_PASSWORD'],
    [{ confirmPassword: 'different' }, 'VALIDATION_ERROR'],
    [{ password: 'é'.repeat(37), confirmPassword: 'é'.repeat(37) }, 'WEAK_PASSWORD'],
  ]) {
    const result = await request('/api/auth/register', makeRegistration(overrides));
    assert.equal(result.status, 400);
    assert.equal(result.code, code);
  }
});

test('missing request body and operator injection return validation errors', async () => {
  const missingBody = await fetch(`${baseUrl}/api/auth/register`, { method: 'POST' });
  assert.equal(missingBody.status, 400);
  const malformedJson = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"password":"sensitive-test-password",',
  });
  assert.equal(malformedJson.status, 400);
  const malformedPayload = await malformedJson.json();
  assert.equal(malformedPayload.code, 'VALIDATION_ERROR');
  assert.equal(JSON.stringify(malformedPayload).includes('sensitive-test-password'), false);
  const result = await request('/api/auth/login', {
    identifier: { $ne: null }, password: { $ne: null },
  });
  assert.equal(result.status, 400);
  assert.equal(result.code, 'VALIDATION_ERROR');
  const ambiguous = await request('/api/auth/login', {
    email: currentUser.email, phone: currentUser.phone, password: currentUser.password,
  });
  assert.equal(ambiguous.status, 400);
});

test('wrong password and unknown account return the same credential error', async () => {
  const wrongPassword = await request('/api/auth/login', {
    identifier: currentUser.email, password: 'wrong-password',
  });
  const missingUser = await request('/api/auth/login', {
    identifier: 'missing@example.com', password: 'wrong-password',
  });
  assert.equal(wrongPassword.status, 401);
  assert.equal(missingUser.status, 401);
  assert.equal(wrongPassword.code, 'INVALID_CREDENTIALS');
  assert.equal(missingUser.message, wrongPassword.message);
});

test('profile accepts new and legacy JWTs; expired and invalid JWTs have stable errors', async () => {
  const profile = await request('/api/users/me', undefined, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert.equal(profile.status, 200);
  assert.equal(profile.data.phone, `+84${currentUser.phone.slice(1)}`);
  const userId = jwt.decode(accessToken).sub;
  for (const [token, status, code] of [
    [jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1m' }), 200],
    [jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: -1 }), 401, 'TOKEN_EXPIRED'],
    [jwt.sign({ sub: userId }, 'wrong-signing-secret'), 401, 'UNAUTHORIZED'],
    [jwt.sign({ sub: 'invalid-object-id' }, process.env.JWT_SECRET), 401, 'UNAUTHORIZED'],
    [jwt.sign({ sub: userId }, process.env.JWT_SECRET, { algorithm: 'HS384' }), 401, 'UNAUTHORIZED'],
    ['malformed-token', 401, 'UNAUTHORIZED'],
  ]) {
    const result = await request('/api/users/me', undefined, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(result.status, status);
    if (code) assert.equal(result.code, code);
  }
});

test('legacy users without phone coexist and can still log in by email with a 6-character password', async () => {
  const password = await bcrypt.hash('old123', 10);
  for (let index = 0; index < 2; index++) {
    const email = `legacy-${index}-${runId}@example.com`;
    const { insertedId } = await User.collection.insertOne({
      name: 'Legacy User', email, password, role: 'user',
    });
    createdIds.push(insertedId);
    const result = await request('/api/auth/login', { email, password: 'old123' });
    assert.equal(result.status, 200);
  }
});

test('repeated failed login requests are rate limited', async () => {
  let result;
  for (let index = 0; index < 21; index++) {
    result = await request('/api/auth/login', {});
    if (result.status === 429) break;
  }
  assert.equal(result.status, 429);
  assert.equal(result.code, 'TOO_MANY_REQUESTS');
  assert.ok(result.headers.get('retry-after'));
});
