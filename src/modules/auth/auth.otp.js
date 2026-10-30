const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const env = require('../../config/env');
const { withRedis, key } = require('../../config/redis');
const { normalizeEmail } = require('./auth.utils');
const mail = require('./auth.mail');
const User = require('../users/user.model');
const error = (message, statusCode, errorCode) => Object.assign(new Error(message), { statusCode, errorCode });
const invalid = () => error('OTP is invalid, expired or already used.', 400, 'INVALID_OTP');
const digest = (purpose, email, code) => crypto.createHmac('sha256', env.OTP_SECRET)
  .update(`${purpose}\0${email}\0${code}`).digest('hex');
const otpKey = (purpose, email) => key(`otp:${purpose}:${crypto.createHash('sha256').update(email).digest('hex')}`);
const versionFilter = (version) => version === 0
  ? { $or: [{ authVersion: 0 }, { authVersion: { $exists: false } }] } : { authVersion: version };
async function cooldown(purpose, email) {
  const allowed = await withRedis(r => r.set(`${otpKey(purpose, email)}:cooldown`, '1', { NX: true, EX: env.OTP_RESEND_SECONDS }));
  if (!allowed) throw error('Please wait before requesting another code.', 429, 'OTP_COOLDOWN');
}
async function deliver(purpose, user) {
  const code = String(crypto.randomInt(100000, 1000000));
  const stored = { digest: digest(purpose, user.email, code), attempts: 0,
    userId: String(user._id), email: user.email, version: user.authVersion || 0 };
  const k = otpKey(purpose, user.email);
  const encoded = JSON.stringify(stored);
  await withRedis(r => r.set(k, encoded, { EX: env.OTP_TTL_SECONDS }));
  try { await mail.sendOtp(user.email, code, purpose); }
  catch {
    // Remove only this delivery, never a newer OTP issued by another request.
    await withRedis(r => r.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0",
      { keys: [k], arguments: [encoded] }));
    return false;
  }
  return true;
}
async function requestVerification(user) {
  mail.requireConfiguration();
  if (user.emailVerified) return { alreadyVerified: true };
  await cooldown('verify-email', user.email);
  const sent = await deliver('verify-email', user);
  if (!sent) throw error('Email service unavailable. Please request a new code later.', 503, 'EMAIL_NOT_CONFIGURED');
  return { sent: true, expiresIn: env.OTP_TTL_SECONDS };
}
async function requestReset(emailInput) {
  mail.requireConfiguration();
  const email = normalizeEmail(emailInput);
  if (!email) throw error('A valid email is required.', 400, 'VALIDATION_ERROR');
  // Applies equally to existing and unknown accounts.
  await cooldown('reset-password', email);
  const user = await User.findOne({ email }).select('+password');
  if (user?.password) {
    const sent = await deliver('reset-password', user);
    if (!sent) console.error('[OTP] Password-reset email delivery failed');
  }
  // Never return account existence, OTP or the provider error to a public request.
  return { message: 'If an eligible account exists, an email will be sent. You may request another code after the cooldown.' };
}
const consumeScript = `
local raw = redis.call('GET', KEYS[1])
if not raw then return '' end
local o = cjson.decode(raw)
if o.digest ~= ARGV[1] then
  o.attempts = o.attempts + 1
  if o.attempts >= 5 then redis.call('DEL', KEYS[1])
  else redis.call('SET', KEYS[1], cjson.encode(o), 'KEEPTTL') end
  return ''
end
redis.call('DEL', KEYS[1])
return raw
`;
async function consume(purpose, email, code) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw invalid();
  const raw = await withRedis(r => r.eval(consumeScript, {
    keys: [otpKey(purpose, email)], arguments: [digest(purpose, email, code)],
  }));
  if (!raw) throw invalid();
  return JSON.parse(raw);
}
async function verifyEmail(user, code) {
  const otp = await consume('verify-email', user.email, code);
  if (otp.userId !== String(user._id)) throw invalid();
  const updated = await User.updateOne({ _id: user._id, email: otp.email, ...versionFilter(otp.version) },
    { $set: { emailVerified: true } });
  if (!updated.matchedCount) throw invalid();
  return { emailVerified: true };
}
async function resetPassword({ email: input, otp: code, password, confirmPassword } = {}) {
  const email = normalizeEmail(input);
  if (!email || typeof password !== 'string' || password.trim() === '' || password.length < 8
    || Buffer.byteLength(password, 'utf8') > 72 || (confirmPassword !== undefined && confirmPassword !== password)) {
    throw error('Provide a valid email and matching password (8 characters to 72 UTF-8 bytes).', 400, 'VALIDATION_ERROR');
  }
  const otp = await consume('reset-password', email, code);
  const hashed = await bcrypt.hash(password, 12);
  // Password update and epoch change are one MongoDB write: all old sessions stop working.
  const updated = await User.updateOne({ _id: otp.userId, email, ...versionFilter(otp.version) },
    { $set: { password: hashed, emailVerified: true }, $inc: { authVersion: 1 } });
  if (!updated.matchedCount) throw invalid();
  return { passwordReset: true, loginRequired: true };
}
module.exports = { requestVerification, verifyEmail, requestReset, resetPassword };
