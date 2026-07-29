'use strict';
/**
 * Wishlist model — Rentify PK
 * One document per (user + listing) pair. Simple, indexed, no duplicates.
 */
const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema({
  user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
  listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
}, { timestamps: true });

// No duplicate saves for the same user+listing
wishlistSchema.index({ user: 1, listing: 1 }, { unique: true });

module.exports = mongoose.model('Wishlist', wishlistSchema);
