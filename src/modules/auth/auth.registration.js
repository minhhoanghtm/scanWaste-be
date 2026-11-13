const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const User = require('../users/user.model');
const env = require('../../config/env');
const { withRedis, key } = require('../../config/redis');
const { normalizeEmail, normalizeVietnamesePhone } = require('./auth.utils');
const mail = require('./auth.mail');
const error = (message, statusCode, errorCode) => Object.assign(new Error(message), { statusCode, errorCode });
const invalid = () => error('Registration code is invalid or expired. Please register again.', 400, 'INVALID_OTP');
const pendingKey = id => key(`registration:${id}`);
const hash = (id, code) => crypto.createHmac('sha256', env.OTP_SECRET).update(`register\0${id}\0${code}`).digest('hex');
const validId = id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id);
async function available(email, phone) {
  const existing = await User.findOne({ $or: [{ email }, { phone }] });
  if (existing) throw error('Email or phone is already registered.', 409,
    existing.email === email ? 'EMAIL_EXISTS' : 'PHONE_EXISTS');
}
async function cooldown(email) {
  const k = key(`registration-cooldown:${crypto.createHash('sha256').update(email).digest('hex')}`);
  const allowed = await withRedis(r => r.set(k, '1', { NX: true, EX: env.OTP_RESEND_SECONDS }));
  if (!allowed) throw error('Please wait before requesting another code.', 429, 'OTP_COOLDOWN');
}
const replaceScript = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 1`;
async function deliver(id, data, previous) {
  const code = String(crypto.randomInt(100000, 1000000));
  // Pending data contains only a password hash; no user or session exists yet.
  const record = { ...data, digest: hash(id, code), attempts: 0, ready: false };
  const encoded = JSON.stringify(record);
  const k = pendingKey(id);
  if (previous !== undefined) {
    const replaced = await withRedis(r => r.eval(replaceScript, { keys: [k], arguments: [previous, encoded, String(env.OTP_TTL_SECONDS)] }));
    if (!replaced) throw invalid();
  } else await withRedis(r => r.set(k, encoded, { EX: env.OTP_TTL_SECONDS }));
  try {
    await mail.sendOtp(record.email, code, 'register');
    const ready = JSON.stringify({ ...record, ready: true });
    const replaced = await withRedis(r => r.eval(replaceScript, { keys: [k], arguments: [encoded, ready, String(env.OTP_TTL_SECONDS)] }));
    if (!replaced) throw invalid();
  } catch (err) {
    await withRedis(r => r.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0", { keys: [k], arguments: [encoded] }));
    if (err.errorCode) throw err;
    throw error('Could not send registration email. Please try again.', 503, 'EMAIL_NOT_CONFIGURED');
  }
  return { registrationId: id, email: record.email, status: 'pending_verification', expiresIn: env.OTP_TTL_SECONDS, resendAfter: env.OTP_RESEND_SECONDS };
}
async function request({ name, email: input, phone: phoneInput, password }) {
  const email = normalizeEmail(input), phone = normalizeVietnamesePhone(phoneInput);
  await available(email, phone);
  mail.requireConfiguration();
  await cooldown(email);
  const passwordHash = await bcrypt.hash(password, 12);
  return deliver(crypto.randomBytes(32).toString('hex'), { name: name.trim(), email, phone, passwordHash });
}
async function resend(id) {
  if (!validId(id)) throw invalid();
  mail.requireConfiguration();
  const raw = await withRedis(r => r.get(pendingKey(id)));
  if (!raw) throw invalid();
  const data = JSON.parse(raw);
  await available(data.email, data.phone);
  await cooldown(data.email);
  return deliver(id, data, raw);
}
const consumeScript = `
local raw = redis.call('GET', KEYS[1])
if not raw then return '' end
local o = cjson.decode(raw)
if not o.ready then return '' end
if o.digest ~= ARGV[1] then
  o.attempts = o.attempts + 1
  if o.attempts >= 5 then redis.call('DEL', KEYS[1])
  else redis.call('SET', KEYS[1], cjson.encode(o), 'KEEPTTL') end
  return ''
end
redis.call('DEL', KEYS[1])
return raw`;
async function verify({ registrationId: id, otp } = {}) {
  if (!validId(id) || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) throw invalid();
  const raw = await withRedis(r => r.eval(consumeScript, { keys: [pendingKey(id)], arguments: [hash(id, otp)] }));
  if (!raw) throw invalid();
  const data = JSON.parse(raw);
  await available(data.email, data.phone);
  // Mongo unique indexes are the final guard against parallel email/phone claims.
  const user = await User.create({ name: data.name, email: data.email, phone: data.phone,
    password: data.passwordHash, emailVerified: true });
  return require('./auth.service').createSession(user);
}
module.exports = { request, verify, resend };
