'use strict';
/**
 * Newsletter Controller — Rentify PK
 * Real DB-backed subscribe (previously a client-side-only fake success).
 */
const NewsletterSubscriber = require('../models/NewsletterSubscriber');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── POST /api/newsletter/subscribe  (public) ──────────────────────────────────
const subscribe = async (req, res) => {
  try {
    const emailRaw = (req.body.email || '').trim().toLowerCase();
    const source   = req.body.source || 'footer';

    if (!emailRaw) {
      return res.status(400).json({ success: false, message: 'Please enter your email address.' });
    }
    if (!EMAIL_RE.test(emailRaw)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    const existing = await NewsletterSubscriber.findOne({ email: emailRaw });

    if (existing) {
      if (!existing.unsubscribed) {
        // Already an active subscriber — not an error, just tell them.
        return res.json({ success: true, alreadySubscribed: true, message: "You're already subscribed!" });
      }
      // Re-subscribing after a previous unsubscribe.
      existing.unsubscribed   = false;
      existing.unsubscribedAt = null;
      existing.subscribedAt   = new Date();
      await existing.save();
      return res.status(201).json({ success: true, message: 'Welcome back! You are subscribed again.' });
    }

    await NewsletterSubscriber.create({ email: emailRaw, source });
    return res.status(201).json({ success: true, message: 'Thank you for subscribing!' });
  } catch (err) {
    // Duplicate-key race (two rapid submits) — treat as already-subscribed rather than a hard error.
    if (err.code === 11000) {
      return res.json({ success: true, alreadySubscribed: true, message: "You're already subscribed!" });
    }
    console.error('[newsletter.subscribe]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to subscribe. Please try again.' });
  }
};

// ── GET /api/newsletter/unsubscribe?email=...  (public, one-click link from emails) ──
const unsubscribe = async (req, res) => {
  try {
    const email = (req.query.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ success: false, message: 'Missing email.' });

    const sub = await NewsletterSubscriber.findOne({ email });
    if (sub && !sub.unsubscribed) {
      sub.unsubscribed   = true;
      sub.unsubscribedAt = new Date();
      await sub.save();
    }
    return res.json({ success: true, message: "You've been unsubscribed." });
  } catch (err) {
    console.error('[newsletter.unsubscribe]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to unsubscribe.' });
  }
};

module.exports = { subscribe, unsubscribe };
