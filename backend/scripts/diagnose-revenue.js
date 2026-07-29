'use strict';
/**
 * Diagnose service-fee revenue — Rentify PK  (READ-ONLY)
 * ─────────────────────────────────────────────────────────────────────────────
 * Explains why admin revenue is still Rs 0: shows how many service_fee rows
 * exist, and for each completed booking whether a fee can be derived from
 * booking.serviceFee / escrow / subtotal.
 *
 *   node scripts/diagnose-revenue.js
 * ─────────────────────────────────────────────────────────────────────────────
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function main() {
  if (!MONGO_URI) { console.error('❌ MONGODB_URI not set in .env'); process.exit(1); }
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const { Booking } = require('../models/Booking');
  const { Transaction } = require('../models/Transaction');
  const Escrow = require('../models/Escrow');

  const RATE = Number(process.env.SERVICE_FEE_RATE || 0.05);
  console.log(`SERVICE_FEE_RATE = ${RATE}\n`);

  // Existing service_fee rows
  const feeRows = await Transaction.find({ type: 'service_fee' }).lean();
  const feeTotal = feeRows.reduce((s, r) => s + (r.amount || 0), 0);
  console.log(`Existing service_fee transactions: ${feeRows.length}  (total Rs ${feeTotal})`);
  const completedFee = feeRows.filter(r => r.status === 'completed');
  console.log(`  ↳ with status 'completed': ${completedFee.length}  (Rs ${completedFee.reduce((s,r)=>s+(r.amount||0),0)})`);
  if (feeRows.length && completedFee.length !== feeRows.length) {
    console.log(`  ⚠️  Some rows are NOT 'completed' — admin only counts completed ones.`);
    console.log(`      statuses: ${JSON.stringify(feeRows.reduce((a,r)=>{a[r.status]=(a[r.status]||0)+1;return a;},{}))}`);
  }

  console.log('\n' + '─'.repeat(64));

  // Completed bookings and derivable fees
  const bookings = await Booking.find({ status: 'completed' })
    .select('_id serviceFee subtotal status').lean();
  console.log(`Completed bookings: ${bookings.length}\n`);

  let derivable = 0, noFee = 0, potential = 0;
  for (const b of bookings) {
    const hasRow = feeRows.some(r => String(r.booking) === String(b._id));
    let fee = Number(b.serviceFee) || 0;
    let src = 'booking.serviceFee';
    if (!fee) {
      const esc = await Escrow.findOne({ booking: b._id }).select('rentalAmount').lean();
      if (esc?.rentalAmount) { fee = Math.round(esc.rentalAmount * RATE); src = 'escrow×rate'; }
      else if (b.subtotal)   { fee = Math.round(b.subtotal * RATE);      src = 'subtotal×rate'; }
      else src = 'none';
    }
    if (fee > 0) { derivable++; if (!hasRow) potential += fee; }
    else noFee++;
    console.log(`  ${b._id} | serviceFee=${b.serviceFee ?? '—'} subtotal=${b.subtotal ?? '—'} → fee Rs ${fee} (${src}) ${hasRow ? '[already recorded]' : ''}`);
  }

  console.log('\n' + '─'.repeat(64));
  console.log(`Bookings with a derivable fee : ${derivable}`);
  console.log(`Bookings with NO fee at all   : ${noFee}`);
  console.log(`Revenue that backfill WOULD add: Rs ${potential}`);
  console.log('─'.repeat(64));
  if (potential > 0) console.log('\n→ Run:  node scripts/backfill-service-fees.js');
  else if (feeRows.length === 0 && bookings.length === 0) console.log('\n→ No completed bookings yet — complete one, then revenue will appear.');
  else if (feeRows.length && completedFee.length === feeRows.length) console.log('\n→ Rows exist and are completed. If dashboard still shows 0, restart the backend / hard-refresh.');

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
