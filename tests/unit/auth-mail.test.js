process.env.SMTP_HOST = '';
process.env.DOTENV_CONFIG_QUIET = 'true';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const env = require('../../src/config/env');
const mail = require('../../src/modules/auth/auth.mail');

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
    await assert.rejects(mail.sendOtp('recipient@example.test', '123456', 'verify-email'), /did not accept/);
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
