'use strict';
/**
 * Decode HTML-escaped settings text — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * The xssClean middleware escapes incoming strings, so CMS copy accumulated in
 * the DB as "Pakistan&#x27;s ...". The API now decodes on read, but repeated
 * save cycles can double-escape ("&amp;#x27;"), so this normalises what's
 * already stored back to plain text.
 *
 *   node scripts/fix-encoded-settings.js --dry   → preview
 *   node scripts/fix-encoded-settings.js         → apply
 *
 * Safe to re-run.
 * ─────────────────────────────────────────────────────────────────────────────
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');
const he = require('he');
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const DRY = process.argv.includes('--dry');

const FIELDS = ['siteName', 'contactEmail', 'homeBannerText', 'aboutPageText'];

/** Decode repeatedly until it stops changing, to unwind double-escaping. */
function fullyDecode(str) {
  let prev = str, out = he.decode(str), guard = 0;
  while (out !== prev && guard++ < 5) { prev = out; out = he.decode(out); }
  return out;
}

async function main() {
  if (!MONGO_URI) { console.error('❌ MONGODB_URI not set'); process.exit(1); }
  await mongoose.connect(MONGO_URI);
  console.log(`✅ Connected${DRY ? '  (DRY RUN)' : ''}\n`);

  const Settings = require('../models/Settings');
  const s = await Settings.getSingleton();

  let changed = 0;
  for (const f of FIELDS) {
    const before = s[f];
    if (typeof before !== 'string') continue;
    const after = fullyDecode(before);
    if (after !== before) {
      console.log(`  ${f}:`);
      console.log(`    before: ${before}`);
      console.log(`    after : ${after}`);
      if (!DRY) s[f] = after;
      changed++;
    }
  }

  if (!changed) console.log('Nothing to fix — all settings text is already plain.');
  else if (DRY)  console.log(`\n${changed} field(s) would be fixed. Re-run without --dry to apply.`);
  else { await s.save(); console.log(`\n✅ Fixed ${changed} field(s).`); }

  await mongoose.disconnect();
  console.log('Done.');
}
main().catch(e => { console.error(e); process.exit(1); });
