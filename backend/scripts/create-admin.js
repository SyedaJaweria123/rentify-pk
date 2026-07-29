'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');

const MONGO_URI      = process.env.MONGODB_URI || process.env.MONGO_URI;
const ADMIN_EMAIL    = 'admin@rentify.pk';
const ADMIN_PASSWORD = 'Admin@1234';
const ADMIN_NAME     = 'Super Admin';

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const User = require('../models/User');

  // Delete old admin completely
  const deleted = await User.deleteOne({ email: ADMIN_EMAIL });
  console.log('🗑️  Removed old admin:', deleted.deletedCount, 'record(s)');

  // Create fresh — plain password, model pre-save hook will hash
  const admin = new User({
    name:            ADMIN_NAME,
    email:           ADMIN_EMAIL,
    password:        ADMIN_PASSWORD,
    role:            'admin',
    isActive:        true,
    isEmailVerified: true,
    cnicVerified:    true,
    isSuspended:     false,
    isLocked:        false,
    failedAttempts:  0,
    lockUntil:       null,
    phone:           '03000000000',
    provider:        'local',
  });

  await admin.save();

  // Verify it was saved correctly
  const saved = await User.findOne({ email: ADMIN_EMAIL }).select('+password');
  console.log('✅ Saved role:', saved.role);
  console.log('✅ isEmailVerified:', saved.isEmailVerified);
  console.log('✅ isActive:', saved.isActive);
  console.log('✅ provider:', saved.provider);
  console.log('✅ Password hash starts:', saved.password?.substring(0, 10));

  console.log('\n🎉 Admin ready!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📧 Email:    ' + ADMIN_EMAIL);
  console.log('🔑 Password: ' + ADMIN_PASSWORD);
  console.log('🌐 Login:    http://localhost:4200/admin/login');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
