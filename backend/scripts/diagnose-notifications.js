'use strict';
/**
 * Diagnose missing owner notifications — Rentify PK  (READ-ONLY)
 * ─────────────────────────────────────────────────────────────────────────────
 * Checks why an owner isn't seeing review / inspection / damage notifications
 * for a given booking. Reads only — never writes or deletes anything.
 *
 *   node scripts/diagnose-notifications.js <bookingId>
 *
 * If no bookingId is passed, it lists the 10 most recent bookings so you can
 * copy the right id.
 * ─────────────────────────────────────────────────────────────────────────────
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

const line = (s = '') => console.log(s);
const hr = () => line('─'.repeat(70));

async function main() {
  if (!MONGO_URI) { console.error('❌ MONGODB_URI not set in .env'); process.exit(1); }
  await mongoose.connect(MONGO_URI);
  line('✅ Connected to MongoDB');

  const { Booking } = require('../models/Booking');
  const { Notification } = require('../models/Notification');
  const InspectionReport = require('../models/InspectionReport');
  const Review = require('../models/Review');
  const User = require('../models/User');
  // Ensure every model referenced by a .populate() below is registered on this
  // standalone connection (the app normally registers these at boot; a script
  // must require them explicitly or populate throws MissingSchemaError).
  require('../models/Listing');

  const bookingId = process.argv[2];

  // ── No id passed → show recent bookings and exit ────────────────────────────
  if (!bookingId) {
    line('\nℹ️  No bookingId passed. 10 most recent bookings:\n');
    const recent = await Booking.find({})
      .sort({ createdAt: -1 }).limit(10)
      .populate('listing', 'title')
      .populate('owner', 'name email')
      .populate('renter', 'name email')
      .lean();
    recent.forEach(b => {
      line(`  ${b._id}  | ${b.status?.padEnd(12) || '?'} | item: ${b.listing?.title || '—'}`);
      line(`     owner:  ${b.owner?.name || '?'} (${b.owner?._id})`);
      line(`     renter: ${b.renter?.name || '?'} (${b.renter?._id})`);
    });
    line('\nRun again:  node scripts/diagnose-notifications.js <bookingId>\n');
    await mongoose.disconnect();
    return;
  }

  const booking = await Booking.findById(bookingId)
    .populate('listing', 'title')
    .populate('owner', 'name email')
    .populate('renter', 'name email')
    .lean();

  if (!booking) { line(`❌ No booking found with id ${bookingId}`); await mongoose.disconnect(); return; }

  hr();
  line(`BOOKING  ${booking._id}`);
  line(`  status : ${booking.status}`);
  line(`  item   : ${booking.listing?.title || '—'}`);
  line(`  owner  : ${booking.owner?.name} (${booking.owner?._id})`);
  line(`  renter : ${booking.renter?.name} (${booking.renter?._id})`);
  line(`  renterReviewed=${booking.renterReviewed}  ownerReviewed=${booking.ownerReviewed}`);
  hr();

  // ── Reviews on this booking ─────────────────────────────────────────────────
  const reviews = await Review.find({ booking: booking._id })
    .populate('reviewer', 'name').populate('reviewee', 'name').lean();
  line(`\nREVIEWS on this booking: ${reviews.length}`);
  reviews.forEach(r => {
    line(`  • ${r.type} | ${r.rating}★ | by ${r.reviewer?.name} → for ${r.reviewee?.name} (${r.reviewee?._id})`);
  });
  if (!reviews.length) line('  (none — so no review notification would exist yet)');

  // ── Inspection reports ──────────────────────────────────────────────────────
  const reports = await InspectionReport.find({ booking: booking._id }).lean();
  line(`\nINSPECTION REPORTS: ${reports.length}`);
  reports.forEach(r => {
    line(`  • type=${r.type} | photos=${r.photos?.length || 0} | damageScore=${r.aiAnalysis?.damageScore ?? '—'}`);
    if (r.type === 'return') {
      const c = r.comparisonResult;
      line(`      comparisonResult: ${c && c.computedAt
        ? `hasDamage=${c.hasDamage} delta=${c.damageDelta} deduction=${c.recommendedDeduction} (computed ${c.computedAt})`
        : 'NOT CACHED YET (button will run live on first open)'}`);
      line(`      ownerDamageNotifiedAt: ${r.ownerDamageNotifiedAt || 'never'}`);
    }
  });

  // ── Notifications for the OWNER (all, then this-booking) ─────────────────────
  const ownerId = booking.owner?._id;
  const allOwnerNotifs = await Notification.find({ recipient: ownerId })
    .sort({ createdAt: -1 }).limit(30).lean();

  line(`\nOWNER NOTIFICATIONS (latest 30 total): ${allOwnerNotifs.length}`);
  const byType = {};
  allOwnerNotifs.forEach(n => { byType[n.type] = (byType[n.type] || 0) + 1; });
  line(`  types: ${JSON.stringify(byType)}`);

  const thisBooking = allOwnerNotifs.filter(n => String(n.meta?.bookingId) === String(booking._id));
  line(`\n  ↳ notifications tied to THIS booking: ${thisBooking.length}`);
  thisBooking.forEach(n => {
    line(`     • [${n.type}] "${n.title}" | read=${n.isRead} | ${n.createdAt}`);
  });

  // ── Verdict ─────────────────────────────────────────────────────────────────
  hr();
  line('VERDICT');
  const hasReviewNotif = allOwnerNotifs.some(n => n.type === 'review_received' && String(n.meta?.bookingId) === String(booking._id));
  const hasDamageNotif = allOwnerNotifs.some(n => n.type === 'dispute_opened' && String(n.meta?.bookingId) === String(booking._id));
  const renterReviewed = reviews.some(r => r.type === 'renter_to_owner');
  const ret = reports.find(r => r.type === 'return');

  line(`  review notification present : ${hasReviewNotif ? '✅ yes' : '❌ NO'}${!renterReviewed ? '  (renter never left a renter→owner review)' : ''}`);
  line(`  damage notification present : ${hasDamageNotif ? '✅ yes' : '❌ NO'}${ret?.comparisonResult?.hasDamage === false ? '  (comparison found NO damage → no notif by design)' : ''}`);
  if (ret && !ret.comparisonResult?.computedAt) {
    line('  note: return comparison has not been cached yet — open "View AI Comparison" once so it runs and (if damage) notifies the owner.');
  }
  hr();

  await mongoose.disconnect();
  line('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
