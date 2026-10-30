const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET?.trim()) {
  throw new Error('JWT_SECRET must be configured in production');
}

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 5000,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/waste_classification',
  JWT_SECRET: process.env.JWT_SECRET || 'default_secret_key_please_change_in_production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '15m',
  REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  REDIS_PREFIX: process.env.REDIS_PREFIX || 'scanwaste:',
  REFRESH_TTL_SECONDS: Number(process.env.REFRESH_TTL_SECONDS || 604800),
  OTP_TTL_SECONDS: Number(process.env.OTP_TTL_SECONDS || 300),
  OTP_RESEND_SECONDS: Number(process.env.OTP_RESEND_SECONDS || 60),
  OTP_SECRET: process.env.OTP_SECRET || process.env.JWT_SECRET || 'local-otp-secret-change-me',
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || '',
  GOOGLE_CLIENT_ID: (process.env.GOOGLE_CLIENT_ID || '').trim(),
  SOCIAL_PUBLIC_ORIGIN: (process.env.SOCIAL_PUBLIC_ORIGIN || 'http://localhost:5173').replace(/\/$/, ''),
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE, 10) || 5 * 1024 * 1024, // 5MB
  UPLOAD_DIR: process.env.UPLOAD_DIR || 'uploads',
  AI_SERVICE_URL: process.env.AI_SERVICE_URL || 'http://127.0.0.1:5005',
  AI_PROVIDER: process.env.AI_PROVIDER || 'fastapi_tflite',
  INFERENCE_TIMEOUT_MS: parseInt(process.env.INFERENCE_TIMEOUT_MS, 10) || 5000,
};

for (const field of ['REFRESH_TTL_SECONDS', 'OTP_TTL_SECONDS', 'OTP_RESEND_SECONDS']) {
  if (!Number.isSafeInteger(env[field]) || env[field] < 1) throw new Error(`${field} must be a positive integer`);
}
if (env.NODE_ENV === 'production' && !process.env.OTP_SECRET?.trim()) {
  throw new Error('OTP_SECRET must be configured in production');
}
module.exports = env;
