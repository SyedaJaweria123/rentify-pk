'use strict';
/**
 * Gemini Vision helper — Rentify PK
 * Rental-product damage assessment + delivery↔return comparison via Gemini.
 */
// This account only has free-tier quota on gemini-2.5-flash — every other
// model tested returns limit:0 (instant 429). Falling back to a dead model just
// wasted a round-trip and could overwrite a good result with a failure, so the
// default is a single working model. Override with GEMINI_VISION_MODELS in .env
// if more models become available (e.g. after enabling billing).
const VISION_MODELS = (process.env.GEMINI_VISION_MODELS
  || 'gemini-2.5-flash').split(',').map(s => s.trim()).filter(Boolean);

const INSPECT_PROMPT = `You are a rental product inspector. Analyze these photos for:
1. Physical damage (cracks, dents, scratches, breaks)
2. Missing parts or accessories
3. Unusual wear beyond normal use
4. Overall condition assessment
Respond ONLY with strict JSON (no markdown, no prose):
{ "conditionScore": 0-100, "damageScore": 0-100, "confidenceScore": 0-100,
  "detectedIssues": [{ "type": "...", "severity": "low|medium|high", "description": "...", "location": "..." }],
  "recommendations": ["..."],
  "overallCondition": "excellent|good|fair|poor|damaged" }`;

const COMPARE_PROMPT = `You are a strict, objective rental-product damage inspector comparing two sets of photos of the SAME item, taken at two different handovers.
The FIRST set is the EARLIER handover. The SECOND set is the LATER handover.
The exact handover each set belongs to is stated with the images — use those names in your summary.

Your ONLY job: find damage that is NEW in the second (later) set — i.e. present in the later set but NOT in the earlier one. Ignore any damage already visible in the first set; that is pre-existing and not attributable to whoever held the item during this leg.

Look carefully and specifically for newly-appeared: scratches, cracks, dents, breaks, chips, tears, burns, stains, spills, ink/pen marks, scribbles, writing, discoloration, missing parts/accessories, and any deliberate defacement or vandalism. A large new pen scribble, ink mark, or stain on a clean surface is clear, significant new damage — do NOT overlook or dismiss it.

Be consistent and evidence-based. Decide as follows:
- "hasDamage": true if there is ANY clearly visible new damage in the return set that was not in the delivery set; otherwise false.
- "damageDelta" (0-100): how much worse the item is in the later set vs the earlier one. 0 = identical condition, no new damage. 10-30 = minor new marks/scratches. 40-70 = clear, noticeable new damage. 80-100 = severe/permanent damage or defacement.
- "recommendedDeduction" (0-100): fair percentage of the security deposit to withhold, proportional to the severity and permanence of the NEW damage only.
- List EACH distinct new defect as its own entry in "newIssues" with an accurate location (e.g. "front cover, upper-left").
- "summary": one or two plain sentences describing the new damage, naming the two handovers you were given, or stating clearly that no new damage was found between them.

If the two sets genuinely look the same, return hasDamage=false, damageDelta=0, empty newIssues, and say no new damage was found.

Respond ONLY with strict JSON (no markdown, no prose). Put the short fields
first and keep "newIssues" LAST, so it never crowds out the verdict:
{ "hasDamage": true|false, "damageDelta": 0-100, "recommendedDeduction": 0-100,
  "summary": "...",
  "newIssues": [{ "type": "...", "severity": "low|medium|high", "description": "...", "location": "..." }] }`;

const CNIC_OCR_PROMPT = `You are verifying and reading a Pakistani CNIC / NICOP national ID card photo.

STEP 1 — AUTHENTICITY. Decide whether this is a GENUINE physical Pakistani CNIC
card being photographed directly by a camera.
- Set "isCnic" to false if the image is NOT a Pakistani CNIC at all (a random
  photo, a person, an object, a blank/other document).
- "authenticityScore" (0-100): how confident it is a real card shot directly.
  LOWER it strongly for signs it is a copy rather than the real card, e.g.: a
  photo of a CNIC displayed on a phone/computer SCREEN (visible pixels, moiré,
  screen glare, device bezel), a PRINTOUT or PHOTOCOPY, a cropped/edited/
  tampered image, a screenshot, or a hand-drawn/obviously fake card. A clear,
  direct photo of a real card in good light should score 80-100.
- "spoofFlags": array using ONLY these values when applicable: "screen_photo",
  "printout_or_photocopy", "screenshot", "edited_or_tampered", "not_a_document",
  "too_blurry", "glare_obscured".
- "documentSide": "front" (photo + name + number), "back" (address/expiry), or "other".

STEP 2 — READ FIELDS (only from a genuine CNIC). If the image is blurry, not a
CNIC, or the number is not clearly legible, set "readable" to false rather than
guessing. For any field not clearly visible, use null — only report what you
can actually read.

Respond ONLY with strict JSON (no markdown, no prose):
{ "isCnic": true|false, "authenticityScore": 0-100, "documentSide": "front"|"back"|"other",
  "spoofFlags": ["..."], "readable": true|false,
  "cnicNumber": "12345-1234567-1" or null, "name": "..." or null, "fatherName": "..." or null,
  "dateOfBirth": "DD.MM.YYYY" or null, "dateOfIssue": "DD.MM.YYYY" or null,
  "dateOfExpiry": "DD.MM.YYYY" or null }`;

const FACE_MATCH_PROMPT = `You are comparing two photos for identity verification:
the FIRST photo is from a Pakistani CNIC (national ID card), the SECOND is a
selfie taken by the same person during signup.
Determine whether the face in the CNIC photo and the face in the selfie
appear to be the same person. Consider that CNIC photos are often older,
lower resolution, and may show the person at a different age. Be reasonably
lenient about lighting/angle/age differences, but strict about fundamentally
different facial features (face shape, eyes, nose, overall structure).
If either photo doesn't clearly show a face, set "facesDetected" to false.
Respond ONLY with strict JSON (no markdown, no prose):
{ "facesDetected": true|false, "matchScore": 0-100, "sameLikelyPerson": true|false,
  "reasoning": "one short sentence" }`;

async function fetchImageBase64(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('image fetch failed: ' + r.status);
  const mime = r.headers.get('content-type') || 'image/jpeg';
  const buf = Buffer.from(await r.arrayBuffer());
  return { data: buf.toString('base64'), mime };
}

function extractJSON(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  if (start === -1) return null;

  const end = cleaned.lastIndexOf('}');
  if (end !== -1 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* fall through to repair */ }
  }

  // The model occasionally hits the token limit mid-object, so the JSON arrives
  // truncated and JSON.parse fails — which used to surface as "no damage" even
  // when the text clearly described damage. Repair by tracking the last position
  // where the structure was balanced back to depth 1 (inside the root object),
  // i.e. a completed array element or top-level value, then closing the root.
  let s = cleaned.slice(start);
  let depthCurly = 0, depthSq = 0, inStr = false, esc = false;
  let lastBalanced = -1;   // index after a token that returns us toward the root
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depthCurly++;
    else if (ch === '}') { depthCurly--; if (depthCurly <= 1) lastBalanced = i; }
    else if (ch === '[') depthSq++;
    else if (ch === ']') { depthSq--; lastBalanced = i; }
  }

  if (lastBalanced !== -1) {
    // Keep everything through the last completed element, then close the array
    // (if newIssues was left open) and the root object.
    s = s.slice(0, lastBalanced + 1);
    // Recount to see what's still open.
    let dc = 0, ds = 0, str = false, es = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (es) { es = false; continue; }
      if (ch === '\\') { es = true; continue; }
      if (ch === '"') { str = !str; continue; }
      if (str) continue;
      if (ch === '{') dc++; else if (ch === '}') dc--;
      else if (ch === '[') ds++; else if (ch === ']') ds--;
    }
    s = s.replace(/,\s*$/, '');
    s += ']'.repeat(Math.max(0, ds)) + '}'.repeat(Math.max(0, dc));
    try { return JSON.parse(s); } catch { /* fall through */ }
  }
  return null;
}

async function callGemini(parts) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') throw new Error('GEMINI_API_KEY not configured');

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  let lastErr;

  for (const model of VISION_MODELS) {
    // The free tier allows ~20 requests/minute, and one handover fires several
    // calls at once (single-set analysis + comparison), so bursts hit 429 even
    // though the quota isn't really exhausted. Google tells us how long to wait
    // — honour it and retry rather than dropping the inspection entirely.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            // temperature 0 → as deterministic as Gemini allows, so the SAME
            // photos don't swing between "85% damage" and "0%" across runs.
            // 1024 truncated multi-issue damage reports mid-JSON (parse failed
            // → looked like "no damage"). 2048 comfortably fits several issues.
            generationConfig: { temperature: 0, topP: 0.1, maxOutputTokens: 2048 },
          }),
        });
        const json = await res.json();

        if (res.status === 429) {
          const msg = json?.error?.message || '';
          // "Please retry in 634.9ms" / "in 58.7s" — parse it, cap the wait so
          // a long backoff doesn't hang the request that's waiting on us.
          const m = msg.match(/retry in ([\d.]+)(ms|s)/i);
          let waitMs = m ? (m[2].toLowerCase() === 's' ? parseFloat(m[1]) * 1000 : parseFloat(m[1])) : 1500;
          waitMs = Math.min(Math.ceil(waitMs) + 250, 8000);
          lastErr = new Error(`Rate limited on ${model}`);
          if (attempt < 2) {
            console.warn(`[geminiVision] ${model} rate limited — retrying in ${waitMs}ms`);
            await sleep(waitMs);
            continue;
          }
          console.error(`[geminiVision] ${model} → 429 quota exceeded after retries`);
          break;   // try the next model
        }

        if (!res.ok) {
          // Log it: every caller wraps this in .catch(), so a bad key or an
          // exhausted quota was failing completely silently.
          console.error(`[geminiVision] ${model} → HTTP ${res.status}: ${json?.error?.message || 'unknown error'}`);
          lastErr = new Error(json?.error?.message || `Gemini error (HTTP ${res.status})`);
          break;   // not a rate limit — retrying won't help
        }

        const text = json?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
        return { analysis: extractJSON(text), raw: json };
      } catch (e) {
        console.error(`[geminiVision] ${model} → ${e.message}`);
        lastErr = e;
        break;
      }
    }
  }

  console.error('[geminiVision] all models failed:', lastErr?.message);
  throw lastErr || new Error('All Gemini models failed');
}

// Single-set inspection
async function analyzePhotos(photoUrls = []) {
  if (!photoUrls.length) throw new Error('No photos to analyze');
  const images = [];
  for (const u of photoUrls.slice(0, 6)) { try { images.push(await fetchImageBase64(u)); } catch (_) {} }
  if (!images.length) throw new Error('No readable images');
  const parts = [{ text: INSPECT_PROMPT }, ...images.map(i => ({ inline_data: { mime_type: i.mime, data: i.data } }))];
  return callGemini(parts);
}

// Two-set comparison (delivery vs return)
// Labels default to delivery/return so existing callers are unchanged, but any
// pair of legs can be compared — passing the real leg names matters because the
// model echoes them back in its summary ("compared to the delivery set"), which
// was wrong once pickup→delivery and return_pickup→return_delivery were added.
async function comparePhotos(deliveryUrls = [], returnUrls = [], baseLabel = 'delivery', laterLabel = 'return') {
  if (!deliveryUrls.length || !returnUrls.length) throw new Error('Both photo sets are required');
  const dImgs = [], rImgs = [];
  for (const u of deliveryUrls.slice(0, 4)) { try { dImgs.push(await fetchImageBase64(u)); } catch (_) {} }
  for (const u of returnUrls.slice(0, 4)) { try { rImgs.push(await fetchImageBase64(u)); } catch (_) {} }
  if (!dImgs.length || !rImgs.length) throw new Error('No readable images in one of the sets');

  const parts = [
    { text: COMPARE_PROMPT },
    { text: `FIRST SET — condition at ${baseLabel} (the EARLIER handover):` },
    ...dImgs.map(i => ({ inline_data: { mime_type: i.mime, data: i.data } })),
    { text: `SECOND SET — condition at ${laterLabel} (the LATER handover):` },
    ...rImgs.map(i => ({ inline_data: { mime_type: i.mime, data: i.data } })),
    { text: `Report only damage that is new in the ${laterLabel} set and absent from the ${baseLabel} set. Refer to them as "${baseLabel}" and "${laterLabel}" in your summary.` },
  ];
  return callGemini(parts);
}

// CNIC OCR — reads a base64 data URL (camera capture, not yet uploaded to
// Cloudinary), so it doesn't go through fetchImageBase64() like the other
// two functions, which expect already-hosted URLs.
async function readCNIC(base64DataUrlOrRaw, mime = 'image/jpeg') {
  if (!base64DataUrlOrRaw) throw new Error('No image provided');
  // Accept either a full "data:image/jpeg;base64,XXXX" string or raw base64.
  const commaIdx = base64DataUrlOrRaw.indexOf(',');
  const data = base64DataUrlOrRaw.startsWith('data:') && commaIdx !== -1
    ? base64DataUrlOrRaw.slice(commaIdx + 1)
    : base64DataUrlOrRaw;

  const parts = [{ text: CNIC_OCR_PROMPT }, { inline_data: { mime_type: mime, data } }];
  const { analysis } = await callGemini(parts);
  if (!analysis) throw new Error('Could not parse CNIC OCR response');
  return analysis;
}

// Face match — compares a CNIC photo against a selfie, both already
// Cloudinary-hosted URLs (uploaded by /cnic/submit before this runs).
async function faceMatch(cnicPhotoUrl, selfieUrl) {
  if (!cnicPhotoUrl || !selfieUrl) throw new Error('Both a CNIC photo and a selfie are required');
  const [cnicImg, selfieImg] = await Promise.all([
    fetchImageBase64(cnicPhotoUrl),
    fetchImageBase64(selfieUrl),
  ]);

  const parts = [
    { text: FACE_MATCH_PROMPT },
    { text: 'FIRST (CNIC photo):' },
    { inline_data: { mime_type: cnicImg.mime, data: cnicImg.data } },
    { text: 'SECOND (selfie):' },
    { inline_data: { mime_type: selfieImg.mime, data: selfieImg.data } },
  ];
  const { analysis } = await callGemini(parts);
  if (!analysis) throw new Error('Could not parse face-match response');
  return analysis;
}

module.exports = { analyzePhotos, comparePhotos, readCNIC, faceMatch };
