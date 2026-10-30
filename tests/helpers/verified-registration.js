// Test-only mail boundary. Broad API tests auto-confirm using the captured email code.
// Real SMTP + pending-account behavior is covered by registration/session integration tests.
const env = require('../../src/config/env');
const mail = require('../../src/modules/auth/auth.mail');
const codes = new Map();
Object.assign(env, { SMTP_HOST: '127.0.0.1', SMTP_FROM: 'test@example.test', SMTP_USER: '', SMTP_PASS: '', SMTP_SECURE: false });
mail.sendOtp = async (email, code) => { codes.set(email, code); };
async function verifiedRegistrationFetch(url, options) {
  const response = await fetch(url, options);
  if (response.status !== 202) return response;
  const payload = await response.json();
  return fetch(`${url}/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ registrationId: payload.data.registrationId, otp: codes.get(payload.data.email) }) });
}
async function verifiedLoginFetch(url, options) {
  const response = await fetch(url, options);
  if (response.status !== 202) return response;
  const payload = await response.json();
  const verified = await fetch(`${url}/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginChallengeId: payload.data.loginChallengeId, otp: codes.get(payload.data.email) }) });
  if (verified.ok) {
    const userId = (await verified.clone().json()).data.user.id;
    // Independent broad test cases may log in repeatedly; dedicated OTP tests assert cooldown.
    if (!env.REDIS_PREFIX.startsWith('test:')) throw new Error('Test namespace required');
    await (await require('../../src/config/redis').getRedis()).del(`${env.REDIS_PREFIX}login-otp-cooldown:${userId}`);
  }
  return verified;
}
module.exports = { verifiedRegistrationFetch, verifiedLoginFetch };
