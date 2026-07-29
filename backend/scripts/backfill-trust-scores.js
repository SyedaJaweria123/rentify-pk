'use strict';
/**
 * Backfill owner trust scores — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time (re-runnable) script that computes + caches the trust score and badge
 * for every owner. Run after deploying the trust-score feature so existing
 * owners get a badge instead of defaulting to "none".
 *
 *   node scripts/backfill-trust-scores.js
 * ─────────────────────────────────────────────────────────────────────────────
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function main() {
  if (!MONGO_URI) {
    console.error('❌ MONGODB_URI not set in .env');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const User = require('../models/User');
  const { recalculateForOwner } = require('../services/trustScore.service');

  const owners = await User.find({ role: 'owner' }).select('_id name').lean();
  console.log(`👤 Found ${owners.length} owner(s). Computing trust scores...\n`);

  let done = 0;
  const tally = { none: 0, Bronze: 0, Silver: 0, Gold: 0 };

  for (const owner of owners) {
    try {
      const result = await recalculateForOwner(owner._id);
      if (result) {
        tally[result.badge] = (tally[result.badge] || 0) + 1;
        done++;
        console.log(`  ✓ ${owner.name || owner._id}: ${result.score}/100 → ${result.badge}`);
      }
    } catch (err) {
      console.error(`  ✗ ${owner.name || owner._id}: ${err.message}`);
    }
  }

  console.log(`\n📊 Done. Updated ${done}/${owners.length} owners.`);
  console.log(`   Gold: ${tally.Gold}  |  Silver: ${tally.Silver}  |  Bronze: ${tally.Bronze}  |  none: ${tally.none}`);

  await mongoose.connection.close(false);
  console.log('🔌 Connection closed.');
  process.exit(0);
}

main().catch(async (err) => {
  console.error('❌ Backfill failed:', err.message);
  try { await mongoose.connection.close(false); } catch {}
  process.exit(1);
});
