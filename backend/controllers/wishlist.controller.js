'use strict';
/**
 * Wishlist controller — Rentify PK
 *   POST   /api/wishlist            { listingId }   → add
 *   DELETE /api/wishlist/:listingId                 → remove
 *   GET    /api/wishlist                            → my saved listings
 */
const Wishlist = require('../models/Wishlist');

const addToWishlist = async (req, res) => {
  try {
    const { listingId } = req.body;
    if (!listingId) return res.status(400).json({ success: false, message: 'listingId required.' });

    // upsert avoids duplicate-key errors on repeat saves
    await Wishlist.updateOne(
      { user: req.user._id, listing: listingId },
      { $setOnInsert: { user: req.user._id, listing: listingId } },
      { upsert: true }
    );
    return res.json({ success: true, message: 'Added to wishlist.' });
  } catch (err) {
    console.error('[addToWishlist]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to add to wishlist.' });
  }
};

const removeFromWishlist = async (req, res) => {
  try {
    await Wishlist.deleteOne({ user: req.user._id, listing: req.params.listingId });
    return res.json({ success: true, message: 'Removed from wishlist.' });
  } catch (err) {
    console.error('[removeFromWishlist]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to remove from wishlist.' });
  }
};

const getWishlist = async (req, res) => {
  try {
    const items = await Wishlist.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate({
        path: 'listing',
        select: 'title price priceUnit images coverImage city category status views rating reviewCount',
      });

    // Filter out any listings that were deleted, return clean listing objects
    const listings = items
      .filter(i => i.listing)
      .map(i => i.listing);

    return res.json({ success: true, data: { listings, count: listings.length } });
  } catch (err) {
    console.error('[getWishlist]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load wishlist.' });
  }
};

module.exports = { addToWishlist, removeFromWishlist, getWishlist };
