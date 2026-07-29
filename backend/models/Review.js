'use strict';
const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({

  booking:   { type: mongoose.Schema.Types.ObjectId, ref: 'Booking',  required: true },
  listing:   { type: mongoose.Schema.Types.ObjectId, ref: 'Listing',  required: true },
  reviewer:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',     required: true },
  reviewee:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',     required: true },

  // ── Review type ───────────────────────────────────────────────────────────
  type: {
    type: String,
    enum: ['renter_to_owner', 'owner_to_renter', 'renter_to_rider', 'owner_to_rider'],
    required: true,
  },

  // ── Ratings ───────────────────────────────────────────────────────────────
  rating: {
    type: Number, required: true,
    min: [1, 'Rating minimum is 1'], max: [5, 'Rating maximum is 5'],
  },

  // Sub-ratings (optional detailed breakdown)
  subRatings: {
    accuracy:      { type: Number, min: 1, max: 5, default: null },
    communication: { type: Number, min: 1, max: 5, default: null },
    condition:     { type: Number, min: 1, max: 5, default: null }, // item condition
    value:         { type: Number, min: 1, max: 5, default: null },
  },

  // ── Content ───────────────────────────────────────────────────────────────
  comment: {
    type: String, trim: true,
    minlength: [10, 'Review must be at least 10 characters.'],
    maxlength: [1000, 'Review cannot exceed 1000 characters.'],
    required: true,
  },

  // ── Moderation ────────────────────────────────────────────────────────────
  isPublic:  { type: Boolean, default: true },
  isFlagged: { type: Boolean, default: false },
  flagReason:{ type: String, default: null },

  // ── Owner response ────────────────────────────────────────────────────────
  ownerResponse: {
    comment: { type: String, trim: true, maxlength: 500, default: null },
    at:      { type: Date, default: null },
  },

}, { timestamps: true });

// ── Indexes ───────────────────────────────────────────────────────────────────
reviewSchema.index({ listing:  1, isPublic: 1, createdAt: -1 });
reviewSchema.index({ reviewee: 1, type: 1,     createdAt: -1 });
reviewSchema.index({ reviewer: 1, booking: 1 }, { unique: true }); // one review per booking per user

// ── Static: get average rating for a listing ─────────────────────────────────
reviewSchema.statics.getListingStats = async function (listingId) {
  const result = await this.aggregate([
    { $match: { listing: new mongoose.Types.ObjectId(listingId), isPublic: true, type: 'renter_to_owner' } },
    { $group: {
        _id: '$listing',
        avgRating:  { $avg: '$rating' },
        totalCount: { $sum: 1 },
        breakdown:  {
          $push: {
            rating:        '$rating',
            accuracy:      '$subRatings.accuracy',
            communication: '$subRatings.communication',
            condition:     '$subRatings.condition',
            value:         '$subRatings.value',
          }
        }
    }},
  ]);
  if (!result.length) return { avgRating: 0, totalCount: 0 };
  const { avgRating, totalCount } = result[0];
  return {
    avgRating: Math.round(avgRating * 10) / 10,
    totalCount,
  };
};

// ── Static: get average rating for a user ────────────────────────────────────
reviewSchema.statics.getUserStats = async function (userId, type) {
  const match = { reviewee: new mongoose.Types.ObjectId(userId), isPublic: true };
  if (type) match.type = type;
  const result = await this.aggregate([
    { $match: match },
    { $group: { _id: '$reviewee', avgRating: { $avg: '$rating' }, totalCount: { $sum: 1 } } },
  ]);
  if (!result.length) return { avgRating: 0, totalCount: 0 };
  return {
    avgRating: Math.round(result[0].avgRating * 10) / 10,
    totalCount: result[0].totalCount,
  };
};

module.exports = mongoose.model('Review', reviewSchema);
