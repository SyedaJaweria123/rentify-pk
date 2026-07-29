'use strict';
/**
 * Listing Controller — RentAnything PK
 * Full CRUD: create, read (list + detail), update, delete.
 * Cloudinary image upload/delete integrated.
 */
const mongoose = require('mongoose');
const { Listing, CATEGORIES, CONDITIONS, OWNER_CLAIMS } = require('../models/Listing');
const { Notification } = require('../models/Notification');
const { uploadBuffer, deleteImages, deleteImage } = require('../config/cloudinary');

// ── View counter buffer ───────────────────────────────────────────────────────
// Buffer view increments in memory and flush to DB once a minute, instead of
// one write per page view. Flushed on graceful shutdown too.
const viewBuffer = new Map();

// ── Category counts cache (10-min TTL) — rarely changes, called every load ────
let _categoryCache = { data: null, expiresAt: 0 };

async function flushViewBuffer() {
  if (viewBuffer.size === 0) return;
  const entries = [...viewBuffer.entries()];
  viewBuffer.clear();
  try {
    const ops = entries.map(([id, count]) => ({
      updateOne: { filter: { _id: id }, update: { $inc: { views: count } } },
    }));
    if (ops.length) await Listing.bulkWrite(ops, { ordered: false });
  } catch (e) {
    console.error('[flushViewBuffer]', e.message);
    // On failure, push counts back so they aren't lost
    entries.forEach(([id, count]) => viewBuffer.set(id, (viewBuffer.get(id) || 0) + count));
  }
}

// Flush every 60s
const _viewFlushTimer = setInterval(flushViewBuffer, 60000);
if (_viewFlushTimer.unref) _viewFlushTimer.unref();

// Flush on graceful shutdown
process.on('SIGTERM', async () => { await flushViewBuffer(); });
process.on('SIGINT',  async () => { await flushViewBuffer(); });

// ── Helper: parse comma-sep retainedIds from update form ─────────────────────
const parseRetainedImages = (raw) => {
  if (!raw) return null; // null = keep all existing
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return raw.split(',').map(s => s.trim()).filter(Boolean);
};

// ═════════════════════════════════════════════════════════════════════════════
// CREATE  POST /api/listings
// ═════════════════════════════════════════════════════════════════════════════
const createListing = async (req, res) => {
  try {
    const {
      title, description, category, price, priceUnit, securityDeposit,
      condition, brand, model, setupType, size, includedItems, ownerClaims,
      city, area, status, lat, lng,
    } = req.body;

    // Multipart form-data sends arrays either as a JSON string or as
    // repeated form fields (already an array by the time Express parses
    // it) — handle both without assuming one or the other.
    const parseArrayField = (val) => {
      if (Array.isArray(val)) return val.map(String).map(s => s.trim()).filter(Boolean);
      if (typeof val === 'string' && val.trim()) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) return parsed.map(String).map(s => s.trim()).filter(Boolean);
        } catch {
          return [val.trim()]; // single plain string value
        }
      }
      return [];
    };
    const includedItemsArr = parseArrayField(includedItems).slice(0, 20);
    const ownerClaimsArr   = parseArrayField(ownerClaims).filter(c => OWNER_CLAIMS.includes(c));

    // ── Duplicate title check per owner ──────────────────────────────────────
    const normalizedTitle = (title || '').trim().replace(/\s+/g, ' ');
    const esc = normalizedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const duplicate = await Listing.findOne({
      createdBy: req.user._id,
      title: { $regex: new RegExp(`^${esc}$`, 'i') },
      isDeleted: false,
    });
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: 'You already have a listing with this title. Please use a different title.',
        errors: { title: 'Duplicate listing title.' },
      });
    }

    // ── Upload images to Cloudinary ───────────────────────────────────────────
    const uploadedImages = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const result = await uploadBuffer(file.buffer, {
          folder: `rentanything/listings/${req.user._id}`,
          transform: [{ width: 1200, height: 900, crop: 'limit', quality: 'auto:good', fetch_format: 'auto' }],
        });
        uploadedImages.push({
          url:      result.secure_url,
          publicId: result.public_id,
          width:    result.width,
          height:   result.height,
          format:   result.format,
        });
      }
    }

    // ── Persist listing ───────────────────────────────────────────────────────
    const listing = await Listing.create({
      title:       normalizedTitle,
      description: description.trim(),
      category,
      price:       parseFloat(price),
      priceUnit:   priceUnit || 'per_day',
      securityDeposit: Number(securityDeposit) || 0,
      condition:   CONDITIONS.includes(condition) ? condition : undefined,
      brand:       brand?.trim() || undefined,
      model:       model?.trim() || undefined,
      setupType:   setupType?.trim() || undefined,
      size:        size?.trim() || undefined,
      includedItems: includedItemsArr,
      ownerClaims:   ownerClaimsArr,
      images:      uploadedImages,
      status:      status || 'active',
      city:        city?.trim()  || undefined,
      area:        area?.trim()  || undefined,
      location:    (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)))
        ? { type: 'Point', coordinates: [Number(lng), Number(lat)] }
        : undefined,
      createdBy:   req.user._id,
    });

    // Notify admins of new listing (may need approval)
    try {
      await Notification.notifyAdmins('system', 'New Listing Created',
        `${req.user.name} listed "${listing.title}".`, { listingId: listing._id });
    } catch (e) { console.error('admin notify failed:', e.message); }

    return res.status(201).json({
      success: true,
      message: 'Listing created successfully.',
      data: { listing: listing.toPublicJSON() },
    });
  } catch (err) {
    console.error('[createListing]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create listing.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// LIST (Browse)  GET /api/listings
// ═════════════════════════════════════════════════════════════════════════════
const getListings = async (req, res) => {
  try {
    const {
      page     = 1,
      limit    = 12,
      search   = '',
      category = '',
      status   = 'active',
      minPrice,
      maxPrice,
      city     = '',
      area     = '',
      priceUnit = '',
      hasImage = '',
      sortBy   = 'createdAt',
      order    = 'desc',
      myListings,
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page)  || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 12));
    const skip     = (pageNum - 1) * limitNum;

    // ── Build filter ─────────────────────────────────────────────────────────
    const filter = { isDeleted: false };

    // Owner viewing their own listings (any status)
    if (myListings === 'true' && req.user) {
      filter.createdBy = req.user._id;
      if (status && status !== 'all') filter.status = status;
    } else {
      // Public browse — only active listings
      filter.status = 'active';
    }

    // Text search — match title/description (text index) OR city OR category
    let isTextSearch = false;
    if (search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { $text: { $search: search.trim() } },
        { city:     { $regex: escaped, $options: 'i' } },
        { category: { $regex: escaped, $options: 'i' } },
      ];
    }

    // Category filter — accept the exact name, any case, a slug form
    // (e.g. "photography-video"), or a prefix (handles values truncated at "&").
    if (category.trim()) {
      const q = category.trim().toLowerCase();
      const slug = (s) => s.toLowerCase().replace(/\s*&\s*/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const match = CATEGORIES.find(c =>
        c.toLowerCase() === q ||
        slug(c) === q ||
        slug(c) === slug(category) ||
        (q.length >= 4 && c.toLowerCase().startsWith(q))
      );
      if (match) filter.category = match;
    }

    // Price range
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }

    // City filter
    if (city.trim()) {
      const escapedCity = city.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.city = { $regex: new RegExp(escapedCity, 'i') };
    }

    // Area filter
    if (area.trim()) {
      const escapedArea = area.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.area = { $regex: new RegExp(escapedArea, 'i') };
    }

    // Price-unit filter
    if (priceUnit && ['per_day', 'per_week', 'per_month', 'per_hour'].includes(priceUnit)) {
      filter.priceUnit = priceUnit;
    }

    // Photos-only filter
    if (hasImage === 'true') {
      filter['images.0'] = { $exists: true };
    }

    // ── Sort ──────────────────────────────────────────────────────────────────
    const ALLOWED_SORT = { createdAt: 1, price: 1, title: 1, views: 1, bookings: 1 };
    const sortField = ALLOWED_SORT[sortBy] ? sortBy : 'createdAt';
    const sortDir   = order === 'asc' ? 1 : -1;
    // textScore can't be used with $or search — plain field sort only
    const sort = { [sortField]: sortDir };

    // ── Projection ────────────────────────────────────────────────────────────
    const projection = {};

    // ── Execute query ─────────────────────────────────────────────────────────
    const [listings, total] = await Promise.all([
      Listing.find(filter, projection)
        .populate('createdBy', 'name avatar email role trustBadge trustScore')
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Listing.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    // ── Enrich with rating + review count (from Review collection) ────────────
    const Review = require('../models/Review');
    const listingIds = listings.map(l => l._id);
    let ratingMap = {};
    if (listingIds.length) {
      const ratings = await Review.aggregate([
        { $match: { listing: { $in: listingIds } } },
        { $group: { _id: '$listing', avgRating: { $avg: '$rating' }, reviewCount: { $sum: 1 } } },
      ]);
      ratings.forEach(r => {
        ratingMap[r._id.toString()] = {
          rating: Math.round(r.avgRating * 10) / 10,
          reviewCount: r.reviewCount,
        };
      });
    }
    const enriched = listings.map(l => ({
      ...l,
      rating:      ratingMap[l._id.toString()]?.rating      || 0,
      reviewCount: ratingMap[l._id.toString()]?.reviewCount || 0,
      ownerName:   l.createdBy?.name   || null,
      ownerAvatar: l.createdBy?.avatar || null,
    }));

    return res.json({
      success: true,
      data: {
        listings: enriched,
        pagination: {
          total, page: pageNum, limit: limitNum,
          totalPages, hasNext: pageNum < totalPages, hasPrev: pageNum > 1,
        },
      },
    });
  } catch (err) {
    console.error('[getListings]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch listings.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// GET SINGLE  GET /api/listings/:id
// ═════════════════════════════════════════════════════════════════════════════
const getListingById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid listing ID.' });
    }

    const listing = await Listing.findOne({ _id: id, isDeleted: false })
      .populate('createdBy', 'name avatar email role cnicVerified createdAt trustBadge trustScore');

    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found.' });
    }

    // ── Unique view counting: one view per user/visitor ──────────────────────
    // Build a viewer key: logged-in userId, else a fingerprint from IP + user-agent
    let viewerKey = '';
    if (req.user && req.user._id) {
      viewerKey = 'u:' + String(req.user._id);
    } else {
      const ip = (req.headers['x-forwarded-for'] || req.ip || req.connection?.remoteAddress || '').toString().split(',')[0].trim();
      const ua = (req.headers['user-agent'] || '').toString().slice(0, 60);
      viewerKey = 'a:' + Buffer.from(ip + '|' + ua).toString('base64').slice(0, 40);
    }

    // Owner viewing their own listing should not inflate the count
    const isOwnerViewing = req.user && String(listing.createdBy?._id || listing.createdBy) === String(req.user._id);

    // Atomically add the viewer key only if not already present; increment views only when newly added
    let liveViews = listing.views || 0;
    if (viewerKey && !isOwnerViewing) {
      const updated = await Listing.findOneAndUpdate(
        { _id: id, viewedBy: { $ne: viewerKey } },   // only if this viewer hasn't been counted
        { $addToSet: { viewedBy: viewerKey }, $inc: { views: 1 } },
        { new: true }
      ).select('views');
      if (updated) liveViews = updated.views;   // newly counted → use fresh total
    }

    const listingJson = listing.toPublicJSON();
    listingJson.views = liveViews;

    // The header chip wants the listing's average rating + review count.
    // Listing has no rating field of its own (reviews are computed live, not
    // denormalized onto the listing) — pull the same stats the reviews
    // section itself uses, so the two never show different numbers.
    try {
      const Review = require('../models/Review');
      const reviewStats = await Review.getListingStats(id);
      listingJson.rating = reviewStats.avgRating || 0;
      listingJson.reviewCount = reviewStats.totalCount || 0;
    } catch (e) {
      listingJson.rating = 0;
      listingJson.reviewCount = 0;
    }

    // Related listings (same category, active, exclude self)
    const related = await Listing.find({
      _id:       { $ne: id },
      category:  listing.category,
      status:    'active',
      isDeleted: false,
    })
      .select('title images price priceUnit city category')
      .limit(4)
      .lean();

    // Owner summary stats — same real sources as the public-profile endpoint,
    // duplicated here so the listing page can render them in one request
    // rather than making the renter's browser fire a second call.
    let ownerStats = null;
    try {
      const ownerId = listing.createdBy?._id || listing.createdBy;
      if (ownerId) {
        const { Booking } = require('../models/Booking');
        const { getOwnerResponseRate } = require('../services/responseRate.service');
        const [activeListingsCount, completedBookingsCount, responseRateData] = await Promise.all([
          Listing.countDocuments({ createdBy: ownerId, isDeleted: false, status: 'active' }),
          Booking.countDocuments({ owner: ownerId, status: 'completed' }),
          getOwnerResponseRate(ownerId),
        ]);
        ownerStats = {
          activeListings: activeListingsCount,
          completedRentals: completedBookingsCount,
          responseRate: responseRateData.responseRate,
        };
      }
    } catch (e) {
      console.error('[getListingById] ownerStats failed:', e.message);
    }

    return res.json({
      success: true,
      data: { listing: listingJson, related, ownerStats },
    });
  } catch (err) {
    console.error('[getListingById]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch listing.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// UPDATE  PUT /api/listings/:id
// ═════════════════════════════════════════════════════════════════════════════
const updateListing = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid listing ID.' });
    }

    const listing = await Listing.findOne({ _id: id, isDeleted: false });

    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found.' });
    }

    // Only owner or admin may edit
    if (listing.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You can only edit your own listings.' });
    }

    const {
      title, description, category, price, priceUnit, securityDeposit,
      condition, brand, model, setupType, size, includedItems, ownerClaims,
      city, area, status, retainedImageIds, lat, lng,
    } = req.body;

    // ── Handle image replacement logic ────────────────────────────────────────
    // retainedImageIds: comma-sep list of Cloudinary publicIds to keep.
    // Images NOT in this list will be deleted from Cloudinary.
    const retained = parseRetainedImages(retainedImageIds);
    let finalImages = listing.images;

    if (retained !== null) {
      // Identify images to delete
      const toDelete = listing.images.filter(img => !retained.includes(img.publicId));
      if (toDelete.length > 0) {
        await deleteImages(toDelete.map(i => i.publicId));
      }
      // Keep only retained images
      finalImages = listing.images.filter(img => retained.includes(img.publicId));
    }

    // ── Upload new images (appended after retained ones) ──────────────────────
    if (req.files && req.files.length > 0) {
      if (finalImages.length + req.files.length > 8) {
        return res.status(400).json({
          success: false,
          message: `You can have at most 8 images. Currently keeping ${finalImages.length}, trying to add ${req.files.length}.`,
        });
      }
      for (const file of req.files) {
        const result = await uploadBuffer(file.buffer, {
          folder: `rentanything/listings/${req.user._id}`,
        });
        finalImages.push({
          url: result.secure_url, publicId: result.public_id,
          width: result.width, height: result.height, format: result.format,
        });
      }
    }

    // ── Apply field updates ───────────────────────────────────────────────────
    if (title       !== undefined) listing.title       = title.trim();
    if (description !== undefined) listing.description = description.trim();
    if (category    !== undefined) listing.category    = category;
    if (price       !== undefined) listing.price       = parseFloat(price);
    if (priceUnit   !== undefined) listing.priceUnit   = priceUnit;
    if (securityDeposit !== undefined) listing.securityDeposit = Number(securityDeposit) || 0;
    if (condition   !== undefined) listing.condition   = CONDITIONS.includes(condition) ? condition : null;
    if (brand       !== undefined) listing.brand       = brand?.trim()     || null;
    if (model       !== undefined) listing.model       = model?.trim()     || null;
    if (setupType   !== undefined) listing.setupType   = setupType?.trim() || null;
    if (size        !== undefined) listing.size        = size?.trim()      || null;
    if (includedItems !== undefined) {
      const parsed = Array.isArray(includedItems) ? includedItems
        : (() => { try { return JSON.parse(includedItems); } catch { return [includedItems]; } })();
      listing.includedItems = (Array.isArray(parsed) ? parsed : [])
        .map(String).map(s => s.trim()).filter(Boolean).slice(0, 20);
    }
    if (ownerClaims !== undefined) {
      const parsed = Array.isArray(ownerClaims) ? ownerClaims
        : (() => { try { return JSON.parse(ownerClaims); } catch { return [ownerClaims]; } })();
      listing.ownerClaims = (Array.isArray(parsed) ? parsed : [])
        .map(String).filter(c => OWNER_CLAIMS.includes(c));
    }
    if (city        !== undefined) listing.city        = city?.trim()  || undefined;
    if (area        !== undefined) listing.area        = area?.trim()  || undefined;

    // Save coordinates for map display
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
      listing.location = { type: 'Point', coordinates: [parsedLng, parsedLat] };
    }
    if (status      !== undefined) listing.status      = status;
    listing.images = finalImages;

    // validateModifiedOnly: re-validating the WHOLE document on every save
    // was breaking simple status-only toggles on older listings that predate
    // a since-tightened schema rule (e.g. an old category no longer in the
    // enum) — those fields aren't being touched here, so there's no reason
    // for them to block the save. Only validate what's actually changing.
    await listing.save({ validateModifiedOnly: true });

    return res.json({
      success: true,
      message: 'Listing updated successfully.',
      data: { listing: listing.toPublicJSON() },
    });
  } catch (err) {
    console.error('[updateListing]', err.message);
    if (err.name === 'ValidationError') {
      const firstMsg = Object.values(err.errors)[0]?.message || err.message;
      return res.status(422).json({ success: false, message: firstMsg });
    }
    return res.status(500).json({ success: false, message: 'Failed to update listing.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// DELETE  DELETE /api/listings/:id
// ═════════════════════════════════════════════════════════════════════════════
const deleteListing = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid listing ID.' });
    }

    const listing = await Listing.findOne({ _id: id, isDeleted: false });

    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found.' });
    }

    // Only owner may delete their listing
    if (listing.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You can only delete your own listings.' });
    }

    // Soft delete (preserves data for audit trails)
    await listing.softDelete(req.user._id);

    // Delete all associated Cloudinary images (non-blocking)
    if (listing.images.length > 0) {
      deleteImages(listing.images.map(i => i.publicId)).catch(e =>
        console.warn('[deleteListing] Cloudinary cleanup partial failure:', e.message)
      );
    }

    return res.json({ success: true, message: 'Listing deleted successfully.' });
  } catch (err) {
    console.error('[deleteListing]', err.message);
    if (err.name === 'ValidationError') {
      const firstMsg = Object.values(err.errors)[0]?.message || err.message;
      return res.status(422).json({ success: false, message: firstMsg });
    }
    return res.status(500).json({ success: false, message: 'Failed to delete listing.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// MY LISTINGS  GET /api/listings/my
// ═════════════════════════════════════════════════════════════════════════════
const getMyListings = async (req, res) => {
  try {
    const { page = 1, limit = 10, status = 'all' } = req.query;
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, parseInt(limit) || 10);
    const skip     = (pageNum - 1) * limitNum;

    const filter = { createdBy: req.user._id, isDeleted: false };
    if (status !== 'all') filter.status = status;

    const [listings, total] = await Promise.all([
      Listing.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum)
        .select('title images category price priceUnit status city area views bookings createdAt')
        .lean(),
      Listing.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: {
        listings,
        pagination: {
          total, page: pageNum, limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (err) {
    console.error('[getMyListings]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch your listings.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// GET LISTINGS BY OWNER (public)  GET /api/listings/owner/:ownerId
// ═════════════════════════════════════════════════════════════════════════════
// Used by the public owner-profile page so a renter can browse everything a
// given owner has listed, without needing to be that owner or logged in.
// Always active-only and excludes soft-deleted listings — unlike
// getMyListings (which the owner themself uses and can see every status of).
const getListingsByOwner = async (req, res) => {
  try {
    const { ownerId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(ownerId)) {
      return res.status(400).json({ success: false, message: 'Invalid owner ID.' });
    }

    const { page = 1, limit = 12 } = req.query;
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, parseInt(limit) || 12);
    const skip     = (pageNum - 1) * limitNum;

    const filter = { createdBy: ownerId, isDeleted: false, status: 'active' };

    const [listings, total] = await Promise.all([
      Listing.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum)
        .select('title images category price priceUnit city area views bookings createdAt')
        .lean(),
      Listing.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: {
        listings,
        pagination: {
          total, page: pageNum, limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (err) {
    console.error('[getListingsByOwner]', err.message);
    return res.status(500).json({ success: false, message: "Failed to fetch owner's listings." });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// GET CATEGORIES  GET /api/listings/categories
// ═════════════════════════════════════════════════════════════════════════════
const getCategories = async (_req, res) => {
  try {
    // Serve from cache if fresh
    if (_categoryCache.data && Date.now() < _categoryCache.expiresAt) {
      return res.json({ success: true, data: { categories: _categoryCache.data }, cached: true });
    }

    // Also return count of active listings per category
    const counts = await Listing.aggregate([
      { $match: { isDeleted: false, status: 'active' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    counts.forEach(c => { countMap[c._id] = c.count; });

    const categories = CATEGORIES.map(name => ({
      name,
      count: countMap[name] || 0,
    }));

    // Cache for 10 minutes
    _categoryCache = { data: categories, expiresAt: Date.now() + 10 * 60 * 1000 };

    return res.json({ success: true, data: { categories } });
  } catch (err) {
    console.error('[getCategories]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch categories.' });
  }
};

/**
 * GET /api/listings/nearby?lat=..&lng=..&radius=..&category=..
 * Returns active listings within `radius` km of a point, nearest first.
 * Uses the 2dsphere geo index on `location`.
 */
const getNearbyListings = async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Math.min(Number(req.query.radius) || 25, 200);   // cap at 200km

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(422).json({ success: false, message: 'Valid lat and lng are required.' });
    }

    const filter = {
      isDeleted: false,
      status: 'active',
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: radiusKm * 1000,   // metres
        },
      },
    };
    if (req.query.category) filter.category = req.query.category;

    const listings = await Listing.find(filter)
      .populate('createdBy', 'name avatar email role trustBadge trustScore')
      .limit(Number(req.query.limit) || 100)
      .lean();

    return res.json({
      success: true,
      data: { listings, center: { lat, lng }, radiusKm, count: listings.length },
    });
  } catch (err) {
    console.error('[getNearbyListings]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch nearby listings.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// POPULAR LISTINGS (public)  GET /api/listings/popular
// ═════════════════════════════════════════════════════════════════════════════
// Real popularity ranking — sorted by actual completed bookings (not just
// recency), with a real average rating per listing computed from the
// Review collection (reviews are tied to a specific listing, not just the
// owner). No fake ratings/badges — fields are simply omitted if there's no
// real data yet for that listing.
const getPopularListings = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 24, 48);

    const listings = await Listing.aggregate([
      { $match: { status: 'active', isDeleted: false } },
      { $sort: { bookings: -1, views: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'reviews',
          let: { listingId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$listing', '$$listingId'] } } },
            { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
          ],
          as: 'reviewStats',
        },
      },
      {
        $lookup: {
          from: 'users', localField: 'createdBy', foreignField: '_id', as: 'owner',
        },
      },
      { $unwind: { path: '$owner', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          title: 1, price: 1, priceUnit: 1, category: 1, city: 1, images: 1, bookings: 1,
          avgRating: { $round: [{ $ifNull: [{ $first: '$reviewStats.avgRating' }, null] }, 1] },
          reviewCount: { $ifNull: [{ $first: '$reviewStats.count' }, 0] },
          ownerTrustBadge: '$owner.trustBadge',
        },
      },
    ]);

    return res.json({ success: true, data: { listings } });
  } catch (err) {
    console.error('[getPopularListings]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load popular listings.' });
  }
};

module.exports = {
  createListing,
  getListings,
  getListingById,
  getNearbyListings,
  updateListing,
  deleteListing,
  getMyListings,
  getListingsByOwner,
  getCategories,
  flushViewBuffer,
  getPopularListings,
};
