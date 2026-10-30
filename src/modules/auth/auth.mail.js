const nodemailer = require('nodemailer');
const env = require('../../config/env');
const configured = () => Boolean(env.SMTP_HOST && env.SMTP_FROM
  && (env.SMTP_HOST.toLowerCase() !== 'smtp.gmail.com' || (env.SMTP_USER && env.SMTP_PASS))
  && (!env.SMTP_USER || env.SMTP_PASS));
function requireConfiguration() {
  if (!configured()) throw Object.assign(new Error('Email delivery is not configured.'), {
    statusCode: 503, errorCode: 'EMAIL_NOT_CONFIGURED',
  });
}
async function sendOtp(email, code, purpose) {
  requireConfiguration();
  const transport = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    requireTLS: !env.SMTP_SECURE && (env.NODE_ENV === 'production'
      || !['localhost', '127.0.0.1', '::1'].includes(env.SMTP_HOST)),
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } } : {}),
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
  });
  const action = purpose === 'login' ? 'Xác nhận đăng nhập' : purpose === 'register' ? 'Xác nhận đăng ký' : purpose === 'verify-email' ? 'Xác minh email' : 'Đặt lại mật khẩu';
  const result = await transport.sendMail({ from: env.SMTP_FROM, to: email,
    subject: `EcoSort AI — ${action}`,
    text: `${action}: ${code}\nMã có hiệu lực ${env.OTP_TTL_SECONDS} giây và chỉ dùng một lần. Không chia sẻ mã này. Nếu bạn không yêu cầu, hãy bỏ qua email.`,
  });
  if (!result.accepted?.length || result.rejected?.length) {
    throw new Error('SMTP did not accept the recipient.');
  }
}
module.exports = { configured, requireConfiguration, sendOtp };
