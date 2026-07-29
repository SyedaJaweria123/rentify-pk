'use strict';
/**
 * Diagnose four-point inspection + notifications — Rentify PK  (READ-ONLY)
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows every inspection leg for a booking, whether its comparison ran, and
 * which notifications actually reached the owner and renter.
 *
 *   node scripts/diagnose-legs.js <bookingId>
 * ─────────────────────────────────────────────────────────────────────────────
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const line = (s = '') => console.log(s);
const hr = () => line('─'.repeat(68));

async function main() {
  if (!MONGO_URI) { console.error('❌ MONGODB_URI not set'); process.exit(1); }
  await mongoose.connect(MONGO_URI);
  line('✅ Connected\n');

  const { Booking } = require('../models/Booking');
  const { Notification } = require('../models/Notification');
  const InspectionReport = require('../models/InspectionReport');
  require('../models/Listing'); require('../models/User');

  const bookingId = process.argv[2];
  if (!bookingId) { line('Usage: node scripts/diagnose-legs.js <bookingId>'); await mongoose.disconnect(); return; }

  const b = await Booking.findById(bookingId)
    .populate('owner', 'name').populate('renter', 'name').populate('listing', 'title').lean();
  if (!b) { line('❌ Booking not found'); await mongoose.disconnect(); return; }

  hr();
  line(`BOOKING ${b._id}  |  ${b.status}`);
  line(`  item   : ${b.listing?.title}`);
  line(`  owner  : ${b.owner?.name} (${b.owner?._id})`);
  line(`  renter : ${b.renter?.name} (${b.renter?._id})`);
  hr();

  const ORDER = ['pickup', 'delivery', 'return_pickup', 'return', 'return_delivery'];
  const reports = await InspectionReport.find({ booking: bookingId }).lean();
  const byType = Object.fromEntries(reports.map(r => [r.type, r]));

  line(`\nINSPECTION LEGS (${reports.length} report(s)):\n`);
  for (const t of ORDER) {
    const r = byType[t];
    if (!r) { line(`  ${t.padEnd(16)} — not captured`); continue; }
    const c = r.comparisonResult;
    line(`  ${t.padEnd(16)} ✓ ${r.photos?.length || 0} photo(s)`);
    if (c?.computedAt) {
      line(`     comparison: hasDamage=${c.hasDamage} delta=${c.damageDelta} deduction=${c.recommendedDeduction}`);
      line(`     pair=${c.comparedPair || '—'}  responsible=${c.responsibleParty || '—'}`);
    } else {
      line(`     comparison: not computed`);
    }
    line(`     ownerDamageNotifiedAt: ${r.ownerDamageNotifiedAt || 'never'}`);
  }

  // Notifications for both parties on this booking
  for (const who of ['owner', 'renter']) {
    const uid = b[who]?._id;
    const notifs = await Notification.find({ recipient: uid }).sort({ createdAt: -1 }).limit(40).lean();
    const mine = notifs.filter(n => String(n.meta?.bookingId) === String(b._id));
    line(`\n${who.toUpperCase()} notifications for this booking: ${mine.length}`);
    mine.forEach(n => {
      line(`  • [${n.type}] "${n.title}"  leg=${n.meta?.leg || '—'}  link=${n.meta?.link || '—'}`);
      line(`      ${n.createdAt}`);
    });
    if (!mine.length) line('  (none)');
  }

  hr();
  line('VERDICT');
  const damaged = ORDER.map(t => byType[t]).filter(r => r?.comparisonResult?.hasDamage);
  line(`  legs with damage: ${damaged.length}`);
  const ownerNotifs = await Notification.find({ recipient: b.owner?._id, type: 'dispute_opened' }).lean();
  const dmgNotif = ownerNotifs.filter(n => String(n.meta?.bookingId) === String(b._id));
  line(`  owner damage notification: ${dmgNotif.length ? '✅ sent' : '❌ NOT sent'}`);
  if (damaged.length && !dmgNotif.length) {
    line('  → damage exists but no notification: check ownerDamageNotifiedAt above.');
    line('    If it has a timestamp, the guard fired before the notify succeeded.');
  }
  hr();

  await mongoose.disconnect();
  line('Done.');
}
main().catch(e => { console.error(e); process.exit(1); });
