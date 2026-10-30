const app = require('./app');
const env = require('./config/env');
const { connectDB } = require('./config/database');

const startServer = async () => {
  // 1. Connect Database
  await connectDB();
  await require('./config/redis').getRedis();

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
    server.close(async () => {
      await require('./config/redis').closeRedis();
      await require('mongoose').disconnect();
      console.log('HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  return server;
};

if (require.main === module) {
  startServer().catch(async () => {
    console.error('Backend startup failed. Check MongoDB and Redis configuration.');
    await require('./config/redis').closeRedis();
    process.exit(1);
  });
}

module.exports = { startServer };
