'use strict';
/**
 * Listing Routes — Rentify PK
 * Public browse/detail (optionalAuth) + protected owner CRUD, images,
 * availability/blocked-dates and wishlist toggling.
 */
const router = require('express').Router();
const { protect, ownerOnly, optionalAuth } = require('../middleware/auth');
const { upload, handleUploadError } = require('../middleware/upload');
const { validateCreateListing, validateUpdateListing } = require('../middleware/listingValidation');
const { uploadBuffer, deleteImage } = require('../config/cloudinary');
const { Listing } = require('../models/Listing');

const {
  createListing,
  getListings,
  getNearbyListings,
  getListingById,
  updateListing,
  deleteListing,
  getMyListings,
  getListingsByOwner,
  getCategories,
  getPopularListings,
} = require('../controllers/listing.controller');

// Availability/calendar handlers live in the booking controller (they read bookings)
const {
  getListingAvailability,
  blockDates,
  unblockDates,
} = require('../controllers/booking.controller');

const {
  addToWishlist,
  removeFromWishlist,
} = require('../controllers/wishlist.controller');

// ── Helper: load listing + confirm caller owns it ─────────────────────────────
const loadOwnedListing = async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing) { res.status(404).json({ success: false, message: 'Listing not found.' }); return null; }
  if (String(listing.createdBy) !== String(req.user._id)) {
    res.status(403).json({ success: false, message: 'You do not own this listing.' });
    return null;
  }
  return listing;
};

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC
// ══════════════════════════════════════════════════════════════════════════════
// Categories must come before /:id so it isn't captured as an id
router.get('/categories', getCategories);
router.get('/popular', getPopularListings);

// Public — all of a given owner's active listings (owner-profile page)
router.get('/owner/:ownerId', getListingsByOwner);

// Browse all (optional auth → extra per-user context like isWishlisted)
router.get('/', optionalAuth, getListings);

// Single listing detail
router.get('/nearby', getNearbyListings);
router.get('/:id', optionalAuth, getListingById);

// Public availability calendar
router.get('/:id/availability', getListingAvailability);

// ══════════════════════════════════════════════════════════════════════════════
// PROTECTED — OWNER CRUD
// ══════════════════════════════════════════════════════════════════════════════
// A user's own listings
router.get('/user/my', protect, getMyListings);

// Create
router.post(
  '/',
  protect, ownerOnly,
  upload.array('images', 8),
  handleUploadError,
  validateCreateListing,
  createListing,
);

// Update
router.put(
  '/:id',
  protect, ownerOnly,
  upload.array('images', 8),
  handleUploadError,
  validateUpdateListing,
  updateListing,
);

// Delete
router.delete('/:id', protect, ownerOnly, deleteListing);

// ── Images ────────────────────────────────────────────────────────────────────
// Add one or more images to an existing listing
router.post(
  '/:id/images',
  protect, ownerOnly,
  upload.array('images', 8),
  handleUploadError,
  async (req, res) => {
    try {
      const listing = await loadOwnedListing(req, res);
      if (!listing) return;
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, message: 'No images provided.' });
      }
      if ((listing.images?.length || 0) + req.files.length > 8) {
        return res.status(400).json({ success: false, message: 'Maximum 8 images per listing.' });
      }
      for (const file of req.files) {
        const result = await uploadBuffer(file.buffer, { folder: 'rentify/listings' });
        listing.images.push({ url: result.secure_url, publicId: result.public_id });
      }
      await listing.save();
      return res.json({ success: true, message: 'Images added.', data: { images: listing.images } });
    } catch (err) {
      console.error('[addListingImages]', err.message);
      return res.status(500).json({ success: false, message: 'Failed to add images.' });
    }
  },
);

// Remove a single image by its Cloudinary publicId
router.delete('/:id/images/:publicId', protect, ownerOnly, async (req, res) => {
  try {
    const listing = await loadOwnedListing(req, res);
    if (!listing) return;
    // publicId may be URL-encoded (it can contain slashes)
    const publicId = decodeURIComponent(req.params.publicId);
    const before = listing.images.length;
    listing.images = listing.images.filter(img => img.publicId !== publicId);
    if (listing.images.length === before) {
      return res.status(404).json({ success: false, message: 'Image not found on this listing.' });
    }
    await deleteImage(publicId).catch(() => {});
    await listing.save();
    return res.json({ success: true, message: 'Image removed.', data: { images: listing.images } });
  } catch (err) {
    console.error('[deleteListingImage]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to remove image.' });
  }
});

// ── Blocked dates (owner) ─────────────────────────────────────────────────────
router.post('/:id/block-dates',   protect, ownerOnly, blockDates);
router.delete('/:id/block-dates', protect, ownerOnly, unblockDates);

// ── Wishlist (any logged-in user) ─────────────────────────────────────────────
// Map the URL :id into the shape the wishlist controller expects.
router.post('/:id/wishlist', protect, (req, res) => {
  req.body.listingId = req.params.id;
  return addToWishlist(req, res);
});
router.delete('/:id/wishlist', protect, (req, res) => {
  req.params.listingId = req.params.id;
  return removeFromWishlist(req, res);
});

module.exports = router;
