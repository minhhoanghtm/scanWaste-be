const nodemailer = require('nodemailer');
const env = require('../../config/env');
const gmailApi = require('./auth.mail.gmail-api');

// Do not include recipient addresses, OTPs, credentials or provider response bodies in logs.
// Those can contain personal data or secrets and are not needed to operate the service.
function logDeliveryFailure(provider, purpose, category) {
  console.error('[OTP] Email delivery failed', { provider, purpose, category });
}

const configured = () => env.EMAIL_PROVIDER === 'brevo'
  ? Boolean(env.BREVO_API_KEY && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.BREVO_SENDER_EMAIL))
  : env.EMAIL_PROVIDER === 'gmail_api' ? gmailApi.configured()
  : env.EMAIL_PROVIDER === 'smtp' && Boolean(env.SMTP_HOST && env.SMTP_FROM
  && (env.SMTP_HOST.toLowerCase() !== 'smtp.gmail.com' || (env.SMTP_USER && env.SMTP_PASS))
  && (!env.SMTP_USER || env.SMTP_PASS));
function requireConfiguration() {
  if (!configured()) throw Object.assign(new Error('Email delivery is not configured.'), {
    statusCode: 503, errorCode: 'EMAIL_NOT_CONFIGURED',
  });
}
async function sendOtp(email, code, purpose) {
  requireConfiguration();
  const action = purpose === 'login' ? 'Xác nhận đăng nhập' : purpose === 'register' ? 'Xác nhận đăng ký' : purpose === 'verify-email' ? 'Xác minh email' : 'Đặt lại mật khẩu';
  const subject = `EcoSort AI — ${action}`;
  const text = `${action}: ${code}\nMã có hiệu lực ${env.OTP_TTL_SECONDS} giây và chỉ dùng một lần. Không chia sẻ mã này. Nếu bạn không yêu cầu, hãy bỏ qua email.`;
  const html = `<p>${action}: <strong>${code}</strong></p><p>Mã có hiệu lực ${env.OTP_TTL_SECONDS} giây và chỉ dùng một lần. Không chia sẻ mã này.</p><p>Nếu bạn không yêu cầu, hãy bỏ qua email.</p>`;
  if (env.EMAIL_PROVIDER === 'gmail_api') {
    return gmailApi.send({ to: email, subject, text, html });
  }
  if (env.EMAIL_PROVIDER === 'brevo') {
    // HTTPS works on hosting plans that block outbound SMTP. Never log provider responses or OTPs.
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ sender: { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME },
          to: [{ email }], subject, textContent: text }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Rejected');
      const result = await response.json();
      if (typeof result.messageId !== 'string' || !result.messageId) throw new Error('Missing acknowledgement');
      return;
    } catch (err) {
      logDeliveryFailure('brevo', purpose, err?.name === 'TimeoutError' ? 'timeout' : 'rejected_or_network');
      throw Object.assign(new Error('Email provider did not accept the message. Please retry.'), {
        statusCode: 503, errorCode: 'EMAIL_DELIVERY_UNAVAILABLE',
      });
    }
  }
  try {
    const transport = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      requireTLS: !env.SMTP_SECURE && (env.NODE_ENV === 'production'
        || !['localhost', '127.0.0.1', '::1'].includes(env.SMTP_HOST)),
      ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } } : {}),
      connectionTimeout: Math.min(5000, env.EMAIL_SEND_TIMEOUT_MS),
      greetingTimeout: Math.min(5000, env.EMAIL_SEND_TIMEOUT_MS), socketTimeout: env.EMAIL_SEND_TIMEOUT_MS,
    });
    const result = await transport.sendMail({ from: env.SMTP_FROM, to: email, subject, text });
    if (!result.accepted?.length || result.rejected?.length) throw new Error('SMTP did not accept the recipient.');
  } catch (err) {
    logDeliveryFailure('smtp', purpose, err?.code === 'ETIMEDOUT' ? 'timeout' : 'rejected_or_network');
    throw Object.assign(new Error('Email provider did not accept the message. Please retry.'), {
      statusCode: 503, errorCode: 'EMAIL_DELIVERY_UNAVAILABLE',
    });
  }
}
module.exports = { configured, requireConfiguration, sendOtp };
