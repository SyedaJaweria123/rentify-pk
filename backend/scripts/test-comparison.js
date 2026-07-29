'use strict';
/**
 * Test a real damage comparison — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Pulls the delivery + return photos of an actual booking and runs the SAME
 * comparePhotos() the app uses, printing the full result. This proves whether
 * Gemini is (a) reachable, (b) reading the images, and (c) detecting the damage
 * you can see — separately from the quota/caching layers.
 *
 *   node scripts/test-comparison.js <bookingId>
 * ─────────────────────────────────────────────────────────────────────────────
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function main() {
  const bookingId = process.argv[2];
  if (!bookingId) { console.log('Usage: node scripts/test-comparison.js <bookingId>'); return; }
  if (!MONGO_URI) { console.error('❌ MONGODB_URI not set'); process.exit(1); }

  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected\n');

  const InspectionReport = require('../models/InspectionReport');
  const { comparePhotos } = require('../utils/geminiVision');

  const [delivery, ret] = await Promise.all([
    InspectionReport.findOne({ booking: bookingId, type: 'delivery' }).lean(),
    InspectionReport.findOne({ booking: bookingId, type: 'return' }).lean(),
  ]);

  console.log('─'.repeat(64));
  console.log('DELIVERY report:', delivery ? `${delivery.photos?.length || 0} photo(s)` : '❌ MISSING');
  (delivery?.photos || []).forEach((p, i) => console.log(`   [${i}] ${p.url}`));
  console.log('RETURN report:  ', ret ? `${ret.photos?.length || 0} photo(s)` : '❌ MISSING');
  (ret?.photos || []).forEach((p, i) => console.log(`   [${i}] ${p.url}`));
  console.log('─'.repeat(64));

  if (!delivery || !ret) {
    console.log('\n⚠️  Both delivery and return reports are needed to compare.');
    await mongoose.disconnect();
    return;
  }

  const dUrls = (delivery.photos || []).map(p => p.url).filter(Boolean);
  const rUrls = (ret.photos || []).map(p => p.url).filter(Boolean);

  console.log('\n⏳ Running Gemini comparison (this makes a live API call)…\n');
  try {
    const { analysis, raw } = await comparePhotos(dUrls, rUrls, 'delivery to the renter', 'return');
    if (!analysis) {
      console.log('❌ Gemini returned no parseable JSON. Raw response start:');
      console.log(JSON.stringify(raw).slice(0, 500));
    } else {
      console.log('✅ Comparison result:');
      console.log(`   hasDamage           : ${analysis.hasDamage}`);
      console.log(`   damageDelta (0-100) : ${analysis.damageDelta}`);
      console.log(`   recommendedDeduction: Rs ${analysis.recommendedDeduction}`);
      console.log(`   summary             : ${analysis.summary}`);
      if (analysis.newIssues?.length) {
        console.log(`   newIssues:`);
        analysis.newIssues.forEach(i => console.log(`     • [${i.severity}] ${i.type} @ ${i.location || '—'}: ${i.description}`));
      }
      console.log('\n   If hasDamage is false but you SEE damage in the return photo above,');
      console.log('   open the photo URLs in a browser — a broken/blank image is the usual cause.');
    }
  } catch (e) {
    console.log(`❌ Comparison threw: ${e.message}`);
    console.log('   429 = quota (wait a minute); "no readable images" = a photo URL is broken.');
  }

  console.log('─'.repeat(64));
  await mongoose.disconnect();
  console.log('Done.');
}
main().catch(e => { console.error(e); process.exit(1); });
