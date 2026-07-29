'use strict';
/**
 * Test the most recent booking that has both delivery + return photos.
 * No booking ID needed — finds it automatically.
 *   node scripts/test-latest-comparison.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected\n');
  const InspectionReport = require('../models/InspectionReport');
  const { comparePhotos } = require('../utils/geminiVision');

  // Find bookings that have a RETURN report, newest first
  const returns = await InspectionReport.find({ type: 'return' }).sort({ submittedAt: -1 }).limit(10).lean();

  let picked = null;
  for (const r of returns) {
    const delivery = await InspectionReport.findOne({ booking: r.booking, type: 'delivery' }).lean();
    if (delivery) { picked = { delivery, ret: r }; break; }
  }

  if (!picked) { console.log('❌ No booking found with BOTH delivery and return photos.'); await mongoose.disconnect(); return; }

  const { delivery, ret } = picked;
  console.log('─'.repeat(64));
  console.log(`Testing booking: ${ret.booking}`);
  console.log(`DELIVERY: ${delivery.photos?.length || 0} photo(s)`);
  (delivery.photos || []).forEach((p, i) => console.log(`   [${i}] ${p.url}`));
  console.log(`RETURN:   ${ret.photos?.length || 0} photo(s)`);
  (ret.photos || []).forEach((p, i) => console.log(`   [${i}] ${p.url}`));
  console.log('─'.repeat(64));

  const dUrls = (delivery.photos || []).map(p => p.url).filter(Boolean);
  const rUrls = (ret.photos || []).map(p => p.url).filter(Boolean);

  console.log('\n⏳ Running Gemini comparison…\n');
  try {
    const { analysis, raw } = await comparePhotos(dUrls, rUrls, 'delivery to the renter', 'return');
    if (!analysis) {
      console.log('❌ No parseable JSON. Raw start:', JSON.stringify(raw).slice(0, 500));
    } else {
      console.log('✅ Result:');
      console.log(`   hasDamage           : ${analysis.hasDamage}`);
      console.log(`   damageDelta         : ${analysis.damageDelta}`);
      console.log(`   recommendedDeduction: Rs ${analysis.recommendedDeduction}`);
      console.log(`   summary             : ${analysis.summary}`);
      (analysis.newIssues || []).forEach(i => console.log(`     • [${i.severity}] ${i.type}: ${i.description}`));
    }
  } catch (e) {
    console.log(`❌ Threw: ${e.message}`);
  }
  console.log('─'.repeat(64));
  await mongoose.disconnect();
  console.log('Done.');
}
main().catch(e => { console.error(e); process.exit(1); });
