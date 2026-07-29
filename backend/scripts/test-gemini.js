'use strict';
/**
 * Test the Gemini Vision connection — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Inspections were silently producing no damage score because every caller
 * wraps the Gemini call in .catch(). This hits the API directly and prints the
 * real response, so a bad key / exhausted quota / wrong model name is obvious.
 *
 *   node scripts/test-gemini.js
 * ─────────────────────────────────────────────────────────────────────────────
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const KEY = process.env.GEMINI_API_KEY;
const MODELS = (process.env.GEMINI_VISION_MODELS
  || 'gemini-2.5-flash,gemini-2.0-flash').split(',').map(s => s.trim());

async function main() {
  console.log('─'.repeat(64));
  if (!KEY || KEY === 'YOUR_GEMINI_API_KEY') {
    console.log('❌ GEMINI_API_KEY is missing or still the placeholder.');
    console.log('   Add a real key to backend/.env:  GEMINI_API_KEY=...');
    console.log('   Get one at https://aistudio.google.com/apikey');
    console.log('─'.repeat(64));
    return;
  }
  console.log(`✅ Key present — length ${KEY.length}, starts "${KEY.slice(0, 6)}…"`);
  console.log(`   Models to try: ${MODELS.join(', ')}\n`);

  for (const model of MODELS) {
    process.stdout.write(`  ${model.padEnd(26)} → `);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Reply with exactly: OK' }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 16 },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        console.log(`❌ HTTP ${res.status}`);
        console.log(`     ${json?.error?.message || JSON.stringify(json).slice(0, 200)}`);
        continue;
      }
      const text = json?.candidates?.[0]?.content?.parts?.map(p => p.text).join('').trim();
      console.log(`✅ works — replied "${text}"`);
    } catch (e) {
      console.log(`❌ ${e.message}`);
    }
  }

  console.log('\n' + '─'.repeat(64));
  console.log('If every model failed:');
  console.log('  • "API key not valid"        → regenerate the key in AI Studio');
  console.log('  • "quota" / "RESOURCE_EXHAUSTED" → free tier used up, wait or upgrade');
  console.log('  • "models/... is not found"  → model name changed; set');
  console.log('                                 GEMINI_VISION_MODELS in .env');
  console.log('─'.repeat(64));
}

main().catch(e => { console.error(e); process.exit(1); });
