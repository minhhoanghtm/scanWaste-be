
const app = require('./app');
const env = require('./config/env');
const mongoose = require('mongoose');

const { connectDB } = require('./config/database');
const redis = require('./config/redis');

const {
  scheduleVoucherReminderJob,
} = require('./modules/vouchers/voucher-reminder.service');

const startServer = async () => {
  // 1. Connect MongoDB
  await connectDB();

  // 2. Connect Redis
  await redis.getRedis();

  // 3. Start daily voucher reminder scheduler
  const voucherReminderTask = scheduleVoucherReminderJob();

  // 4. Start HTTP Server
  const server = app.listen(env.PORT, () => {
    console.log('=============================================');
    console.log('🚀 ScanWaste Modular Monolith Server running');
    console.log(`🌐 Port: ${env.PORT}`);
    console.log(`🌱 Environment: ${env.NODE_ENV}`);
    console.log(`📡 Health Check: http://localhost:${env.PORT}/api/health`);
    console.log('=============================================');
  });

  let isShuttingDown = false;

  async function closeDependencies() {
    try {
      await redis.closeRedis();
    } catch (error) {
      console.error('Redis shutdown failed:', error.message);
    }

    try {
      await mongoose.disconnect();
    } catch (error) {
      console.error('MongoDB shutdown failed:', error.message);
    }
  }

  // 5. Handle unhandled promise rejections
  const handleUnhandledRejection = (error) => {
    console.error('Unhandled Promise Rejection:', error);
    gracefulShutdown(1);
  };

  // 6. Graceful shutdown
  const gracefulShutdown = (exitCode = 0) => {
    if (isShuttingDown) return;

    isShuttingDown = true;

    console.log('\nReceived shutdown signal. Closing HTTP server...');

    // Stop the reminder scheduler
    if (voucherReminderTask) {
      voucherReminderTask.stop();
    }

    server.close(async (error) => {
      if (error) {
        console.error('HTTP server shutdown failed:', error.message);
      }

      await closeDependencies();

      console.log('HTTP server closed.');

      process.exit(exitCode);
    });
  };

  process.on('unhandledRejection', handleUnhandledRejection);
  process.on('SIGTERM', () => gracefulShutdown(0));
  process.on('SIGINT', () => gracefulShutdown(0));

  return server;
};

if (require.main === module) {
  startServer().catch(async (error) => {
    console.error(
      'Backend startup failed. Check MongoDB and Redis configuration.',
      error.message
    );

    await redis.closeRedis().catch(() => {});
    await mongoose.disconnect().catch(() => {});

    process.exit(1);
  });
}

module.exports = { startServer };
