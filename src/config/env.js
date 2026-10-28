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
  GOOGLE_CLIENT_ID: (process.env.GOOGLE_CLIENT_ID || '').trim(),
  SOCIAL_PUBLIC_ORIGIN: (process.env.SOCIAL_PUBLIC_ORIGIN || 'http://localhost:5173').replace(/\/$/, ''),
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE, 10) || 5 * 1024 * 1024, // 5MB
  UPLOAD_DIR: process.env.UPLOAD_DIR || 'uploads',
  AI_SERVICE_URL: process.env.AI_SERVICE_URL || 'http://127.0.0.1:5005',
  AI_PROVIDER: process.env.AI_PROVIDER || 'fastapi_tflite',
  INFERENCE_TIMEOUT_MS: parseInt(process.env.INFERENCE_TIMEOUT_MS, 10) || 5000,
};

module.exports = env;
