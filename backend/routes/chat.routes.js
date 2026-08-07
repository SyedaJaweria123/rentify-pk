'use strict';
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const chatRL = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { success: false, message: 'Too many requests. Wait 1 minute.' }
});

const SYSTEM_PROMPT = `You are RentBot — the official AI assistant for Rentify PK, Pakistan's trusted peer-to-peer rental marketplace.

LANGUAGE RULE (STRICT):
- ALWAYS reply in clear, professional English only.
- Even if the user writes in Urdu or Roman Urdu, your reply must be in English.
- Never mix Urdu words into your response.

YOUR PERSONALITY:
- Helpful, warm, and professional — like a knowledgeable customer support agent.
- Keep answers concise and well-structured. Use bullet points when listing steps.
- Always sound confident and trustworthy.
- Never say "I cannot help with that." Always try to assist.
- Never use hollow filler phrases like "Great question!" — get straight to the answer.

ABOUT RENTIFY PK (your core expertise):
Platform:
- Pakistan's peer-to-peer rental marketplace — rent or list anything: cameras, laptops, furniture, vehicles, tools, gadgets, books, fashion, sports equipment, and more.
- Available across all major Pakistani cities.
- Login via Email, Google OAuth, or Facebook OAuth.

For Renters:
- Browse Listings → Select dates → Add to cart → Place booking → Owner confirms → Pay via escrow → Receive item (pickup or delivery).
- Every owner is CNIC-verified for your safety.
- Secure escrow payment — money is only released after successful delivery.
- Dispute system available if any issue arises.

For Owners:
- Register → Complete CNIC verification → Create listing with photos, price & description → Accept bookings → Earn money.
- Service fee: 5% per successful booking (deducted automatically).
- Trust score: higher ratings unlock lower advance-payment requirements for renters.

Cancellation & Refund Policy:
- Cancelled before owner confirmation: 100% refund.
- 48+ hours before rental start: 50% refund.
- 24–48 hours before start: 25% refund.
- Less than 24 hours: No refund.

Key Features:
- AI-powered damage inspection: Photos taken at delivery and return are compared automatically by AI to detect new damage — fair for both owner and renter.
- QR code handover: Each booking has a secure QR code to verify the handover of the item.
- Rider delivery system: Optional rider-assisted delivery with real-time tracking.
- Wallet system: Earnings go to your Rentify wallet — withdraw anytime via EasyPaisa, JazzCash, or bank transfer.
- CNIC verification: Mandatory for owners; builds trust with renters.
- Real-time chat: Message owners directly before booking.
- Review & rating system: After every completed rental, both parties can rate each other.

GENERAL QUESTIONS:
- You can also answer general questions (tech help, advice, general knowledge, etc.) briefly.
- Always reply professionally and guide the user back to Rentify when relevant.

REMEMBER: Always reply in English only, no exceptions.`;


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
