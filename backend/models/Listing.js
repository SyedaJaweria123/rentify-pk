'use strict';
/**
 * Listing Model — RentAnything PK
 * Full rental listing schema with images, categories, status, and relationships.
 */
const mongoose = require('mongoose');

// ── Category Enum ─────────────────────────────────────────────────────────────
const CATEGORIES = [
  'Electronics',
  'Vehicles',
  'Furniture',
  'Tools & Equipment',
  'Sports & Outdoors',
  'Clothing & Accessories',
  'Books & Media',
  'Home Appliances',
  'Musical Instruments',
  'Photography & Video',
  'Party & Events',
  'Baby & Kids',
  'Gaming',
  'Travel & Luggage',
  'Other',
];

// ── Status Enum ───────────────────────────────────────────────────────────────
const STATUS = ['active', 'inactive', 'rented', 'deleted'];

// ── Condition Enum ────────────────────────────────────────────────────────────
const CONDITIONS = ['New', 'Like New', 'Used', 'Heavily Used'];

// ── Owner Claims ──────────────────────────────────────────────────────────────
// Self-declared quality badges the owner picks for their own listing — shown
// as trust chips on the listing page. These are honesty-based (not verified
// by Rentify), same as how a seller would describe their own item — distinct
// from cnicVerified (which IS independently verified on the User account).
const OWNER_CLAIMS = ['Well Maintained', 'Clean & Hygienic', 'On-time Delivery', 'Smoke-Free'];

// ── Image Sub-schema ──────────────────────────────────────────────────────────
const imageSchema = new mongoose.Schema({
  url:       { type: String, required: true },        // Cloudinary secure URL
  publicId:  { type: String, required: true },        // Cloudinary public_id for deletion
  width:     { type: Number },
  height:    { type: Number },
  format:    { type: String },
}, { _id: false });

// ── Main Listing Schema ───────────────────────────────────────────────────────
const listingSchema = new mongoose.Schema({

  // ── Core Fields ──────────────────────────────────────────────────────────
  title: {
    type: String, required: true, trim: true,
    minlength: [5,  'Title must be at least 5 characters.'],
    maxlength: [120, 'Title cannot exceed 120 characters.'],
  },
  description: {
    type: String, required: true, trim: true,
    minlength: [20,  'Description must be at least 20 characters.'],
    maxlength: [2000, 'Description cannot exceed 2000 characters.'],
  },
  category: {
    type: String, required: true,
    enum: { values: CATEGORIES, message: 'Invalid category.' },
  },
  price: {
    type: Number, required: true,
    min: [1, 'Price must be at least Rs. 1.'],
    max: [999999, 'Price cannot exceed Rs. 999,999.'],
  },
  priceUnit: {
    type: String,
    enum: ['per_day', 'per_week', 'per_month', 'per_hour'],
    default: 'per_day',
  },

  // ── Security Deposit ───────────────────────────────────────────────────────
  // Owner-set deposit held in escrow alongside the rental fee. Refunded to the
  // renter when the booking completes with no upheld damage claim. Defaults
  // to 0 so existing listings keep working until the owner sets a value.
  securityDeposit: {
    type: Number, default: 0, min: [0, 'Security deposit cannot be negative.'],
    max: [999999, 'Security deposit cannot exceed Rs. 999,999.'],
  },

  // ── Item details (all optional — owner fills in what's relevant) ───────────
  condition: {
    type: String, enum: { values: CONDITIONS, message: 'Invalid condition.' }, default: null,
  },
  brand: { type: String, trim: true, maxlength: 60, default: null },
  model: { type: String, trim: true, maxlength: 60, default: null },
  size:  { type: String, trim: true, maxlength: 20, default: null }, // e.g. S/M/L/XL — mainly for Clothing & Accessories
  // Free-text label for what kind of setup/configuration this is — e.g.
  // "Full Gaming Setup", "1-Bedroom Furniture Set". Optional, owner's words.
  setupType: { type: String, trim: true, maxlength: 80, default: null },

  // What's physically included in the rental (e.g. "PC Tower", "Monitor",
  // "Keyboard") — shown as a checklist on the listing page.
  includedItems: {
    type: [{ type: String, trim: true, maxlength: 60 }],
    validate: { validator: (arr) => arr.length <= 20, message: 'Maximum 20 included items.' },
    default: [],
  },

  // Self-declared quality badges (see OWNER_CLAIMS above).
  ownerClaims: {
    type: [{ type: String, enum: OWNER_CLAIMS }],
    default: [],
  },

  // ── Images ───────────────────────────────────────────────────────────────
  images: {
    type: [imageSchema],
    validate: {
      validator: (arr) => arr.length <= 8,
      message: 'Maximum 8 images allowed per listing.',
    },
    default: [],
  },

  // ── Status & Visibility ───────────────────────────────────────────────────
  status: {
    type: String, enum: STATUS, default: 'active',
  },

  // ── Ownership (ref to User) ───────────────────────────────────────────────
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  // ── Location ─────────────────────────────────────────────────────────────
  city:     { type: String, trim: true, maxlength: 60 },
  area:     { type: String, trim: true, maxlength: 100 },

  // GeoJSON point [longitude, latitude] for map display + "near me" search.
  // Optional — listings without coordinates simply won't appear on the map.
  location: {
    type: { type: String, enum: ['Point'] },
    coordinates: { type: [Number] },   // [lng, lat]
  },

  // ── Stats ─────────────────────────────────────────────────────────────────
  views:    { type: Number, default: 0 },
  bookings: { type: Number, default: 0 },
  // Unique viewer keys (userId or anonymous fingerprint) — prevents double counting
  viewedBy: { type: [String], default: [], select: false },

  // Owner-blocked dates (manually marked unavailable, not from bookings)
  blockedDates: [{ type: Date }],

  // ── Soft delete ───────────────────────────────────────────────────────────
  isDeleted:   { type: Boolean, default: false },
  deletedAt:   { type: Date,    default: null },
  deletedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

}, { timestamps: true });

// ── Indexes ───────────────────────────────────────────────────────────────────
listingSchema.index({ createdBy: 1 });
listingSchema.index({ category: 1, status: 1 });
listingSchema.index({ status: 1, isDeleted: 1 });
// Compound indexes for admin list/filter queries
listingSchema.index({ isDeleted: 1, status: 1, category: 1, createdAt: -1 });
listingSchema.index({ isDeleted: 1, city: 1, status: 1 });
listingSchema.index({ location: '2dsphere' });   // geo queries for "near me"
listingSchema.index({ title: 'text', description: 'text' }); // Full-text search
listingSchema.index({ createdAt: -1 });
listingSchema.index({ price: 1 });

// ── Virtual: cover image ──────────────────────────────────────────────────────
listingSchema.virtual('coverImage').get(function () {
  return this.images?.[0]?.url || null;
});

// ── Method: soft delete ───────────────────────────────────────────────────────
listingSchema.methods.softDelete = async function (userId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  this.status    = 'deleted';
  return this.save({ validateModifiedOnly: true });
};

// ── Static: non-deleted filter ────────────────────────────────────────────────
listingSchema.statics.active = function () {
  return this.find({ isDeleted: false });
};

// ── toPublicJSON ──────────────────────────────────────────────────────────────
listingSchema.methods.toPublicJSON = function () {
  return {
    id:          this._id,
    title:       this.title,
    description: this.description,
    category:    this.category,
    price:       this.price,
    priceUnit:   this.priceUnit,
    securityDeposit: this.securityDeposit,
    condition:   this.condition,
    brand:       this.brand,
    model:       this.model,
    size:        this.size,
    setupType:   this.setupType,
    includedItems: this.includedItems,
    ownerClaims:   this.ownerClaims,
    images:      this.images,
    coverImage:  this.coverImage,
    status:      this.status,
    city:        this.city,
    area:        this.area,
    location:    this.location,
    lat:         this.location?.coordinates?.[1] ?? null,
    lng:         this.location?.coordinates?.[0] ?? null,
    views:       this.views,
    bookings:    this.bookings,
    createdBy:   this.createdBy,
    createdAt:   this.createdAt,
    updatedAt:   this.updatedAt,
  };
};

// Export both model and constants for reuse in validators/controllers
module.exports = {
  Listing: mongoose.model('Listing', listingSchema),
  CATEGORIES,
  STATUS,
  CONDITIONS,
  OWNER_CLAIMS,
};
