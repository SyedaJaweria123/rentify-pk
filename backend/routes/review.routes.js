'use strict';
/**
 * Review Routes — Rentify PK
 * Public reads (optionalAuth) + protected create / respond / delete.
 */
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/review.controller');
const { protect, optionalAuth } = require('../middleware/auth');
const Review = require('../models/Review');

// ── Public reads ──────────────────────────────────────────────────────────────
router.get('/recent',             ctrl.getRecentReviews);
router.get('/top-owners',         ctrl.getTopOwners);
router.get('/listing/:listingId', optionalAuth, ctrl.getListingReviews);
router.get('/user/:userId',       optionalAuth, ctrl.getUserReviews);

// ── Protected ─────────────────────────────────────────────────────────────────
router.use(protect);

router.post('/',            ctrl.createReview);
router.post('/rider',       ctrl.createRiderReview);
router.post('/:id/respond', ctrl.respondToReview);
router.get('/my',           ctrl.getMyReviews);

// DELETE /:id — only the author (reviewer) or an admin can remove a review
router.delete('/:id', async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found.' });

    const isAuthor = String(review.reviewer) === String(req.user._id);
    const isAdmin  = ['admin', 'super_admin'].includes(req.user.role);
    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ success: false, message: 'You can only delete your own review.' });
    }

    await review.deleteOne();
    return res.json({ success: true, message: 'Review deleted.' });
  } catch (err) {
    console.error('[deleteReview]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to delete review.' });
  }
});

module.exports = router;
