'use strict';
/**
 * Cart Model — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * One document per (user, listing) pair — a renter can only have ONE cart
 * line per listing at a time (adding the same listing again just updates the
 * dates/delivery config on the existing line, rather than creating a
 * duplicate). This mirrors the real constraint that a listing can only be
 * booked for one date range per checkout — there is no "quantity" concept
 * in a rental marketplace the way there is in e-commerce.
 *
 * Each line stores everything createBooking() needs to actually create the
 * booking at checkout time: the date range, delivery method, and (for door
 * delivery) the vehicle type + address + phone. Price is NEVER stored here —
 * it's always computed live from the Listing + Settings at read time and
 * again authoritatively at checkout, so a price change never goes stale in
 * someone's cart.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
  {
    user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true, index: true },
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },

    startDate: { type: Date, required: true },
    endDate:   { type: Date, required: true },

    deliveryMethod:  { type: String, enum: ['pickup', 'delivery'], default: 'pickup' },
    vehicleType:     { type: String, enum: ['bike', 'car', 'van', null], default: null },
    deliveryAddress: { type: String, trim: true, maxlength: 300, default: null },
    deliveryPhone:   { type: String, trim: true, maxlength: 20, default: null },

    message: { type: String, trim: true, maxlength: 1000, default: null },
  },
  { timestamps: true }
);

// One cart line per (user, listing) — re-adding the same listing updates the
// existing line via upsert instead of creating a second one.
cartItemSchema.index({ user: 1, listing: 1 }, { unique: true });

module.exports = mongoose.models.CartItem || mongoose.model('CartItem', cartItemSchema);
