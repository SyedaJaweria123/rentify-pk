'use strict';
/**
 * DamageClaim Model — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Raised by an owner against a renter when a rented item is returned damaged.
 * Flows: owner files → renter responds (accept/dispute) → admin resolves.
 * The resolved amount is what gets deducted from the renter's escrow deposit.
 *
 * Indexes: booking, owner, status
 * ─────────────────────────────────────────────────────────────────────────────
 */
const mongoose = require('mongoose');

const CLAIM_STATUS    = ['pending', 'accepted', 'disputed', 'resolved', 'rejected'];
const RENTER_RESPONSE = ['none', 'accepted', 'disputed'];

const mediaSchema = new mongoose.Schema(
  {
    url:      { type: String, required: true },
    publicId: { type: String, required: true },   // Cloudinary public_id for deletion
  },
  { _id: false }
);

const damageClaimSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    owner:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    renter:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    description:   { type: String, required: true, trim: true, maxlength: 2000 },
    photos:        { type: [mediaSchema], default: [] },
    videos:        { type: [mediaSchema], default: [] },
    estimatedCost: { type: Number, required: true, min: 1 },

    status:         { type: String, enum: CLAIM_STATUS, default: 'pending', index: true },
    renterResponse: { type: String, enum: RENTER_RESPONSE, default: 'none' },
    renterNote:     { type: String, trim: true, maxlength: 2000, default: '' },
    renterRespondedAt: { type: Date, default: null },

    adminDecision:  { type: String, trim: true, default: '' },
    adminNote:      { type: String, trim: true, maxlength: 2000, default: '' },
    resolvedAmount: { type: Number, default: null, min: 0 },
    resolvedAt:     { type: Date, default: null },
    resolvedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// ── Indexes (booking, owner, status already inline; add useful compounds) ─────
damageClaimSchema.index({ status: 1, createdAt: -1 });
damageClaimSchema.index({ renter: 1, status: 1 });

// ── Convenience instance helpers ──────────────────────────────────────────────
damageClaimSchema.methods.markRenterResponse = function (response, note = '') {
  this.renterResponse = response;                       // 'accepted' | 'disputed'
  this.renterNote = note;
  this.renterRespondedAt = new Date();
  this.status = response === 'disputed' ? 'disputed' : 'accepted';
  return this.save();
};

damageClaimSchema.methods.resolve = function ({ decision, amount, note, adminId }) {
  this.status         = decision === 'reject' ? 'rejected' : 'resolved';
  this.adminDecision  = decision;
  this.adminNote      = note || '';
  this.resolvedAmount = decision === 'reject' ? 0 : Number(amount) || 0;
  this.resolvedAt     = new Date();
  this.resolvedBy     = adminId || null;
  return this.save();
};

module.exports = mongoose.models.DamageClaim
  || mongoose.model('DamageClaim', damageClaimSchema);
module.exports.CLAIM_STATUS    = CLAIM_STATUS;
module.exports.RENTER_RESPONSE = RENTER_RESPONSE;
