'use strict';
/**
 * Settings model — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * A single platform-settings document (singleton). Stores General, Commission,
 * CMS, and Security settings together so the admin Settings page reads/writes
 * one record. Use Settings.getSingleton() to fetch-or-create.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  key: { type: String, default: 'platform', unique: true },  // singleton key

  // General
  siteName:        { type: String, default: 'Rentify PK' },
  contactEmail:    { type: String, default: 'aptechsyeda@gmail.com' },
  maintenanceMode: { type: Boolean, default: false },

  // Commission
  serviceFeePercent: { type: Number, default: 5, min: 0, max: 50 },
  currency:          { type: String, default: 'PKR' },

  // CMS
  homeBannerText: { type: String, default: 'Pakistan\'s trusted peer-to-peer rental marketplace.' },
  aboutPageText:  { type: String, default: 'Rentify PK connects renters and owners across Pakistan.' },

  // Security
  ipWhitelist: [{ type: String }],   // admin IP whitelist (informational)
}, { timestamps: true });

// Fetch the singleton settings doc, creating it with defaults if missing
settingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne({ key: 'platform' });
  if (!doc) doc = await this.create({ key: 'platform' });
  return doc;
};

module.exports = mongoose.model('Settings', settingsSchema);
