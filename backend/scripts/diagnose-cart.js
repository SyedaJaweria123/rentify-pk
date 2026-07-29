'use strict';
/**
 * Diagnose cart checkout failures — Rentify PK  (READ-ONLY)
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows exactly what each cart line holds in the DATABASE (not what the browser
 * is showing), and runs the same checks checkout() runs — so you can see which
 * rule is failing and why.
 *
 *   node scripts/diagnose-cart.js
 *
 * Reads only. Never writes or deletes anything.
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
  line('✅ Connected to MongoDB\n');

  const CartItem = require('../models/CartItem');
  require('../models/Listing');
  require('../models/User');

  const items = await CartItem.find({})
    .populate('listing', 'title category status isDeleted createdBy')
    .populate('user', 'name email')
    .lean();

  if (!items.length) { line('Cart is empty (no CartItem docs at all).'); await mongoose.disconnect(); return; }

  line(`Found ${items.length} cart line(s) across all users.\n`);

  for (const it of items) {
    hr();
    line(`CART LINE ${it._id}`);
    line(`  user     : ${it.user?.name || '?'} (${it.user?._id})`);
    line(`  listing  : ${it.listing?.title || '—'} (owner ${it.listing?.createdBy})`);
    line(`  dates    : ${it.startDate?.toDateString()} → ${it.endDate?.toDateString()}`);
    line(`  method   : ${it.deliveryMethod}   vehicle: ${it.vehicleType || '—'}`);
    line(`  ADDRESS  : ${JSON.stringify(it.deliveryAddress)}   (length: ${(it.deliveryAddress || '').trim().length})`);
    line(`  PHONE    : ${JSON.stringify(it.deliveryPhone)}`);

    // Same checks checkout() performs
    line('\n  Checkout checks:');
    const L = it.listing;
    if (!L || L.isDeleted || L.status !== 'active') line('    ❌ listing not available');
    else line('    ✅ listing active');

    if (String(L?.createdBy) === String(it.user?._id)) line('    ❌ this is YOUR OWN listing — cannot book it');
    else line('    ✅ not your own listing');

    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
    if (it.startDate < todayStart) line('    ❌ start date is in the past');
    else line('    ✅ dates not in the past');

    if (it.deliveryMethod === 'delivery') {
      const addrLen = (it.deliveryAddress || '').trim().length;
      if (addrLen < 10) line(`    ❌ ADDRESS TOO SHORT / EMPTY in DB (needs 10+, has ${addrLen})  ← likely your problem`);
      else line(`    ✅ address ok (${addrLen} chars)`);

      const phoneOk = /^03\d{9}$/.test(String(it.deliveryPhone || '').trim());
      if (!phoneOk) line(`    ❌ phone invalid in DB (needs 03XXXXXXXXX, has ${JSON.stringify(it.deliveryPhone)})`);
      else line('    ✅ phone ok');
    } else {
      line('    ℹ️ self-pickup — no address/phone needed');
    }
    line('');
  }

  hr();
  line('If ADDRESS shows null/"" above but your browser shows text, the address');
  line('was never saved to the server — apply the cart fix and reload the page.');
  hr();

  await mongoose.disconnect();
  line('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
