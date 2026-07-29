'use strict';
/**
 * Owner Trust Score — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Computes a 0–100 trust score for an owner from real, verifiable signals and
 * maps it to a badge tier. Higher trust → renters prefer that owner.
 *
 *   Signal                         Points   Why
 *   ──────────────────────────────────────────────────────────────────────────
 *   CNIC verified                  +30      Identity confirmed by admin
 *   5+ public reviews              +20      Proven track record (scaled below 5)
 *   10+ completed bookings         +25      Reliable, fulfils rentals (scaled)
 *   Account age ≥ 6 months         +10      Established, not throwaway (scaled)
 *   Average rating bonus           +15      Quality of service (rating ≥ 4.0)
 *   ──────────────────────────────────────────────────────────────────────────
 *   Max                            100
 *
 * Badge tiers:
 *   0–39   → none      (new / unproven)
 *   40–59  → Bronze
 *   60–84  → Silver
 *   85–100 → Gold
 *
 * The score is computed from the database (Users, Reviews, Bookings) so it can
 * never be faked, and is cached on the User document for fast reads.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const POINTS = Object.freeze({
  CNIC_VERIFIED: 30,
  REVIEWS_FULL:  20,   // at 5+ reviews
  BOOKINGS_FULL: 25,   // at 10+ completed bookings
  ACCOUNT_AGE:   10,   // at 6+ months
  RATING_BONUS:  15,   // at avg rating >= 4.0
  LATE_DELIVERY_PENALTY: 8,   // deducted per recorded late-delivery/no-show strike
});

const THRESHOLDS = Object.freeze({
  REVIEWS_TARGET:  5,
  BOOKINGS_TARGET: 10,
  ACCOUNT_AGE_MONTHS: 6,
  RATING_MIN: 4.0,
  MAX_LATE_STRIKES_COUNTED: 5,   // penalty caps out — a few strikes hurt, it never floors at 0 forever
});

const BADGE_TIERS = Object.freeze([
  { name: 'Gold',   min: 85 },
  { name: 'Silver', min: 60 },
  { name: 'Bronze', min: 40 },
  { name: 'none',   min: 0  },
]);

// ── Trust-Tiered Payment: advance % the renter pays upfront ──────────────────
// Lower advance for trusted owners (renter-favoring), but the renter is never
// asked for 100% even with a brand-new owner — the security deposit (held in
// full regardless of tier) is what protects the owner, not the advance %.
const ADVANCE_PERCENT_BY_BADGE = Object.freeze({
  Gold:   10,
  Silver: 20,
  Bronze: 30,
  none:   40,
});

/** Map an owner's badge to the advance percentage a renter pays upfront. */
function getAdvancePercentForBadge(badge) {
  return ADVANCE_PERCENT_BY_BADGE[badge] ?? ADVANCE_PERCENT_BY_BADGE.none;
}

/** Map a numeric score (0–100) to a badge tier name. */
function badgeForScore(score) {
  return (BADGE_TIERS.find(t => score >= t.min) || BADGE_TIERS[BADGE_TIERS.length - 1]).name;
}

/** Clamp helper. */
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * Compute an owner's trust score from raw stats.
 * Pure function — easy to unit test, no DB access here.
 *
 * @param {object} s
 * @param {boolean} s.cnicVerified
 * @param {number}  s.reviewCount
 * @param {number}  s.completedBookings
 * @param {Date|string} s.createdAt
 * @param {number}  s.avgRating       (0–5; 0 if none)
 * @param {number}  s.lateDeliveryStrikes  (count of recorded late/no-show bookings)
 * @returns {{ score:number, badge:string, breakdown:object }}
 */
function computeTrustScore(s = {}) {
  const cnicVerified      = !!s.cnicVerified;
  const reviewCount       = Math.max(0, Number(s.reviewCount) || 0);
  const completedBookings = Math.max(0, Number(s.completedBookings) || 0);
  const avgRating         = clamp(Number(s.avgRating) || 0, 0, 5);
  const lateDeliveryStrikes = Math.max(0, Number(s.lateDeliveryStrikes) || 0);

  // Account age in months
  const created = s.createdAt ? new Date(s.createdAt).getTime() : Date.now();
  const ageMonths = (Date.now() - created) / (1000 * 60 * 60 * 24 * 30.44);

  // Each signal scales linearly up to its target, then caps at full points.
  const cnicPoints     = cnicVerified ? POINTS.CNIC_VERIFIED : 0;
  const reviewPoints   = Math.round(POINTS.REVIEWS_FULL  * clamp(reviewCount       / THRESHOLDS.REVIEWS_TARGET,     0, 1));
  const bookingPoints  = Math.round(POINTS.BOOKINGS_FULL * clamp(completedBookings / THRESHOLDS.BOOKINGS_TARGET,    0, 1));
  const agePoints      = Math.round(POINTS.ACCOUNT_AGE   * clamp(ageMonths         / THRESHOLDS.ACCOUNT_AGE_MONTHS, 0, 1));
  const ratingPoints   = avgRating >= THRESHOLDS.RATING_MIN
    ? Math.round(POINTS.RATING_BONUS * clamp((avgRating - THRESHOLDS.RATING_MIN) / (5 - THRESHOLDS.RATING_MIN), 0, 1))
    : 0;
  // Penalty grows with strikes but is capped so one bad week can't wipe the score out.
  const cappedStrikes  = Math.min(lateDeliveryStrikes, THRESHOLDS.MAX_LATE_STRIKES_COUNTED);
  const latePenalty    = cappedStrikes * POINTS.LATE_DELIVERY_PENALTY;

  const score = clamp(cnicPoints + reviewPoints + bookingPoints + agePoints + ratingPoints - latePenalty, 0, 100);

  return {
    score,
    badge: badgeForScore(score),
    breakdown: {
      cnic:     { earned: cnicPoints,    max: POINTS.CNIC_VERIFIED, met: cnicVerified },
      reviews:  { earned: reviewPoints,  max: POINTS.REVIEWS_FULL,  count: reviewCount,       target: THRESHOLDS.REVIEWS_TARGET },
      bookings: { earned: bookingPoints, max: POINTS.BOOKINGS_FULL, count: completedBookings, target: THRESHOLDS.BOOKINGS_TARGET },
      accountAge: { earned: agePoints,   max: POINTS.ACCOUNT_AGE,   months: Math.floor(ageMonths), target: THRESHOLDS.ACCOUNT_AGE_MONTHS },
      rating:   { earned: ratingPoints,  max: POINTS.RATING_BONUS,  avg: Math.round(avgRating * 10) / 10 },
      lateDelivery: { penalty: latePenalty, strikes: lateDeliveryStrikes, countedStrikes: cappedStrikes },
    },
  };
}

/**
 * Gather an owner's stats from the DB and compute + persist their trust score.
 * Returns { score, badge, breakdown }.
 *
 * @param {string} ownerId
 * @returns {Promise<{score:number, badge:string, breakdown:object}|null>}
 */
async function recalculateForOwner(ownerId) {
  const User = require('../models/User');
  const Review = require('../models/Review');
  const { Booking } = require('../models/Booking');

  const owner = await User.findById(ownerId).select('cnicVerified createdAt role').lean();
  if (!owner) return null;

  const [reviewAgg, completedBookings, lateDeliveryStrikes] = await Promise.all([
    Review.aggregate([
      { $match: { reviewee: owner._id, type: 'renter_to_owner', isPublic: { $ne: false } } },
      { $group: { _id: null, count: { $sum: 1 }, avg: { $avg: '$rating' } } },
    ]),
    Booking.countDocuments({ owner: owner._id, status: 'completed' }),
    Booking.countDocuments({ owner: owner._id, lateDeliveryStrike: true }),
  ]);

  const reviewCount = reviewAgg[0]?.count || 0;
  const avgRating   = reviewAgg[0]?.avg   || 0;

  const result = computeTrustScore({
    cnicVerified: owner.cnicVerified,
    reviewCount,
    completedBookings,
    createdAt: owner.createdAt,
    avgRating,
    lateDeliveryStrikes,
  });

  // Cache on the user document for fast reads.
  await User.updateOne(
    { _id: ownerId },
    { $set: { trustScore: result.score, trustBadge: result.badge, trustScoreUpdatedAt: new Date() } },
  );

  return result;
}

module.exports = {
  computeTrustScore,
  recalculateForOwner,
  badgeForScore,
  getAdvancePercentForBadge,
  ADVANCE_PERCENT_BY_BADGE,
  POINTS,
  THRESHOLDS,
  BADGE_TIERS,
};
