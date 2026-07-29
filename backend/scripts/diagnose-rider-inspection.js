'use strict';
/**
 * Diagnose rider-side inspections — Rentify PK  (READ-ONLY)
 * ─────────────────────────────────────────────────────────────────────────────
 * A rider uploads an evidence photo on pickup/delivery and the backend is meant
 * to turn it into an InspectionReport + AI comparison. This shows, per rider
 * assignment: what evidence was stored, whether a report was created for that
 * leg, and whether its comparison ran.
 *
 *   node scripts/diagnose-rider-inspection.js            → 5 most recent assignments
 *   node scripts/diagnose-rider-inspection.js <bookingId>
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

  const RiderAssignment  = require('../models/RiderAssignment');
  const InspectionReport = require('../models/InspectionReport');
  const { Booking }      = require('../models/Booking');
  require('../models/Listing'); require('../models/User');

  const bookingId = process.argv[2];
  const q = bookingId ? { booking: bookingId } : {};
  const assigns = await RiderAssignment.find(q)
    .sort({ createdAt: -1 }).limit(bookingId ? 20 : 5)
    .populate('rider', 'name').lean();

  if (!assigns.length) { line('No rider assignments found.'); await mongoose.disconnect(); return; }

  // Which leg each rider action should produce
  const PICKUP_LEG   = (t) => (t === 'return' ? 'return_pickup' : 'pickup');
  const DELIVER_LEG  = (t) => (t === 'return' ? 'return_delivery' : 'delivery');
  const COMPARE_BASE = { delivery: 'pickup', return_pickup: 'delivery', return: 'delivery', return_delivery: 'return_pickup' };

  for (const a of assigns) {
    hr();
    line(`ASSIGNMENT ${a._id}`);
    line(`  booking : ${a.booking}`);
    line(`  type=${a.type}  status=${a.status}  rider=${a.rider?.name || '—'}`);

    const pEv = a.pickupEvidence   || [];
    const dEv = a.deliveryEvidence || [];
    line(`  pickupEvidence  : ${pEv.length} photo(s)`);
    line(`  deliveryEvidence: ${dEv.length} photo(s)`);

    const reports = await InspectionReport.find({ booking: a.booking })
      .select('type photos comparisonResult aiAnalysis.damageScore').lean();
    const byType = Object.fromEntries(reports.map(r => [r.type, r]));

    for (const [label, ev, leg] of [
      ['PICKUP  ', pEv, PICKUP_LEG(a.type)],
      ['DELIVERY', dEv, DELIVER_LEG(a.type)],
    ]) {
      const r = byType[leg];
      line(`\n  ${label} → expected leg '${leg}'`);
      if (!ev.length) { line(`     no evidence uploaded yet — nothing to inspect`); continue; }
      if (!r) {
        line(`     ❌ NO InspectionReport created (evidence exists but report missing)`);
        continue;
      }
      line(`     ✅ report exists — ${r.photos?.length || 0} photo(s), damageScore=${r.aiAnalysis?.damageScore ?? '—'}`);
      const base = COMPARE_BASE[leg];
      if (!base) { line(`     (baseline leg — no comparison expected)`); continue; }
      if (!byType[base]) {
        line(`     ⚠️  comparison needs '${base}' report, which does not exist`);
        continue;
      }
      const c = r.comparisonResult;
      if (c?.computedAt) {
        line(`     ✅ comparison vs '${base}': hasDamage=${c.hasDamage} delta=${c.damageDelta} responsible=${c.responsibleParty || '—'}`);
      } else {
        line(`     ❌ comparison NOT computed (both reports exist — AI call likely failed)`);
      }
    }
    line('');
  }

  hr();
  line('READING THIS');
  line('  "NO InspectionReport created"  → the evidence saved but the auto-inspection');
  line('                                   never ran (check backend logs for');
  line('                                   "auto-inspection failed").');
  line('  "comparison NOT computed"      → both photo sets exist but the Gemini call');
  line('                                   failed — usually an API key/quota issue.');
  hr();

  await mongoose.disconnect();
  line('Done.');
}
main().catch(e => { console.error(e); process.exit(1); });
