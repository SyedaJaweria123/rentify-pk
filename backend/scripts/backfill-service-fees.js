'use strict';
/**
 * Backfill platform service-fee revenue — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Until now `recordPlatformFee()` was never called, so no `service_fee`
 * Transaction rows existed and the admin dashboard reported Rs 0 revenue even
 * though the fee was being deducted from every owner payout.
 *
 * This creates the missing rows for bookings that already completed, using the
 * fee that was actually charged (booking.serviceFee, falling back to the
 * escrow's rental amount × rate for older rows that predate the field).
 *
 *   node scripts/backfill-service-fees.js --dry     → preview only, writes nothing
 *   node scripts/backfill-service-fees.js           → actually create the rows
 *
 * Safe to re-run: bookings that already have a service_fee row are skipped.
 * ─────────────────────────────────────────────────────────────────────────────
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const DRY = process.argv.includes('--dry');

async function main() {
  if (!MONGO_URI) { console.error('❌ MONGODB_URI not set in .env'); process.exit(1); }
  await mongoose.connect(MONGO_URI);
  console.log(`✅ Connected to MongoDB${DRY ? '  (DRY RUN — nothing will be written)' : ''}\n`);

  const { Booking } = require('../models/Booking');
  const { Transaction } = require('../models/Transaction');
  const Escrow = require('../models/Escrow');
  require('../models/Listing');
  require('../models/User');

  const RATE = Number(process.env.SERVICE_FEE_RATE || 0.05);

  // Only bookings that actually settled — pending/cancelled ones never earned a fee.
  const bookings = await Booking.find({ status: 'completed' })
    .select('_id serviceFee subtotal completedAt createdAt')
    .sort({ completedAt: 1, createdAt: 1 })
    .lean();

  console.log(`Found ${bookings.length} completed booking(s).\n`);

  let created = 0, skipped = 0, zero = 0, total = 0;

  for (const b of bookings) {
    const existing = await Transaction.findOne({ booking: b._id, type: 'service_fee' }).select('_id').lean();
    if (existing) { skipped++; continue; }

    // Prefer the fee stored on the booking; fall back to escrow × rate.
    let fee = Number(b.serviceFee) || 0;
    if (!fee) {
      const escrow = await Escrow.findOne({ booking: b._id }).select('rentalAmount').lean();
      if (escrow?.rentalAmount) fee = Math.round(escrow.rentalAmount * RATE);
      else if (b.subtotal)      fee = Math.round(b.subtotal * RATE);
    }

    if (!fee || fee <= 0) { zero++; continue; }

    const when = b.completedAt || b.createdAt || new Date();
    total += fee;

    if (DRY) {
      console.log(`  would create: booking ${b._id} → Rs ${fee}  (${new Date(when).toDateString()})`);
    } else {
      // Transaction has { timestamps: true }, which overwrites any createdAt
      // passed to .create() — so insert the doc, then stamp the real date so
      // backfilled revenue lands in the month it was actually earned.
      const doc = await Transaction.create({
        user: process.env.PLATFORM_USER_ID || null,
        type: 'service_fee',
        amount: fee,
        balance: 0,
        status: 'completed',
        description: `Platform service fee for booking ${b._id}`,
        booking: b._id,
        meta: { platform: true, backfilled: true },
      });
      await Transaction.updateOne(
        { _id: doc._id },
        { $set: { createdAt: when } },
        { timestamps: false },
      );
    }
    created++;
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`${DRY ? 'Would create' : 'Created'} : ${created} service-fee row(s)`);
  console.log(`Already present : ${skipped}`);
  console.log(`No fee found    : ${zero}`);
  console.log(`Total revenue ${DRY ? 'that would be' : ''} recorded: Rs ${total}`);
  console.log('─'.repeat(60));
  if (DRY) console.log('\nRe-run without --dry to write these rows.');

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
