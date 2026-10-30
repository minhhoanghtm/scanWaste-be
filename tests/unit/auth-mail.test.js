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
