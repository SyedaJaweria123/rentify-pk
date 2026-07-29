'use strict';
/**
 * Review Controller — Rentify
 */
const mongoose = require('mongoose');
const Review   = require('../models/Review');
const { Booking } = require('../models/Booking');
const RiderAssignment = require('../models/RiderAssignment');
const { Notification } = require('../models/Notification');
const User  = require('../models/User');         // to fetch reviewee email
const email = require('../utils/email');          // review-received email trigger
const { emitToUser } = require('../utils/socket'); // real-time review push
const { recalculateForOwner } = require('../services/trustScore.service');

// ═════════════════════════════════════════════════════════════════════════════
// CREATE  POST /api/reviews
// ═════════════════════════════════════════════════════════════════════════════
const createReview = async (req, res) => {
  try {
    const { bookingId, rating, comment, subRatings } = req.body;

    if (!bookingId || !rating || !comment) {
      return res.status(400).json({ success: false, message: 'bookingId, rating, and comment are required.' });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5.' });
    }
    if (comment.trim().length < 10) {
      return res.status(400).json({ success: false, message: 'Review must be at least 10 characters.' });
    }

    const booking = await Booking.findById(bookingId)
      .populate('listing', 'title');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }
    if (booking.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Reviews can only be submitted for completed bookings.' });
    }

    const uid = req.user._id.toString();
    const isRenter = booking.renter.toString() === uid;
    const isOwner  = booking.owner.toString() === uid;

    if (!isRenter && !isOwner) {
      return res.status(403).json({ success: false, message: 'You are not part of this booking.' });
    }

    // Check if already reviewed
    const existing = await Review.findOne({ booking: bookingId, reviewer: req.user._id });
    if (existing) {
      return res.status(409).json({ success: false, message: 'You have already reviewed this booking.' });
    }

    // Determine type and reviewee
    let type, revieweeId;
    if (isRenter) {
      if (booking.renterReviewed) {
        return res.status(409).json({ success: false, message: 'You have already reviewed this booking.' });
      }
      type       = 'renter_to_owner';
      revieweeId = booking.owner;
    } else {
      if (booking.ownerReviewed) {
        return res.status(409).json({ success: false, message: 'You have already reviewed this booking.' });
      }
      type       = 'owner_to_renter';
      revieweeId = booking.renter;
    }

    const review = await Review.create({
      booking:  bookingId,
      listing:  booking.listing._id,
      reviewer: req.user._id,
      reviewee: revieweeId,
      type,
      rating,
      comment:  comment.trim(),
      subRatings: subRatings || {},
    });

    // Mark booking as reviewed
    if (isRenter) booking.renterReviewed = true;
    else          booking.ownerReviewed  = true;
    await booking.save();

    // A new review changes the owner's review-count and avg-rating signals
    // — only renter→owner reviews feed the owner's trust score.
    if (isRenter) {
      try { await recalculateForOwner(revieweeId); } catch (e) { console.error('[createReview] trust recalc failed:', e.message); }
    }

    // Notify reviewee
    await Notification.notify(
      revieweeId,
      'review_received',
      'New Review Received',
      `${req.user.name} left you a ${rating}-star review for "${booking.listing.title}".`,
      { bookingId: booking._id, listingId: booking.listing._id, reviewId: review._id }
    );

    // Real-time push to reviewee (listing owner)
    emitToUser(revieweeId, 'review:new', {
      type: 'review_received',
      title: 'New Review Received',
      message: `${req.user.name} left you a ${rating}-star review.`,
      link: `/listings/${booking.listing._id}`,
      listingId: booking.listing._id,
      rating,
    });

    // Email the reviewee about the new review (non-blocking)
    try {
      const reviewee = await User.findById(revieweeId).select('name email');
      if (reviewee?.email) {
        await email.sendReviewReceivedEmail({
          to: reviewee.email,
          ownerName: reviewee.name,
          reviewerName: req.user.name,
          rating,
          comment: comment.trim(),
          listingTitle: booking.listing.title,
          listingId: booking.listing._id,
        });
      }
    } catch (e) { console.warn('[email reviewReceived]', e.message); }

    const populated = await Review.findById(review._id).populate('reviewer', 'name avatar');

    return res.status(201).json({
      success: true,
      message: 'Review submitted successfully.',
      data: { review: populated },
    });
  } catch (err) {
    console.error('[createReview]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to submit review.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// LIST LISTING REVIEWS  GET /api/reviews/listing/:listingId
// ═════════════════════════════════════════════════════════════════════════════
const getListingReviews = async (req, res) => {
  try {
    const { listingId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, parseInt(limit) || 10);
    const skip     = (pageNum - 1) * limitNum;

    const filter = { listing: listingId, isPublic: true, type: 'renter_to_owner' };

    const [reviews, total, stats] = await Promise.all([
      Review.find(filter)
        .populate('reviewer', 'name avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Review.countDocuments(filter),
      Review.getListingStats(listingId),
    ]);

    return res.json({
      success: true,
      data: {
        reviews,
        stats,
        pagination: {
          total, page: pageNum, limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (err) {
    console.error('[getListingReviews]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch reviews.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// LIST USER REVIEWS  GET /api/reviews/user/:userId
// ═════════════════════════════════════════════════════════════════════════════
const getUserReviews = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10, type } = req.query;
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, parseInt(limit) || 10);
    const skip     = (pageNum - 1) * limitNum;

    const filter = { reviewee: userId, isPublic: true };
    if (type) filter.type = type;

    const [reviews, total, stats] = await Promise.all([
      Review.find(filter)
        .populate('reviewer', 'name avatar')
        .populate('listing',  'title images')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Review.countDocuments(filter),
      Review.getUserStats(userId, type),
    ]);

    return res.json({
      success: true,
      data: { reviews, stats, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) } },
    });
  } catch (err) {
    console.error('[getUserReviews]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch reviews.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// OWNER RESPOND  PATCH /api/reviews/:id/respond
// ═════════════════════════════════════════════════════════════════════════════
const respondToReview = async (req, res) => {
  try {
    const { comment } = req.body;
    if (!comment?.trim()) {
      return res.status(400).json({ success: false, message: 'Response comment is required.' });
    }

    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found.' });

    if (review.reviewee.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only the reviewee can respond.' });
    }

    if (review.ownerResponse?.comment) {
      return res.status(409).json({ success: false, message: 'You have already responded to this review.' });
    }

    review.ownerResponse = { comment: comment.trim(), at: new Date() };
    await review.save();

    return res.json({ success: true, message: 'Response added.', data: { review } });
  } catch (err) {
    console.error('[respondToReview]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to respond to review.' });
  }
};

/**
 * GET /api/reviews/recent?limit=4
 * Public — recent high-quality reviews for homepage social proof.
 * Returns only public reviews with a comment and a strong rating (>= 4).
 */
const getRecentReviews = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 4, 12);

    const reviews = await Review.find({
      isPublic: true,
      rating: { $gte: 4 },
      comment: { $ne: null, $exists: true },
    })
      .populate('reviewer', 'name avatar')
      .populate('listing', 'title')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Trim to just what the homepage needs (no internal fields).
    const data = reviews
      .filter(r => r.comment && r.comment.trim().length > 0)
      .map(r => ({
        id: r._id,
        rating: r.rating,
        comment: r.comment,
        reviewerName: r.reviewer?.name || 'Verified renter',
        reviewerAvatar: r.reviewer?.avatar || null,
        listingTitle: r.listing?.title || null,
        createdAt: r.createdAt,
      }));

    return res.json({ success: true, data: { reviews: data } });
  } catch (err) {
    console.error('[getRecentReviews]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load recent reviews.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// MY REVIEWS (reviews I wrote)  GET /api/reviews/my
// ═════════════════════════════════════════════════════════════════════════════
// Different from getUserReviews (which fetches reviews someone RECEIVED) —
// this fetches reviews the logged-in user WROTE, so a renter can see every
// review they've left plus any owner response to it.
const getMyReviews = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, parseInt(limit) || 10);
    const skip     = (pageNum - 1) * limitNum;

    const filter = { reviewer: req.user._id };

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate('reviewee', 'name avatar')
        .populate('listing',  'title images')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Review.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: { reviews, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) } },
    });
  } catch (err) {
    console.error('[getMyReviews]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch your reviews.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// RATE RIDER  POST /api/reviews/rider
// ═════════════════════════════════════════════════════════════════════════════
// Either the renter OR the owner on a booking can rate the rider who
// delivered it — tracked independently (renterReviewedRider /
// ownerReviewedRider) so both can leave one review each. Separate from
// createReview (renter↔owner) because it targets a different person found
// via RiderAssignment rather than the booking's renter/owner fields, and
// updates User.riderRating (previously a dead field that nothing ever wrote to).
const createRiderReview = async (req, res) => {
  try {
    const { bookingId, rating, comment } = req.body;

    if (!bookingId || !rating || !comment) {
      return res.status(400).json({ success: false, message: 'bookingId, rating, and comment are required.' });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5.' });
    }
    if (comment.trim().length < 10) {
      return res.status(400).json({ success: false, message: 'Review must be at least 10 characters.' });
    }

    const booking = await Booking.findById(bookingId).populate('listing', 'title');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    const uid       = req.user._id.toString();
    const isRenter  = booking.renter.toString() === uid;
    const isOwner   = booking.owner.toString()  === uid;
    if (!isRenter && !isOwner) {
      return res.status(403).json({ success: false, message: 'You are not part of this booking.' });
    }
    if (!['completed', 'delivered', 'active'].includes(booking.status)) {
      return res.status(400).json({ success: false, message: 'You can rate the rider once your item has been delivered.' });
    }
    if (isRenter && booking.renterReviewedRider) {
      return res.status(409).json({ success: false, message: 'You have already rated the rider for this booking.' });
    }
    if (isOwner && booking.ownerReviewedRider) {
      return res.status(409).json({ success: false, message: 'You have already rated the rider for this booking.' });
    }

    // Find who actually delivered this booking (the 'delivery' assignment, not a return pickup)
    const assignment = await RiderAssignment
      .findOne({ booking: bookingId, type: 'delivery' })
      .sort({ createdAt: -1 });

    if (!assignment || !assignment.rider) {
      return res.status(400).json({ success: false, message: 'No rider was assigned to deliver this booking.' });
    }
    const riderId = assignment.rider;
    const type     = isRenter ? 'renter_to_rider' : 'owner_to_rider';

    // One review per (booking, reviewer) toward the rider, regardless of role
    const existing = await Review.findOne({ booking: bookingId, reviewer: req.user._id, reviewee: riderId });
    if (existing) {
      return res.status(409).json({ success: false, message: 'You have already rated the rider for this booking.' });
    }

    const review = await Review.create({
      booking:  bookingId,
      listing:  booking.listing._id,
      reviewer: req.user._id,
      reviewee: riderId,
      type,
      rating,
      comment:  comment.trim(),
    });

    if (isRenter) booking.renterReviewedRider = true;
    else          booking.ownerReviewedRider  = true;
    await booking.save();

    // Recalculate this rider's real average rating from ALL their reviews
    // (both renter_to_rider and owner_to_rider) — riderRating on User was
    // previously never written to by anything.
    const stats = await Review.getUserStats(riderId);
    await User.findByIdAndUpdate(riderId, { riderRating: stats.avgRating });

    // Notify the rider
    await Notification.notify(
      riderId,
      'review_received',
      'New Review Received',
      `${req.user.name} left you a ${rating}-star review for a delivery.`,
      { bookingId: booking._id, listingId: booking.listing._id, reviewId: review._id }
    );
    emitToUser(riderId, 'review:new', {
      type: 'review_received',
      title: 'New Review Received',
      message: `${req.user.name} left you a ${rating}-star review.`,
      rating,
    });

    const populated = await Review.findById(review._id).populate('reviewer', 'name avatar');
    return res.status(201).json({ success: true, message: 'Rider review submitted successfully.', data: { review: populated } });
  } catch (err) {
    console.error('[createRiderReview]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to submit rider review.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// TOP RATED OWNERS (public, homepage)  GET /api/reviews/top-owners
// ═════════════════════════════════════════════════════════════════════════════
// Real aggregation over renter→owner reviews — average rating, review count,
// and active listing count per owner. No admin-curated content, no
// placeholder numbers; an owner only appears here if they've actually been
// reviewed. Sorted by rating (then review count as a tiebreaker), and
// requires at least MIN_REVIEWS so a single 5-star review doesn't outrank
// an owner with a longer, still-excellent track record.
const getTopOwners = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 6, 12);
    const MIN_REVIEWS = 1;

    const ranked = await Review.aggregate([
      { $match: { type: 'renter_to_owner' } },
      { $group: { _id: '$reviewee', avgRating: { $avg: '$rating' }, reviewCount: { $sum: 1 } } },
      { $match: { reviewCount: { $gte: MIN_REVIEWS } } },
      { $sort: { avgRating: -1, reviewCount: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'users', localField: '_id', foreignField: '_id', as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $lookup: {
          from: 'listings',
          let: { ownerId: '$_id' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$owner', '$$ownerId'] }, { $eq: ['$status', 'active'] }, { $eq: ['$isDeleted', false] }] } } },
            { $count: 'count' },
          ],
          as: 'listingStats',
        },
      },
      {
        $project: {
          _id: 0,
          id: '$user._id',
          name: '$user.name',
          avatar: '$user.avatar',
          avgRating: { $round: ['$avgRating', 1] },
          reviewCount: 1,
          listingCount: { $ifNull: [{ $first: '$listingStats.count' }, 0] },
          trustBadge: { $ifNull: ['$user.trustBadge', 'none'] },
          trustScore: { $ifNull: ['$user.trustScore', 0] },
        },
      },
    ]);

    return res.json({ success: true, data: { owners: ranked } });
  } catch (err) {
    console.error('[getTopOwners]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load top owners.' });
  }
};

module.exports = { createReview, getListingReviews, getUserReviews, respondToReview, getRecentReviews, getMyReviews, createRiderReview, getTopOwners };
