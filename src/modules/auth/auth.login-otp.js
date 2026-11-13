const crypto = require('node:crypto');
const User = require('../users/user.model');
const env = require('../../config/env');
const { withRedis, key } = require('../../config/redis');
const mail = require('./auth.mail');
const error = (message, statusCode, errorCode) => Object.assign(new Error(message), { statusCode, errorCode });
const invalid = () => error('Login code is invalid or expired. Please sign in again.', 400, 'INVALID_OTP');
const pendingKey = id => key(`login-otp:${id}`);
const hash = (id, code) => crypto.createHmac('sha256', env.OTP_SECRET).update(`login\0${id}\0${code}`).digest('hex');
const validId = id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id);
const versionFilter = version => version === 0 ? { $or: [{ authVersion: 0 }, { authVersion: { $exists: false } }] } : { authVersion: version };
async function cooldown(userId) {
  const allowed = await withRedis(r => r.set(key(`login-otp-cooldown:${userId}`), '1', { NX: true, EX: env.OTP_RESEND_SECONDS }));
  if (!allowed) throw error('Please wait before requesting another code.', 429, 'OTP_COOLDOWN');
}
const replaceScript = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 1`;
async function deliver(id, data, previous) {
  const code = String(crypto.randomInt(100000, 1000000));
  const record = { userId: data.userId, email: data.email, version: data.version,
    digest: hash(id, code), attempts: 0, ready: false };
  const encoded = JSON.stringify(record), k = pendingKey(id);
  if (previous !== undefined) {
    const ok = await withRedis(r => r.eval(replaceScript, { keys: [k], arguments: [previous, encoded, String(env.OTP_TTL_SECONDS)] }));
    if (!ok) throw invalid();
  } else await withRedis(r => r.set(k, encoded, { EX: env.OTP_TTL_SECONDS }));
  try {
    await mail.sendOtp(record.email, code, 'login');
    const ok = await withRedis(r => r.eval(replaceScript, { keys: [k], arguments: [encoded, JSON.stringify({ ...record, ready: true }), String(env.OTP_TTL_SECONDS)] }));
    if (!ok) throw invalid();
  } catch (err) {
    await withRedis(r => r.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0", { keys: [k], arguments: [encoded] }));
    if (err.errorCode) throw err;
    throw error('Could not send login code. Please try again.', 503, 'EMAIL_NOT_CONFIGURED');
  }
  return { loginChallengeId: id, email: record.email, status: 'pending_otp', expiresIn: env.OTP_TTL_SECONDS, resendAfter: env.OTP_RESEND_SECONDS };
}
// Called only after a successful password check. Never store the password in Redis.
async function request(user) {
  mail.requireConfiguration();
  await cooldown(String(user._id));
  return deliver(crypto.randomBytes(32).toString('hex'), { userId: String(user._id), email: user.email, version: user.authVersion || 0 });
}
async function resend(id) {
  if (!validId(id)) throw invalid();
  mail.requireConfiguration();
  const raw = await withRedis(r => r.get(pendingKey(id)));
  if (!raw) throw invalid();
  const data = JSON.parse(raw);
  const user = await User.findOne({ _id: data.userId, email: data.email, ...versionFilter(data.version) });
  if (!user) throw invalid();
  await cooldown(data.userId);
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
async function verify({ loginChallengeId: id, otp } = {}) {
  if (!validId(id) || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) throw invalid();
  const raw = await withRedis(r => r.eval(consumeScript, { keys: [pendingKey(id)], arguments: [hash(id, otp)] }));
  if (!raw) throw invalid();
  const data = JSON.parse(raw);
  // Password reset/logout-all invalidates any pending login challenge as well.
  const user = await User.findOneAndUpdate({ _id: data.userId, email: data.email, ...versionFilter(data.version) },
    { $set: { emailVerified: true } }, { new: true });
  if (!user) throw invalid();
  return require('./auth.service').createSession(user);
}
module.exports = { request, resend, verify };
