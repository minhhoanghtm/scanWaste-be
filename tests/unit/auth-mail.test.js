process.env.SMTP_HOST = '';
process.env.DOTENV_CONFIG_QUIET = 'true';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const env = require('../../src/config/env');
const mail = require('../../src/modules/auth/auth.mail');
const gmailApi = require('../../src/modules/auth/auth.mail.gmail-api');

test('Gmail cannot report configured without sender credentials', () => {
  Object.assign(env, { SMTP_HOST: 'smtp.gmail.com', SMTP_FROM: 'EcoSort <test@gmail.com>', SMTP_USER: 'test@gmail.com', SMTP_PASS: '' });
  assert.equal(mail.configured(), false);
  assert.throws(() => mail.requireConfiguration(), { errorCode: 'EMAIL_NOT_CONFIGURED' });
  env.SMTP_PASS = 'fixture-only';
  assert.equal(mail.configured(), true);
});

test('External SMTP enforces TLS and does not treat rejected mail as sent', async () => {
  Object.assign(env, { SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: 587, SMTP_SECURE: false, NODE_ENV: 'development' });
  const original = nodemailer.createTransport;
  let accepted = false;
  nodemailer.createTransport = options => {
    assert.equal(options.requireTLS, true);
    return { sendMail: async () => ({ accepted: accepted ? ['recipient@example.test'] : [], rejected: accepted ? [] : ['recipient@example.test'] }) };
  };
  try {
    await assert.rejects(mail.sendOtp('recipient@example.test', '123456', 'verify-email'), error => {
      assert.equal(error.errorCode, 'EMAIL_DELIVERY_UNAVAILABLE');
      return true;
    });
    accepted = true;
    await mail.sendOtp('recipient@example.test', '123456', 'reset-password');
  } finally { nodemailer.createTransport = original; }
});


test('Brevo requires an API key and verified-sender email setting', () => {
  const before = { ...env };
  try {
    Object.assign(env, { EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: '', BREVO_SENDER_EMAIL: 'sender@example.test' });
    assert.equal(mail.configured(), false);
    env.BREVO_API_KEY = 'fixture-key';
    env.BREVO_SENDER_EMAIL = 'invalid';
    assert.equal(mail.configured(), false);
    env.BREVO_SENDER_EMAIL = 'sender@example.test';
    assert.equal(mail.configured(), true);
    env.EMAIL_PROVIDER = 'unknown';
    assert.equal(mail.configured(), false);
  } finally { Object.assign(env, before); }
});

test('Brevo sends OTP over HTTPS and requires a provider acknowledgement', async () => {
  const before = { ...env }, originalFetch = global.fetch;
  Object.assign(env, { EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'fixture-key',
    BREVO_SENDER_EMAIL: 'sender@example.test', BREVO_SENDER_NAME: 'EcoSort AI' });
  let mode = 'success';
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(options.headers['api-key'], 'fixture-key');
    const body = JSON.parse(options.body);
    assert.equal(body.to[0].email, 'recipient@example.test');
    assert.equal(body.sender.email, 'sender@example.test');
    assert.match(body.textContent, /123456/);
    assert.ok(options.signal);
    if (mode === 'network') throw new Error('private provider details must not escape');
    return { ok: mode !== 'quota', json: async () => mode === 'empty' ? {} : { messageId: 'fixture-message' } };
  };
  try {
    await mail.sendOtp('recipient@example.test', '123456', 'login');
    for (mode of ['quota', 'empty', 'network']) {
      await assert.rejects(mail.sendOtp('recipient@example.test', '123456', 'register'), error => {
        assert.equal(error.statusCode, 503);
        assert.equal(error.errorCode, 'EMAIL_DELIVERY_UNAVAILABLE');
        assert.doesNotMatch(error.message, /fixture-key|123456|private provider/);
        return true;
      });
    }
  } finally { global.fetch = originalFetch; Object.assign(env, before); }
});

test('Gmail API requires every OAuth credential and a valid authorized sender', () => {
  const before = { ...env };
  try {
    Object.assign(env, { EMAIL_PROVIDER: 'gmail_api', GMAIL_OAUTH_CLIENT_ID: 'client-id', GOOGLE_CLIENT_SECRET: '',
      GOOGLE_REFRESH_TOKEN: 'refresh-token', GMAIL_SENDER_EMAIL: 'owner@gmail.com' });
    assert.equal(mail.configured(), false);
    env.GOOGLE_CLIENT_SECRET = 'client-secret';
    env.GMAIL_SENDER_EMAIL = 'not-an-email';
    assert.equal(mail.configured(), false);
    env.GMAIL_SENDER_EMAIL = 'owner@gmail.com';
    assert.equal(mail.configured(), true);
  } finally { Object.assign(env, before); gmailApi.resetTokenCacheForTests(); }
});

test('Gmail API refreshes OAuth token and sends base64url UTF-8 multipart OTP mail', async () => {
  const before = { ...env }, originalFetch = global.fetch;
  Object.assign(env, { EMAIL_PROVIDER: 'gmail_api', GMAIL_OAUTH_CLIENT_ID: 'client-id', GOOGLE_CLIENT_SECRET: 'client-secret',
    GOOGLE_REFRESH_TOKEN: 'refresh-token', GMAIL_SENDER_EMAIL: 'owner@gmail.com', GMAIL_SENDER_NAME: 'ScanWaste Việt Nam', EMAIL_SEND_TIMEOUT_MS: 10000 });
  gmailApi.resetTokenCacheForTests();
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url === 'https://oauth2.googleapis.com/token') {
      assert.equal(options.body.get('grant_type'), 'refresh_token');
      assert.equal(options.body.get('client_id'), 'client-id');
      assert.equal(options.body.get('client_secret'), 'client-secret');
      assert.equal(options.body.get('refresh_token'), 'refresh-token');
      return { ok: true, status: 200, json: async () => ({ access_token: 'access-token', expires_in: 3600 }) };
    }
    assert.equal(url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    assert.equal(options.headers.Authorization, 'Bearer access-token');
    const raw = JSON.parse(options.body).raw;
    assert.doesNotMatch(raw, /[+/=]/);
    const mime = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    assert.match(mime, /Subject: =\?UTF-8\?B\?/);
    assert.match(mime, /To: recipient@example\.test/);
    assert.match(mime, /multipart\/alternative/);
    assert.match(mime, /MTIzNDU2/); // base64 for the OTP; it is never logged or returned by the API.
    return { ok: true, status: 200, json: async () => ({ id: 'gmail-message-id' }) };
  };
  try {
    await mail.sendOtp('recipient@example.test', '123456', 'register');
    assert.equal(calls.length, 2);
  } finally { global.fetch = originalFetch; Object.assign(env, before); gmailApi.resetTokenCacheForTests(); }
});

test('Gmail API maps OAuth, Gmail, timeout and network failures without leaking tokens', async () => {
  const before = { ...env }, originalFetch = global.fetch;
  Object.assign(env, { EMAIL_PROVIDER: 'gmail_api', GMAIL_OAUTH_CLIENT_ID: 'client-id', GOOGLE_CLIENT_SECRET: 'client-secret',
    GOOGLE_REFRESH_TOKEN: 'refresh-token', GMAIL_SENDER_EMAIL: 'owner@gmail.com' });
  const cases = [
    { name: 'invalid grant', token: { ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) } },
    ...[400, 401, 403, 429, 500].map(status => ({
      name: `gmail ${status}`,
      token: { ok: true, status: 200, json: async () => ({ access_token: 'access-token', expires_in: 3600 }) },
      send: { ok: false, status, json: async () => ({ error: 'private detail' }) },
    })),
    { name: 'timeout', throw: Object.assign(new Error('timeout'), { name: 'TimeoutError' }) },
  ];
  try {
    for (const fixture of cases) {
      gmailApi.resetTokenCacheForTests();
      global.fetch = async url => {
        if (fixture.throw) throw fixture.throw;
        return url === 'https://oauth2.googleapis.com/token' ? fixture.token : fixture.send;
      };
      await assert.rejects(mail.sendOtp('recipient@example.test', '123456', 'login'), error => {
        assert.equal(error.statusCode, 503, fixture.name);
        assert.equal(error.errorCode, 'EMAIL_DELIVERY_UNAVAILABLE', fixture.name);
        assert.doesNotMatch(error.message, /client-secret|refresh-token|access-token|private detail|123456/);
        return true;
      });
    }
  } finally { global.fetch = originalFetch; Object.assign(env, before); gmailApi.resetTokenCacheForTests(); }
});
