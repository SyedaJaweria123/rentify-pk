'use strict';
/**
 * CMS Model — Rentify PK
 * Stores dynamic content: team members, testimonials, FAQs.
 * Admin can manage these via /api/cms endpoints.
 * Frontend fetches real data instead of hardcoded arrays.
 */
const mongoose = require('mongoose');

// ── Team Member Schema ────────────────────────────────────────────────────────
const teamMemberSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true, maxlength: 80 },
  role:      { type: String, required: true, trim: true, maxlength: 100 },
  city:      { type: String, trim: true, maxlength: 60 },
  bio:       { type: String, trim: true, maxlength: 500 },
  avatar:    { type: String, default: null },        // Cloudinary URL
  avatarInitials: { type: String, maxlength: 3 },    // fallback: "AH"
  order:     { type: Number, default: 0 },           // display order
  isActive:  { type: Boolean, default: true },
  linkedIn:  { type: String, default: null },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
});

// ── Testimonial Schema ────────────────────────────────────────────────────────
const testimonialSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true, maxlength: 80 },
  city:        { type: String, trim: true, maxlength: 60 },
  role:        { type: String, enum: ['Renter', 'Owner'], required: true },
  text:        { type: String, required: true, trim: true, maxlength: 600 },
  rating:      { type: Number, min: 1, max: 5, default: 5 },
  avatar:      { type: String, default: null },       // Cloudinary URL
  avatarInitials: { type: String, maxlength: 3 },
  order:       { type: Number, default: 0 },
  isActive:    { type: Boolean, default: true },
  // Optional: link to real user (for verified badge)
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
});

// ── Owner Success Story Schema ─────────────────────────────────────────────────
// Used on /become-owner page
const ownerStorySchema = new mongoose.Schema({
  name:           { type: String, required: true, trim: true, maxlength: 80 },
  city:           { type: String, trim: true, maxlength: 60 },
  itemListed:     { type: String, trim: true, maxlength: 100 },  // "Honda Civic"
  monthlyEarning: { type: Number, required: true, min: 0 },       // PKR
  avatar:         { type: String, default: null },
  avatarInitials: { type: String, maxlength: 3 },
  order:          { type: Number, default: 0 },
  isActive:       { type: Boolean, default: true },
  // Optional: link to real listing for credibility
  listingId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', default: null },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
});

const TeamMember   = mongoose.model('TeamMember',   teamMemberSchema);
const Testimonial  = mongoose.model('Testimonial',  testimonialSchema);
const OwnerStory   = mongoose.model('OwnerStory',   ownerStorySchema);

module.exports = { TeamMember, Testimonial, OwnerStory };
