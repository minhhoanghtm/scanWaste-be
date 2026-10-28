const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const env = require('./config/env');
const routes = require('./routes');
const notFoundMiddleware = require('./middlewares/notFound.middleware');
const errorMiddleware = require('./middlewares/error.middleware');

const helmet = require('helmet');
const { apiLimiter } = require('./middlewares/rateLimit.middleware');

const app = express();

// Security HTTP headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow mobile & web clients to load images from /uploads
    contentSecurityPolicy: false, // Allow interactive Swagger UI CDN scripts
  })
);

// Global Middlewares
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Apply rate limiter to all /api routes
app.use('/api', apiLimiter);

if (env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Serve uploaded static files
app.use('/uploads', express.static(path.resolve(process.cwd(), env.UPLOAD_DIR)));

// API Routes
app.use('/api', routes);

// 404 Handler
app.use(notFoundMiddleware);

// Centralized Error Handler
app.use(errorMiddleware);

module.exports = app;
