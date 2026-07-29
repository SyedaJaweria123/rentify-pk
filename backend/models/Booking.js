'use strict';
const mongoose = require('mongoose');

const BOOKING_STATUS = [
  'pending',      // renter requested
  'confirmed',    // owner accepted
  'in_delivery',  // rider picked up, en route to renter
  'delivered',    // rider delivered to renter
  'active',       // rental period started
  'completed',    // rental period ended, pending review
  'cancelled',    // cancelled by renter or owner
  'rejected',     // owner rejected
  'disputed',     // under dispute
];

const PAYMENT_STATUS = ['unpaid', 'partial_paid', 'paid', 'refunded', 'partial_refund'];

const cancelPolicySchema = new mongoose.Schema({
  cancelledBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancelledAt:  { type: Date },
  reason:       { type: String, trim: true, maxlength: 500 },
  refundAmount: { type: Number, default: 0 },
}, { _id: false });

const bookingSchema = new mongoose.Schema({

  // ── Parties ────────────────────────────────────────────────────────────────
  listing:   { type: mongoose.Schema.Types.ObjectId, ref: 'Listing',  required: true },
  renter:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',     required: true },
  owner:     { type: mongoose.Schema.Types.ObjectId, ref: 'User',     required: true },

  // ── Dates ──────────────────────────────────────────────────────────────────
  startDate: { type: Date, required: true },
  endDate:   { type: Date, required: true },
  totalDays: { type: Number, required: true, min: 1 },

  // ── Pricing snapshot (at booking time) ────────────────────────────────────
  pricePerUnit:   { type: Number, required: true },
  priceUnit:      { type: String, enum: ['per_day','per_week','per_month','per_hour'], required: true },
  subtotal:       { type: Number, required: true },
  serviceFee:     { type: Number, default: 0 },     // platform fee (e.g. 5%)
  deliveryFee:    { type: Number, default: 0 },     // rider delivery charge (door delivery only)
  vehicleType:    { type: String, enum: ['bike','car','van', null], default: null }, // selected by renter
  totalAmount:    { type: Number, required: true },
  depositAmount:  { type: Number, default: 0 },

  // ── Trust-Tiered Payment (advance now, remainder on delivery) ──────────────
  // advancePercent is read off the owner's trust badge at booking time and
  // snapshotted here so a later trust-score change never alters an existing
  // booking's terms. advanceAmount is what gets charged through the payment
  // gateway; remainingAmount is collected as cash-on-delivery or wallet pay
  // when the rider hands the item over.
  advancePercent:   { type: Number, default: 100, min: 0, max: 100 },
  advanceAmount:    { type: Number, default: 0 },
  remainingAmount:  { type: Number, default: 0 },
  remainingPaymentMethod: { type: String, enum: ['cash', 'wallet', null], default: null },
  remainingCollectedAt:   { type: Date, default: null },
  remainingRefused:       { type: Boolean, default: false },

  // ── Delivery deadline (late delivery / no-show auto-refund) ────────────────
  deliveryDeadline:   { type: Date, default: null },
  lateDeliveryStrike: { type: Boolean, default: false },

  // ── Status ─────────────────────────────────────────────────────────────────
  status:        { type: String, enum: BOOKING_STATUS, default: 'pending' },
  paymentStatus: { type: String, enum: PAYMENT_STATUS, default: 'unpaid' },

  // ── Renter message ─────────────────────────────────────────────────────────
  message: { type: String, trim: true, maxlength: 1000, default: null },

  // ── Delivery ──────────────────────────────────────────────────────────────
  deliveryMethod: { type: String, enum: ['pickup', 'delivery'], default: 'pickup' },
  deliveryAddress: { type: String, trim: true, maxlength: 300, default: null },
  deliveryPhone:   { type: String, trim: true, maxlength: 20, default: null },

  // ── Timeline events ────────────────────────────────────────────────────────
  confirmedAt:  { type: Date, default: null },
  startedAt:    { type: Date, default: null },
  completedAt:  { type: Date, default: null },
  rejectedAt:   { type: Date, default: null },

  // ── Cancellation ──────────────────────────────────────────────────────────
  cancellation: { type: cancelPolicySchema, default: null },

  // ── Review flags ──────────────────────────────────────────────────────────
  renterReviewed: { type: Boolean, default: false },
  ownerReviewed:  { type: Boolean, default: false },
  // Separate from renterReviewed (which is for the owner) — tracks whether
  // the renter has rated the rider who delivered this booking. Owners can
  // rate the rider too (ownerReviewedRider), tracked independently.
  renterReviewedRider: { type: Boolean, default: false },
  ownerReviewedRider:  { type: Boolean, default: false },

  // ── Dispute ───────────────────────────────────────────────────────────────
  disputeReason:    { type: String, default: null },
  disputeRaisedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  disputeRaisedAt:  { type: Date, default: null },

  // ── Payment reference ─────────────────────────────────────────────────────
  paymentRef:    { type: String, default: null },
  paymentMethod: { type: String, default: null },

  // ── Rentify Tracking ───────────────────────────────────────────────────────
  trackingNumber:  { type: String, default: null, unique: true, sparse: true },
  riderAssignedAt: { type: Date, default: null },
  pickedUpAt:      { type: Date, default: null },
  deliveredAt:     { type: Date, default: null },

}, { timestamps: true });

// ── Indexes ───────────────────────────────────────────────────────────────────
bookingSchema.index({ renter: 1, status: 1, createdAt: -1 });
bookingSchema.index({ owner:  1, status: 1, createdAt: -1 });
bookingSchema.index({ listing: 1, startDate: 1, endDate: 1 });
bookingSchema.index({ status: 1, startDate: 1 });

// ── Virtual: duration in days ─────────────────────────────────────────────────
bookingSchema.virtual('durationDays').get(function () {
  return Math.ceil((this.endDate - this.startDate) / (1000 * 60 * 60 * 24));
});

// ── Method: can be cancelled by user ─────────────────────────────────────────
bookingSchema.methods.canBeCancelledBy = function (userId) {
  const id = String(userId);
  if (!['pending', 'confirmed'].includes(this.status)) return false;
  // Handle both populated docs and raw ObjectIds
  const renterId = String(this.renter?._id || this.renter);
  const ownerId  = String(this.owner?._id  || this.owner);
  return renterId === id || ownerId === id;
};

// ── toPublicJSON ──────────────────────────────────────────────────────────────
bookingSchema.methods.toPublicJSON = function () {
  return {
    id:             this._id,
    listing:        this.listing,
    renter:         this.renter,
    owner:          this.owner,
    startDate:      this.startDate,
    endDate:        this.endDate,
    totalDays:      this.totalDays,
    pricePerUnit:   this.pricePerUnit,
    priceUnit:      this.priceUnit,
    subtotal:       this.subtotal,
    serviceFee:     this.serviceFee,
    deliveryFee:    this.deliveryFee,
    vehicleType:    this.vehicleType,
    totalAmount:    this.totalAmount,
    depositAmount:  this.depositAmount,
    advancePercent: this.advancePercent,
    advanceAmount:  this.advanceAmount,
    remainingAmount: this.remainingAmount,
    remainingPaymentMethod: this.remainingPaymentMethod,
    remainingCollectedAt:   this.remainingCollectedAt,
    remainingRefused:       this.remainingRefused,
    deliveryDeadline:       this.deliveryDeadline,
    lateDeliveryStrike:     this.lateDeliveryStrike,
    status:         this.status,
    paymentStatus:  this.paymentStatus,
    message:        this.message,
    deliveryMethod: this.deliveryMethod,
    deliveryAddress: this.deliveryAddress,
    deliveryPhone:   this.deliveryPhone,
    confirmedAt:    this.confirmedAt,
    completedAt:    this.completedAt,
    cancellation:   this.cancellation,
    renterReviewed: this.renterReviewed,
    ownerReviewed:  this.ownerReviewed,
    renterReviewedRider: this.renterReviewedRider,
    ownerReviewedRider:  this.ownerReviewedRider,
    trackingNumber:  this.trackingNumber,
    riderAssignedAt: this.riderAssignedAt,
    pickedUpAt:      this.pickedUpAt,
    deliveredAt:     this.deliveredAt,
    paymentRef:     this.paymentRef,
    createdAt:      this.createdAt,
    updatedAt:      this.updatedAt,
  };
};

module.exports = {
  Booking: mongoose.model('Booking', bookingSchema),
  BOOKING_STATUS,
  PAYMENT_STATUS,
};
