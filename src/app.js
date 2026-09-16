const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const env = require('./config/env');
const routes = require('./routes');
const notFoundMiddleware = require('./middlewares/notFound.middleware');
const errorMiddleware = require('./middlewares/error.middleware');

const app = express();

// Global Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
