'use strict';
/**
 * Dispute Model — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Formal dispute between two parties (renter ↔ owner), optionally tied to a
 * damage claim. Reviewed and resolved by an assigned admin.
 *
 * Indexes: booking, raisedBy, status, adminAssigned
 * ─────────────────────────────────────────────────────────────────────────────
 */
const mongoose = require('mongoose');

const DISPUTE_STATUS     = ['open', 'under_review', 'resolved', 'closed'];
const DISPUTE_RESOLUTION = ['favor_renter', 'favor_owner', 'split', 'dismissed'];
const EVIDENCE_TYPES     = ['image', 'video', 'document'];

const evidenceSchema = new mongoose.Schema(
  {
    type:        { type: String, enum: EVIDENCE_TYPES, required: true },
    url:         { type: String, required: true },
    publicId:    { type: String, required: true },
    description: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const disputeSchema = new mongoose.Schema(
  {
    booking:     { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    damageClaim: { type: mongoose.Schema.Types.ObjectId, ref: 'DamageClaim', default: null },
    raisedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    against:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    reason:   { type: String, required: true, trim: true, maxlength: 2000 },
    evidence: { type: [evidenceSchema], default: [] },

    status:        { type: String, enum: DISPUTE_STATUS, default: 'open', index: true },
    adminAssigned: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    adminNotes:    { type: String, trim: true, default: '' },

    resolution:     { type: String, enum: [...DISPUTE_RESOLUTION, null], default: null },
    resolutionNote: { type: String, trim: true, default: '' },
    resolvedAt:     { type: Date, default: null },
    resolvedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

disputeSchema.index({ status: 1, createdAt: -1 });

// ── Helpers ───────────────────────────────────────────────────────────────────
disputeSchema.methods.assignTo = function (adminId) {
  this.adminAssigned = adminId;
  this.status = 'under_review';
  return this.save();
};

disputeSchema.methods.resolve = function ({ resolution, note, adminId }) {
  this.resolution     = resolution;          // favor_renter | favor_owner | split | dismissed
  this.resolutionNote = note || '';
  this.status         = 'resolved';
  this.resolvedAt     = new Date();
  this.resolvedBy     = adminId || null;
  return this.save();
};

module.exports = mongoose.models.Dispute
  || mongoose.model('Dispute', disputeSchema);
module.exports.DISPUTE_STATUS     = DISPUTE_STATUS;
module.exports.DISPUTE_RESOLUTION = DISPUTE_RESOLUTION;
module.exports.EVIDENCE_TYPES     = EVIDENCE_TYPES;
