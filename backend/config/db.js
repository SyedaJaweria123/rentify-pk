'use strict';
const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI .env mein set nahi hai');

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log(`\u2705 MongoDB: ${conn.connection.host} (${conn.connection.name})`);

    mongoose.connection.on('disconnected', () => {
      console.warn('\u26A0\uFE0F  MongoDB disconnected — reconnecting...');
    });
    mongoose.connection.on('error', (err) => {
      console.error('\u274C MongoDB error:', err.message);
    });
  } catch (err) {
    console.error('\u274C MongoDB connection failed:', err.message);
    throw err;
  }
};

module.exports = connectDB;
