const crypto = require('node:crypto');
const env = require('../../config/env');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let tokenCache = null;

const deliveryError = () => Object.assign(new Error('Email provider did not accept the message. Please retry.'), {
  statusCode: 503, errorCode: 'EMAIL_DELIVERY_UNAVAILABLE',
});

function configured() {
  return Boolean(env.GMAIL_OAUTH_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN
    && emailPattern.test(env.GMAIL_SENDER_EMAIL));
}

function encodeHeader(value) {
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function base64url(value) {
  return Buffer.from(value, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function safeDisplayName(value) {
  return String(value || 'ScanWaste').replace(/[\r\n<>]/g, ' ').trim() || 'ScanWaste';
}

function message({ to, subject, text, html }) {
  if (!emailPattern.test(to) || /[\r\n]/.test(to)) throw deliveryError();
  const boundary = `scanwaste-${crypto.randomBytes(12).toString('hex')}`;
  const lines = [
    `From: ${encodeHeader(safeDisplayName(env.GMAIL_SENDER_NAME))} <${env.GMAIL_SENDER_EMAIL}>`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text, 'utf8').toString('base64'),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64'),
    `--${boundary}--`,
    '',
  ];
  return base64url(lines.join('\r\n'));
}

function logFailure(correlationId, operation, category, status, startedAt) {
  // Intentionally exclude recipient, message body, OTP and OAuth credentials.
  console.error('[OTP] Email delivery failed', {
    provider: 'gmail_api', correlationId, operation, category,
    ...(status ? { status } : {}), durationMs: Date.now() - startedAt,
  });
}

async function responseJson(response) {
  try { return await response.json(); } catch { return null; }
}

async function accessToken(correlationId, startedAt) {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.value;
  let response;
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: env.GMAIL_OAUTH_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: env.GOOGLE_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(env.EMAIL_SEND_TIMEOUT_MS),
    });
  } catch (err) {
    logFailure(correlationId, 'oauth_refresh', err?.name === 'TimeoutError' ? 'timeout' : 'network', undefined, startedAt);
    throw deliveryError();
  }
  const payload = await responseJson(response);
  if (!response.ok || typeof payload?.access_token !== 'string' || !payload.access_token) {
    logFailure(correlationId, 'oauth_refresh', response.status === 400 ? 'invalid_grant_or_bad_request' : 'oauth_rejected', response.status, startedAt);
    throw deliveryError();
  }
  const expiresIn = Number(payload.expires_in);
  tokenCache = { value: payload.access_token, expiresAt: Date.now() + Math.max(1, (Number.isFinite(expiresIn) ? expiresIn : 300) - 60) * 1000 };
  return tokenCache.value;
}

async function send({ to, subject, text, html }) {
  const correlationId = crypto.randomUUID();
  const startedAt = Date.now();
  try {
    const token = await accessToken(correlationId, startedAt);
    const response = await fetch(SEND_URL, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ raw: message({ to, subject, text, html }) }),
      signal: AbortSignal.timeout(env.EMAIL_SEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      // Do not retry: Gmail may have accepted a request even if a network response was lost.
      logFailure(correlationId, 'gmail_send', response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden'
        : response.status === 429 ? 'rate_limited' : response.status >= 500 ? 'server_error' : 'bad_request', response.status, startedAt);
      throw deliveryError();
    }
    const payload = await responseJson(response);
    if (typeof payload?.id !== 'string' || !payload.id) {
      logFailure(correlationId, 'gmail_send', 'missing_acknowledgement', response.status, startedAt);
      throw deliveryError();
    }
  } catch (err) {
    if (err?.errorCode === 'EMAIL_DELIVERY_UNAVAILABLE') throw err;
    logFailure(correlationId, 'gmail_send', err?.name === 'TimeoutError' ? 'timeout' : 'network', undefined, startedAt);
    throw deliveryError();
  }
}

function resetTokenCacheForTests() { tokenCache = null; }

module.exports = { configured, send, message, resetTokenCacheForTests };
