const app = require('./app');
const env = require('./config/env');
const { connectDB } = require('./config/database');

const startServer = async () => {
  // 1. Connect Database
  await connectDB();

  // 2. Start HTTP Server
  const server = app.listen(env.PORT, () => {
    console.log(`=============================================`);
    console.log(`🚀 ScanWaste Modular Monolith Server running`);
    console.log(`🌐 Port: ${env.PORT}`);
    console.log(`🌱 Environment: ${env.NODE_ENV}`);
    console.log(`📡 Health Check: http://localhost:${env.PORT}/api/health`);
    console.log(`=============================================`);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
    server.close(() => process.exit(1));
  });

  // Handle SIGTERM & SIGINT
  const gracefulShutdown = () => {
    console.log('\nReceived shutdown signal. Closing HTTP server...');
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  return server;
};

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
