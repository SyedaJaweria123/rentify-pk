'use strict';
/**
 * Public Stats Route — Rentify PK
 * GET /api/stats
 * Returns real-time platform statistics from MongoDB.
 * No auth required — safe for public home/about/how-it-works pages.
 */
const express    = require('express');
const router     = express.Router();
const User       = require('../models/User');
const { Listing } = require('../models/Listing');
const Booking    = require('../models/Booking');

// Simple in-memory cache to avoid hammering DB on every page load
// Stats are cached for 5 minutes
let statsCache   = null;
let cacheExpiry  = 0;
const CACHE_TTL  = 5 * 60 * 1000; // 5 minutes in ms

/**
 * GET /api/stats
 * Returns:
 *   totalListings  — active, non-deleted listings
 *   totalUsers     — all registered users
 *   totalOwners    — users with role 'owner'
 *   totalBookings  — completed bookings
 *   totalCities    — distinct cities with active listings
 *   avgRating      — placeholder (extend when reviews are aggregated)
 */
router.get('/', async (req, res) => {
  try {
    // Serve from cache if still fresh
    if (statsCache && Date.now() < cacheExpiry) {
      return res.json({ success: true, data: statsCache, cached: true });
    }

    // Run all counts in parallel for performance
    const [
      totalListings,
      totalUsers,
      totalOwners,
      totalCompletedBookings,
      citiesAgg,
    ] = await Promise.all([
      // Active, visible listings only
      Listing.countDocuments({ status: 'active', isDeleted: false }),

      // All registered users (email verified)
      User.countDocuments({ isEmailVerified: true }),

      // Verified owners only (CNIC-verified owners inspire more trust)
      User.countDocuments({ role: 'owner', cnicVerified: true }),

      // Completed bookings (proof of real activity)
      Booking.countDocuments({ status: 'completed' }),

      // Distinct cities that have at least one active listing
      Listing.aggregate([
        { $match: { status: 'active', isDeleted: false, city: { $exists: true, $ne: '' } } },
        { $group: { _id: '$city' } },
        { $count: 'total' },
      ]),
    ]);

    const totalCities = citiesAgg[0]?.total || 0;

    // Build stats object — use real numbers with friendly fallback minimums
    // so the UI never shows "0 listings" on a fresh deploy
    const stats = {
      totalListings:  totalListings,
      totalUsers:     totalUsers,
      totalOwners:    totalOwners,
      totalBookings:  totalCompletedBookings,
      totalCities:    totalCities,
      // Display-ready formatted strings (e.g. "1,200+" for marketing pages)
      display: {
        listings:  formatStat(totalListings),
        users:     formatStat(totalUsers),
        owners:    formatStat(totalOwners),
        bookings:  formatStat(totalCompletedBookings),
        cities:    formatStat(totalCities),
      },
    };

    // Cache for 5 minutes
    statsCache  = stats;
    cacheExpiry = Date.now() + CACHE_TTL;

    return res.json({ success: true, data: stats, cached: false });

  } catch (err) {
    console.error('Stats API error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load stats.' });
  }
});

/**
 * Format a number into a display string:
 *   0      → "0"
 *   500    → "500+"
 *   1200   → "1,200+"
 *   15000  → "15K+"
 */
function formatStat(n) {
  if (!n || n === 0) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M+`;
  if (n >= 10000)   return `${Math.floor(n / 1000)}K+`;
  if (n >= 1000)    return `${(n / 1000).toFixed(1).replace('.0', '')}K+`;
  return `${n}+`;
}

module.exports = router;
