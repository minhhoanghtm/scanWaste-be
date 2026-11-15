const { createClient } = require('redis');
const env = require('./env');
let client;
let connecting;
const unavailable = () => Object.assign(new Error('Authentication storage unavailable. Please retry.'), {
  statusCode: 503, errorCode: 'AUTH_STORE_UNAVAILABLE',
});
async function getRedis() {
  if (!client) {
    client = createClient({ url: env.REDIS_URL, disableOfflineQueue: true,
      // Fail a request closed promptly. The next request creates a fresh connection attempt.
      socket: { connectTimeout: 3000, reconnectStrategy: () => false } });
    // Never log Redis URLs, commands or credentials.
    client.on('error', () => {});
  }
  if (!client.isReady) {
    if (!connecting) connecting = client.connect().catch((err) => {
      // A failed client cannot be reused reliably; the next request gets one fresh attempt.
      if (client?.isOpen) client.destroy();
      client = undefined;
      throw err;
    }).finally(() => { connecting = undefined; });
    try { await connecting; } catch { throw unavailable(); }
  }
  return client;
}
async function withRedis(fn) {
  try { return await fn(await getRedis()); }
  catch (err) { if (err.statusCode) throw err; throw unavailable(); }
}
async function closeRedis() {
  if (client?.isOpen) client.destroy();
  client = undefined;
}
const key = (suffix) => `${env.REDIS_PREFIX}${suffix}`;
module.exports = { getRedis, withRedis, closeRedis, key };
