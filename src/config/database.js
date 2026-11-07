const mongoose = require('mongoose');
const dns = require('dns');
const env = require('./env');

const connectDB = async () => {
  try {
    // Khắc phục lỗi ECONNREFUSED khi query DNS SRV MongoDB Atlas trên router / Windows DNS
    if (env.MONGODB_URI && env.MONGODB_URI.startsWith('mongodb+srv://')) {
      try {
        dns.setServers(['8.8.8.8', '1.1.1.1']);
      } catch (dnsErr) {
        // Bỏ qua nếu môi trường không cho phép thay đổi DNS servers
      }
    }

    const conn = await mongoose.connect(env.MONGODB_URI);

    console.log(`[Database] MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);

    mongoose.connection.on('error', (err) => {
      console.error(`[Database] MongoDB connection error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[Database] MongoDB disconnected');
    });

    return conn;
  } catch (error) {
    console.error(`[Database] Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = { connectDB };
