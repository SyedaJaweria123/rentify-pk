'use strict';
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const chatRL = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { success: false, message: 'Too many requests. Wait 1 minute.' }
});

const SYSTEM_PROMPT = `You are RentBot — a smart, friendly AI assistant on the Rentify PK website (Pakistan's #1 peer-to-peer rental platform).

Your personality: Helpful, warm, and knowledgeable. Mix Urdu and English naturally (Roman Urdu, like Pakistanis chat).

IMPORTANT — You answer EVERYTHING:
- Answer ANY question the user asks — general knowledge, study help, advice, math, coding, current topics, casual chat, anything. Be a genuinely helpful general assistant.
- Never refuse a question just because it is not about Rentify. Always try to give a useful answer.
- You ALSO happen to be an expert on Rentify PK, so when users ask about renting, listings, bookings, etc., give detailed platform-specific help.

About Rentify PK (your special expertise):
- A marketplace where owners list items for rent (cars, cameras, furniture, gadgets, tools, gaming, sports, fashion, etc.)
- Renters find and book items from CNIC-verified owners
- Secure wallet payments, full transaction history, reviews & ratings
- Owners must complete CNIC verification before listing
- Service fee is 5% on bookings
- Cancellation refund: pending = 100%, 48h+ before start = 50%, 24-48h = 25%, under 24h = 0%
- Available in all major Pakistani cities; login via email, Google, or Facebook
- To rent: Browse Listings → pick dates → book → owner confirms → pay → pickup/delivery
- To earn: register → verify CNIC → Add Listing with photos & price → accept bookings

Always be helpful and concise. Answer in the same language the user uses (Urdu, English, or Roman Urdu).`;

// Models to try in order (fallback chain)
const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
];

const callGemini = async (model, messages, apiKey) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: messages,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
        topP: 0.9,
      }
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw { status: res.status, message: err.error?.message || res.statusText };
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Koi response nahi mila.';
};

// POST /api/chat
router.post('/', chatRL, async (req, res) => {
  try {
    const { messages } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') {
      return res.status(400).json({ 
        success: false, 
        message: 'GEMINI_API_KEY .env mein set karein.' 
      });
    }

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ success: false, message: 'Messages required.' });
    }

    // Try each model in fallback chain
    let lastError = null;
    for (const model of MODELS) {
      try {
        const reply = await callGemini(model, messages, apiKey);
        return res.status(200).json({ success: true, reply, model });
      } catch (err) {
        lastError = err;
        console.warn(`Model ${model} failed (${err.status}): ${err.message}`);
        // Only retry on 503/429, not 400/404
        if (![503, 429, 500].includes(err.status)) break;
        // Small delay before next model
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // All models failed
    const status = lastError?.status || 500;
    if (status === 429) {
      return res.status(429).json({ success: false, message: 'Rate limit. 1 minute baad try karein.' });
    }
    return res.status(503).json({ success: false, message: 'AI service temporarily unavailable. Try again.' });

  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
