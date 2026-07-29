'use strict';
/**
 * RiderAssignment Model — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Assigns a rider to deliver an item to the renter (type 'delivery') or collect
 * it back (type 'return'). Tracks lifecycle, pickup/delivery photo evidence and
 * QR-based handover verification with geo-stamp.
 *
 * Indexes: booking, rider, status
 * ─────────────────────────────────────────────────────────────────────────────
 */
const mongoose = require('mongoose');

const ASSIGNMENT_TYPES  = ['delivery', 'return'];
const ASSIGNMENT_STATUS = ['assigned', 'accepted', 'declined', 'picked_up', 'delivered', 'completed', 'cancelled'];

const mediaSchema = new mongoose.Schema(
  {
    url:      { type: String, required: true },
    publicId: { type: String, required: true },
  },
  { _id: false }
);

const riderAssignmentSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    rider:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type:    { type: String, enum: ASSIGNMENT_TYPES, required: true },
    status:  { type: String, enum: ASSIGNMENT_STATUS, default: 'assigned', index: true },

    pickupAddress: { type: String, trim: true, default: '' },
    dropAddress:   { type: String, trim: true, default: '' },

    pickupEvidence:   { type: [mediaSchema], default: [] },
    deliveryEvidence: { type: [mediaSchema], default: [] },

    // QR-based handover verification
    qrCode:        { type: String, default: null },     // encrypted booking ID
    qrScannedAt:   { type: Date, default: null },
    qrScannedLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },

    estimatedPickup: { type: Date, default: null },
    acceptedAt:      { type: Date, default: null },
    pickedUpAt:      { type: Date, default: null },
    deliveredAt:     { type: Date, default: null },
    completedAt:     { type: Date, default: null },
    declinedAt:      { type: Date, default: null },
    declineReason:   { type: String, trim: true, maxlength: 200, default: '' },

    riderNotes: { type: String, trim: true, maxlength: 1000, default: '' },
    earnings:   { type: Number, default: 0, min: 0 },

    // ── Payout (24h dispute-window hold, independent of damage claims) ───────
    // A delivery assignment earns the "delivery half" of the renter's
    // vehicle-based delivery fee; a return assignment earns the other half.
    // payoutStatus tracks whether that half has actually reached the rider's
    // wallet yet — releaseRider.cron.js flips this to 'released' once the
    // 24h window clears with valid evidence and no delivery dispute.
    feeShare:     { type: String, enum: ['delivery_half', 'return_half'], default: 'delivery_half' },
    payoutStatus: { type: String, enum: ['pending', 'released', 'held', 'refused'], default: 'pending', index: true },
    payoutReleasedAt: { type: Date, default: null },
    payoutHoldReason: { type: String, default: '' },

    // ETA notification flags (send once only)
    eta10MinNotified:       { type: Boolean, default: false },
    arrivedAtOwnerNotified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

riderAssignmentSchema.index({ rider: 1, status: 1, createdAt: -1 });

// ── Lifecycle helpers ─────────────────────────────────────────────────────────
riderAssignmentSchema.methods.markPickedUp = function (evidence = []) {
  this.status = 'picked_up';
  this.pickedUpAt = new Date();
  if (evidence.length) this.pickupEvidence.push(...evidence);
  return this.save();
};

riderAssignmentSchema.methods.markDelivered = function (evidence = []) {
  this.status = 'delivered';
  this.deliveredAt = new Date();
  if (evidence.length) this.deliveryEvidence.push(...evidence);
  return this.save();
};

riderAssignmentSchema.methods.recordQrScan = function (lat, lng) {
  this.qrScannedAt = new Date();
  this.qrScannedLocation = { lat: lat ?? null, lng: lng ?? null };
  return this.save();
};

module.exports = mongoose.models.RiderAssignment
  || mongoose.model('RiderAssignment', riderAssignmentSchema);
module.exports.ASSIGNMENT_TYPES  = ASSIGNMENT_TYPES;
module.exports.ASSIGNMENT_STATUS = ASSIGNMENT_STATUS;
