const crypto = require('node:crypto');
const env = require('../../config/env');
const { withRedis, key } = require('../../config/redis');
const { generateToken, verifyToken } = require('../../utils/jwt');
const User = require('../users/user.model');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const unauthorized = (code = 'SESSION_REVOKED') => Object.assign(new Error('Session expired or revoked. Please login again.'), {
  statusCode: 401, errorCode: code,
});
const sessionKey = (sid) => key(`session:${sid}`);
function access(user, sid) {
  const token = generateToken({ sub: String(user._id), role: user.role,
    sid, jti: crypto.randomUUID(), av: user.authVersion || 0, type: 'access' });
  const claims = verifyToken(token);
  return { token, expiresIn: claims.exp - claims.iat, tokenType: 'Bearer' };
}
async function create(user) {
  const sid = crypto.randomBytes(16).toString('hex');
  const refreshToken = `${sid}.${crypto.randomBytes(32).toString('hex')}`;
  const session = { userId: String(user._id), version: user.authVersion || 0,
    refreshHash: hash(refreshToken), createdAt: Date.now() };
  await withRedis(r => r.set(sessionKey(sid), JSON.stringify(session), { EX: env.REFRESH_TTL_SECONDS }));
  return { ...access(user, sid), refreshToken, refreshExpiresIn: env.REFRESH_TTL_SECONDS };
}
const rotateScript = `
local raw = redis.call('GET', KEYS[1])
if not raw then return -1 end
local s = cjson.decode(raw)
if s.refreshHash ~= ARGV[1] then
  if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then
    redis.call('DEL', KEYS[1])
    return -2
  end
  return -1
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then return -1 end
redis.call('SADD', KEYS[2], ARGV[1])
redis.call('PEXPIRE', KEYS[2], ttl)
s.refreshHash = ARGV[2]
redis.call('SET', KEYS[1], cjson.encode(s), 'PX', ttl)
return math.floor(ttl / 1000)
`;
async function refresh(refreshToken) {
  if (typeof refreshToken !== 'string' || !/^[a-f0-9]{32}\.[a-f0-9]{64}$/.test(refreshToken)) throw unauthorized('INVALID_REFRESH_TOKEN');
  const sid = refreshToken.split('.')[0];
  const raw = await withRedis(r => r.get(sessionKey(sid)));
  if (!raw) throw unauthorized();
  const stored = JSON.parse(raw);
  const user = await User.findById(stored.userId);
  if (!user || (user.authVersion || 0) !== stored.version) throw unauthorized();
  const nextToken = `${sid}.${crypto.randomBytes(32).toString('hex')}`;
  const ttl = await withRedis(r => r.eval(rotateScript, {
    keys: [sessionKey(sid), key(`refresh-used:${sid}`)], arguments: [hash(refreshToken), hash(nextToken)],
  }));
  if (ttl < 0) throw unauthorized(ttl === -2 ? 'REFRESH_TOKEN_REUSED' : 'INVALID_REFRESH_TOKEN');
  return { ...access(user, sid), refreshToken: nextToken, refreshExpiresIn: ttl };
}
async function validate(claims, user) {
  if (claims.type !== 'access' || typeof claims.sid !== 'string' || !/^[a-f0-9]{32}$/.test(claims.sid)
    || typeof claims.jti !== 'string' || claims.av !== (user.authVersion || 0)) throw unauthorized();
  const [raw, blocked] = await withRedis(r => r.mGet([sessionKey(claims.sid), key(`blacklist:${claims.jti}`)]));
  if (!raw || blocked) throw unauthorized();
  const session = JSON.parse(raw);
  if (session.userId !== String(user._id) || session.version !== claims.av) throw unauthorized();
}
async function revoke(claims) {
  const ttl = Math.max(1, claims.exp - Math.floor(Date.now() / 1000));
  await withRedis(r => r.multi().del(sessionKey(claims.sid))
    .set(key(`blacklist:${claims.jti}`), '1', { EX: ttl }).exec());
}
async function revokeAll(userId) {
  // Durable epoch invalidates every Redis session, including requests racing with logout.
  await User.updateOne({ _id: userId }, { $inc: { authVersion: 1 } });
}
module.exports = { create, refresh, validate, revoke, revokeAll };
