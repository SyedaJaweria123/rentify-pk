'use strict';
const { Booking }     = require('../models/Booking');
const { Listing }     = require('../models/Listing');
const { Transaction } = require('../models/Transaction');
const Review          = require('../models/Review');
const User            = require('../models/User');
const Escrow          = require('../models/Escrow');
const { BADGE_TIERS, getAdvancePercentForBadge } = require('../services/trustScore.service');

// ── GET /api/dashboard/owner ──────────────────────────────────────────────────
const getOwnerDashboard = async (req, res) => {
  try {
    const userId = req.user._id;
    const now    = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [
      listingStats,
      bookingStats,
      recentBookings,
      recentTransactions,
      reviewStats,
      walletInfo,
      monthlyEarnings,
      pendingEscrow,
      uncollectedRemaining,
    ] = await Promise.all([
      // Listing counts by status
      Listing.aggregate([
        { $match: { createdBy: userId, isDeleted: false } },
        { $group: { _id: '$status', count: { $sum: 1 }, views: { $sum: '$views' } } },
      ]),
      // Booking stats
      Booking.aggregate([
        { $match: { owner: userId } },
        { $group: { _id: '$status', count: { $sum: 1 }, revenue: { $sum: '$totalAmount' } } },
      ]),
      // Recent bookings
      Booking.find({ owner: userId })
        .populate('listing', 'title images')
        .populate('renter',  'name avatar')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      // Recent transactions
      Transaction.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      // Review stats
      Review.getUserStats(userId, 'renter_to_owner'),
      // Wallet
      User.findById(userId).select('walletBalance trustScore trustBadge'),
      // Monthly earnings (last 6 months)
      Transaction.aggregate([
        {
          $match: {
            user: userId,
            type: 'booking_earning',
            status: 'completed',
            createdAt: { $gte: new Date(now - 6 * 30 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            earnings: { $sum: '$amount' },
            count:    { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      // Money still sitting in escrow for this owner's bookings — what the
      // escrow/payout cron will release once the grace period clears.
      Escrow.aggregate([
        { $match: { owner: userId, status: 'holding' } },
        { $group: { _id: null, amount: { $sum: '$rentalAmount' }, count: { $sum: 1 } } },
      ]),
      // Trust-Tiered Payment: remaining balances not yet collected by the
      // rider (cash/wallet at handover) on this owner's active bookings.
      Booking.aggregate([
        {
          $match: {
            owner: userId,
            remainingAmount: { $gt: 0 },
            remainingCollectedAt: null,
            remainingRefused: { $ne: true },
            status: { $in: ['confirmed', 'in_delivery', 'delivered', 'active'] },
          },
        },
        { $group: { _id: null, amount: { $sum: '$remainingAmount' }, count: { $sum: 1 } } },
      ]),
    ]);

    // Normalize listing stats
    const listingMap = { active: 0, inactive: 0, rented: 0, deleted: 0, totalViews: 0 };
    listingStats.forEach(s => {
      listingMap[s._id] = s.count;
      listingMap.totalViews += s.views || 0;
    });

    // Normalize booking stats
    const bookingMap = { pending: 0, confirmed: 0, active: 0, completed: 0, cancelled: 0, totalRevenue: 0 };
    bookingStats.forEach(s => {
      bookingMap[s._id] = s.count;
      if (s._id === 'completed') bookingMap.totalRevenue += s.revenue || 0;
    });

    const pendingPayout = pendingEscrow[0] || { amount: 0, count: 0 };
    const pendingRemaining = uncollectedRemaining[0] || { amount: 0, count: 0 };

    // Trust badge + how far from the next tier — sorted ascending by min
    // score so we can find the next tier above the owner's current one.
    const tiersAscending = [...BADGE_TIERS].sort((a, b) => a.min - b.min);
    const myScore = walletInfo.trustScore || 0;
    const myBadge = walletInfo.trustBadge || 'none';
    const nextTier = tiersAscending.find(t => t.min > myScore) || null;

    return res.json({
      success: true,
      data: {
        wallet: {
          balance: walletInfo.walletBalance,
          pendingPayout: pendingPayout.amount,
          pendingPayoutCount: pendingPayout.count,
          pendingRemaining: pendingRemaining.amount,
          pendingRemainingCount: pendingRemaining.count,
        },
        trust: {
          score: myScore,
          badge: myBadge,
          advancePercent: getAdvancePercentForBadge(myBadge),
          nextTier: nextTier ? { name: nextTier.name, pointsNeeded: nextTier.min - myScore, minScore: nextTier.min } : null,
        },
        listings: listingMap,
        bookings: bookingMap,
        reviews:  reviewStats,
        recentBookings,
        recentTransactions,
        monthlyEarnings,
      },
    });
  } catch (err) {
    console.error('[getOwnerDashboard]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch dashboard.' });
  }
};

// ── GET /api/dashboard/renter ─────────────────────────────────────────────────
const getRenterDashboard = async (req, res) => {
  try {
    const userId = req.user._id;

    const [bookingStats, recentBookings, reviewStats, walletInfo, spendTrend, allBookings] = await Promise.all([
      Booking.aggregate([
        { $match: { renter: userId } },
        { $group: { _id: '$status', count: { $sum: 1 }, spent: { $sum: '$totalAmount' } } },
      ]),
      Booking.find({ renter: userId })
        .populate('listing', 'title images city')
        .populate('owner',   'name avatar')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Review.getUserStats(userId, 'owner_to_renter'),
      User.findById(userId).select('walletBalance'),
      // Last 7 days spending trend (completed/active bookings by day)
      Booking.aggregate([
        { $match: {
            renter: userId,
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        } },
        { $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            spent: { $sum: '$totalAmount' },
            count: { $sum: 1 },
        } },
        { $sort: { _id: 1 } },
      ]),
      // All bookings for category breakdown
      Booking.find({ renter: userId })
        .populate('listing', 'category')
        .select('listing totalAmount')
        .lean(),
    ]);

    const bookingMap = { pending: 0, confirmed: 0, active: 0, completed: 0, cancelled: 0, totalSpent: 0, total: 0 };
    bookingStats.forEach(s => {
      bookingMap[s._id] = s.count;
      bookingMap.totalSpent += s.spent || 0;
      bookingMap.total += s.count;
    });

    // Build a continuous 7-day trend (fill missing days with 0)
    const trendMap = {};
    spendTrend.forEach(d => { trendMap[d._id] = { spent: d.spent, count: d.count }; });
    const weeklyTrend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      weeklyTrend.push({
        date: key,
        spent: trendMap[key]?.spent || 0,
        count: trendMap[key]?.count || 0,
      });
    }

    // Category breakdown
    const categoryMap = {};
    allBookings.forEach(b => {
      const cat = b.listing?.category || 'Other';
      categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    });
    const categoryBreakdown = Object.entries(categoryMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return res.json({
      success: true,
      data: {
        wallet:        { balance: walletInfo.walletBalance },
        bookings:      bookingMap,
        reviews:       reviewStats,
        recentBookings,
        weeklyTrend,
        categoryBreakdown,
      },
    });
  } catch (err) {
    console.error('[getRenterDashboard]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch dashboard.' });
  }
};

module.exports = { getOwnerDashboard, getRenterDashboard };
