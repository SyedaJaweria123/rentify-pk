'use strict';
/**
 * Public Settings route — Rentify PK
 * Exposes only the PUBLIC parts of platform settings (no security fields) so the
 * frontend can read CMS text, maintenance mode, site name, the fee %, and
 * real platform stats for the homepage "How It Works" section.
 *   GET /api/settings/public
 */
const router   = require('express').Router();
const Settings = require('../models/Settings');
const User     = require('../models/User');
const { Listing } = require('../models/Listing');
const Review   = require('../models/Review');

// The xssClean middleware HTML-escapes every incoming string, so CMS copy is
// stored as "Pakistan&#x27;s ...". Escaped storage is the safe default; decode
// on the way out so public pages render the readable form.
const he  = require('he');
const dec = (v) => (typeof v === 'string' ? he.decode(v) : v);

router.get('/public', async (req, res) => {
  try {
    const s = await Settings.getSingleton();

    // Real platform stats — no fake/placeholder numbers. Computed live from
    // the database so the homepage always reflects actual current activity.
    const [activeListings, ownerCount, cityAgg, ratingAgg] = await Promise.all([
      Listing.countDocuments({ isDeleted: { $ne: true }, status: 'active' }),
      User.countDocuments({ role: 'owner' }),
      Listing.distinct('city', { isDeleted: { $ne: true }, city: { $nin: [null, ''] } }),
      Review.aggregate([{ $group: { _id: null, avg: { $avg: '$rating' } } }]),
    ]);

    const avgRating = ratingAgg[0]?.avg ? Math.round(ratingAgg[0].avg * 10) / 10 : null;

    res.json({
      success: true,
      data: {
        siteName:          dec(s.siteName),
        maintenanceMode:   s.maintenanceMode,
        serviceFeePercent: s.serviceFeePercent,
        currency:          s.currency,
        contactEmail:      dec(s.contactEmail),
        homeBannerText:    dec(s.homeBannerText),
        aboutPageText:     dec(s.aboutPageText),
        stats: {
          activeListings,
          verifiedOwners: ownerCount,
          citiesCovered: cityAgg.length,
          avgRating, // null if there are no reviews yet — frontend should hide the stat in that case, not fake a number
        },
      },
    });
  } catch (err) {
    console.error('[GET /settings/public]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
