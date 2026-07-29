'use strict';
/**
 * Reset cached AI comparison results — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Clears the persisted `comparisonResult` (and the one-time owner-damage-notify
 * flag) on return inspection reports, so the next time "View AI Comparison" is
 * opened the comparison re-runs with the improved prompt + damage-score
 * fallback instead of serving an old, stale result.
 *
 *   node scripts/reset-comparison-cache.js              → reset ALL return reports
 *   node scripts/reset-comparison-cache.js <bookingId>  → reset just one booking
 *
 * Safe to re-run. Only touches comparisonResult + ownerDamageNotifiedAt.
 * ─────────────────────────────────────────────────────────────────────────────
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function main() {
  if (!MONGO_URI) { console.error('❌ MONGODB_URI not set in .env'); process.exit(1); }
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const InspectionReport = require('../models/InspectionReport');

  const bookingId = process.argv[2];
  // Every leg that stores a comparison — 'return' alone missed the four-point
  // legs, leaving stale results from the old delivery↔return-only prompt.
  const filter = { type: { $in: ['delivery', 'return_pickup', 'return', 'return_delivery'] } };
  if (bookingId) filter.booking = bookingId;

  const res = await InspectionReport.updateMany(filter, {
    $set: {
      comparisonResult: { hasDamage: null, damageDelta: 0, newIssues: [], summary: '', recommendedDeduction: 0, computedAt: null },
      ownerDamageNotifiedAt: null,
    },
  });

  console.log(`🔄 Reset ${res.modifiedCount} report(s)${bookingId ? ` for booking ${bookingId}` : ' (all bookings)'}.`);
  console.log('   Open "View AI Comparison" again to trigger a fresh analysis.');

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
