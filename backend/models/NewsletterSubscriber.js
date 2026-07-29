'use strict';
/**
 * NewsletterSubscriber Model — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Real storage for the footer newsletter signup form (previously just faked
 * a success message client-side with a TODO comment — nothing was ever
 * saved). One document per email; resubscribing after an unsubscribe just
 * flips `unsubscribed` back rather than creating a duplicate row.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const mongoose = require('mongoose');

const newsletterSubscriberSchema = new mongoose.Schema(
  {
    email: {
      type: String, required: true, unique: true, trim: true, lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'],
    },
    source:       { type: String, default: 'footer' }, // where they signed up from
    unsubscribed: { type: Boolean, default: false },
    subscribedAt:   { type: Date, default: Date.now },
    unsubscribedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.NewsletterSubscriber
  || mongoose.model('NewsletterSubscriber', newsletterSubscriberSchema);
