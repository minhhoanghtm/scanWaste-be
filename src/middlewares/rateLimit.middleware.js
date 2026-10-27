const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const isTest = env.NODE_ENV === 'test';

/**
 * General API Rate Limiter
 * Restricts excessive API traffic to protect against DDoS and scraping
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: isTest ? 100000 : 300, // 300 requests per 15 minutes per IP
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    success: false,
    message: 'Too many requests from this client, please try again after 15 minutes.',
    errors: [],
  },
  skip: () => isTest,
});

/**
 * Strict Authentication Rate Limiter
 * Prevents credential stuffing and brute-force password attacks on auth endpoints
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: isTest ? 100000 : 30, // 30 authentication attempts per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again after 15 minutes.',
    errors: [],
  },
  skip: () => isTest,
});

module.exports = {
  apiLimiter,
  authLimiter,
};
