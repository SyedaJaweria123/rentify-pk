// backend/controllers/admin.controller.js
'use strict';
const User        = require('../models/User');
const ContactMessage = require('../models/ContactMessage');
const { Listing } = require('../models/Listing');
const { Booking }     = require('../models/Booking');
const { Transaction } = require('../models/Transaction');
const { Notification } = require('../models/Notification');
const email       = require('../utils/email'); // account-suspended email trigger
const { recalculateForOwner } = require('../services/trustScore.service');

// ── Dashboard stats cache (5-min TTL) — avoids 16+ DB queries per request ─────
let _statsCache = { data: null, expiresAt: 0 };
const STATS_TTL = 5 * 60 * 1000; // 5 minutes
exports.invalidateStatsCache = function () { _statsCache = { data: null, expiresAt: 0 }; };
function invalidateStatsCache() { _statsCache = { data: null, expiresAt: 0 }; }

// ── Dashboard Stats ───────────────────────────────────────────────────────────
exports.getDashboardStats = async (req, res) => {
  try {
    // Serve from cache if still fresh
    if (_statsCache.data && Date.now() < _statsCache.expiresAt) {
      return res.json({ success: true, data: _statsCache.data, cached: true });
    }

    const now        = new Date();
    const thisMonth  = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth  = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      totalUsers, totalOwners, totalListings, totalBookings,
      activeBookings, pendingCNIC, pendingOwners,
      thisMonthUsers, lastMonthUsers,
      thisMonthBookings, lastMonthBookings,
      thisMonthListings, lastMonthListings,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'owner' }),
      Listing.countDocuments({ isDeleted: false }),
      Booking.countDocuments(),
      Booking.countDocuments({ status: { $in: ['confirmed', 'active'] } }),
      User.countDocuments({ cnicNumber: { $exists: true }, cnicVerified: false, cnicRejected: false }),
      User.countDocuments({ role: 'owner', ownerApproved: false }),
      User.countDocuments({ createdAt: { $gte: thisMonth } }),
      User.countDocuments({ createdAt: { $gte: lastMonth, $lt: thisMonth } }),
      Booking.countDocuments({ createdAt: { $gte: thisMonth } }),
      Booking.countDocuments({ createdAt: { $gte: lastMonth, $lt: thisMonth } }),
      // NEW: month-over-month listing counts (for real listingGrowth)
      Listing.countDocuments({ isDeleted: false, createdAt: { $gte: thisMonth } }),
      Listing.countDocuments({ isDeleted: false, createdAt: { $gte: lastMonth, $lt: thisMonth } }),
    ]);

    // Total all-time service-fee revenue
    const revenueAgg = await Transaction.aggregate([
      { $match: { type: 'service_fee', status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;

    // NEW: month-over-month service-fee revenue buckets (for real revenueGrowth)
    const [thisMonthRevAgg, lastMonthRevAgg] = await Promise.all([
      Transaction.aggregate([
        { $match: { type: 'service_fee', status: 'completed', createdAt: { $gte: thisMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Transaction.aggregate([
        { $match: { type: 'service_fee', status: 'completed', createdAt: { $gte: lastMonth, $lt: thisMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);
    const thisMonthRevenue = thisMonthRevAgg[0]?.total || 0;
    const lastMonthRevenue = lastMonthRevAgg[0]?.total || 0;

    // All growth % computed real (divide-by-zero guarded → 0)
    const userGrowth    = lastMonthUsers    ? ((thisMonthUsers    - lastMonthUsers)    / lastMonthUsers    * 100).toFixed(1) : 0;
    const bookingGrowth = lastMonthBookings ? ((thisMonthBookings - lastMonthBookings) / lastMonthBookings * 100).toFixed(1) : 0;
    const revenueGrowth = lastMonthRevenue  ? ((thisMonthRevenue  - lastMonthRevenue)  / lastMonthRevenue  * 100).toFixed(1) : 0;
    const listingGrowth = lastMonthListings ? ((thisMonthListings - lastMonthListings) / lastMonthListings * 100).toFixed(1) : 0;

    const statsData = {
      totalUsers, totalOwners, totalListings, totalBookings,
      activeBookings, pendingCNIC, pendingOwners, totalRevenue,
      userGrowth:    +userGrowth,
      bookingGrowth: +bookingGrowth,
      revenueGrowth: +revenueGrowth,
      listingGrowth: +listingGrowth,
    };

    // Cache for 5 minutes
    _statsCache = { data: statsData, expiresAt: Date.now() + STATS_TTL };

    res.json({ success: true, data: statsData });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Recent Activity ───────────────────────────────────────────────────────────
exports.getRecentActivity = async (req, res) => {
  try {
    const [bookings, users] = await Promise.all([
      Booking.find().sort({ createdAt: -1 }).limit(5)
        .populate('listing', 'title images')
        .populate('renter', 'name email')
        .lean(),
      User.find().sort({ createdAt: -1 }).limit(5)
        .select('name email role createdAt avatar').lean(),
    ]);
    res.json({ success: true, data: { bookings, users } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Users ─────────────────────────────────────────────────────────────────────
exports.getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', role = '', status = '' } = req.query;
    const query = {};
    if (search) query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
    if (role)   query.role = role;
    if (status === 'suspended') query.isSuspended = true;
    if (status === 'active')    query.isActive = true, query.isSuspended = false;

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select('-password -refreshToken -emailToken -resetOTP')
      .sort({ createdAt: -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit)
      .lean();

    res.json({
      success: true,
      data: {
        users,
        pagination: { total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -refreshToken').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Counts for the admin detail modal (bookings, listings, reviews given)
    const { Booking }     = require('../models/Booking');
    const { Listing }     = require('../models/Listing');
    const Review          = require('../models/Review');   // direct export
    const [bookingsCount, listingsCount, reviewsGiven] = await Promise.all([
      Booking.countDocuments({ $or: [{ renter: user._id }, { owner: user._id }] }),
      Listing.countDocuments({ createdBy: user._id, isDeleted: false }),
      Review.countDocuments({ reviewer: user._id }),
    ]);

    res.json({
      success: true,
      data: {
        user,
        stats: {
          bookingsCount,
          listingsCount,
          reviewsGiven,
          walletBalance: user.walletBalance || 0,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    // SECURITY: never allow role changes here (prevents privilege escalation)
    const { name, phone } = req.body;
    const updates = {};
    if (name  !== undefined) updates.name  = name;
    if (phone !== undefined) updates.phone = phone;

    const user = await User.findByIdAndUpdate(
      req.params.id, updates, { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: { user } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.suspendUser = async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isSuspended: true, suspendReason: reason },
      { new: true }
    ).select('name email');

    // Notify + email the suspended user with appeal instructions (non-blocking)
    if (user) {
      try {
        await Notification.notify(
          user._id, 'account_suspended',
          'Account Suspended',
          `Your account has been suspended. Reason: ${reason || 'Violation of terms'}.`,
          {}
        );
      } catch (e) { console.warn('[notify suspend]', e.message); }
      try {
        if (user.email) {
          await email.sendAccountSuspendedEmail({
            to: user.email, name: user.name, reason,
          });
        }
      } catch (e) { console.warn('[email accountSuspended]', e.message); }
    }

    res.json({ success: true, message: 'User suspended' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.unsuspendUser = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { isSuspended: false, suspendReason: null });
    res.json({ success: true, message: 'User unsuspended' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // SECURITY: never delete privileged accounts
    if (['admin', 'super_admin', 'manager'].includes(user.role)) {
      return res.status(403).json({ success: false, message: 'Cannot delete an admin/manager account' });
    }

    // Soft delete: deactivate + suspend, free up the email
    user.isActive    = false;
    user.isSuspended = true;
    if (user.email && !user.email.includes('__deleted__')) {
      user.email = `${user.email}__deleted__${Date.now()}`;
    }
    await user.save();

    // Deactivate all their listings
    await Listing.updateMany({ createdBy: user._id, isDeleted: false }, { $set: { status: 'inactive' } });

    invalidateStatsCache();
    res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.verifyCNIC = async (req, res) => {
  try {
    const { approved, reason } = req.body;
    const update = approved
      ? { cnicVerified: true, cnicRejected: false, cnicVerifiedAt: new Date(), cnicVerifiedBy: req.user._id }
      : { cnicVerified: false, cnicRejected: true, cnicRejectReason: reason };
    await User.findByIdAndUpdate(req.params.id, update);

    // CNIC verification is worth +30 trust-score points on its own — recompute
    // now so the owner's badge (and the advance % renters see) reflects it
    // immediately rather than staying stuck at whatever it was before.
    try { await recalculateForOwner(req.params.id); } catch (e) { console.error('[verifyCNIC] trust recalc failed:', e.message); }

    await Notification.notify(req.params.id, approved ? 'account_verified' : 'listing_rejected',
      approved ? 'CNIC Verified ✅' : 'CNIC Rejected ❌',
      approved ? 'Your CNIC has been verified.' : `Rejected: ${reason}`);
    res.json({ success: true, message: `CNIC ${approved ? 'approved' : 'rejected'}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.approveOwner = async (req, res) => {
  try {
    const { approved } = req.body;
    await User.findByIdAndUpdate(req.params.id, {
      ownerApproved: approved,
      ownerApprovedAt: approved ? new Date() : null,
    });
    res.json({ success: true, message: `Owner ${approved ? 'approved' : 'rejected'}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Listings ──────────────────────────────────────────────────────────────────
exports.getListings = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = '', category = '', city = '', fromDate = '', toDate = '' } = req.query;
    const query = { isDeleted: false };

    // Escape regex special chars to prevent ReDoS / injection
    const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (search)   query.title    = { $regex: esc(search), $options: 'i' };
    if (status)   query.status   = status;
    if (category) query.category = category;
    if (city)     query.city     = { $regex: esc(city), $options: 'i' };

    // Date range filter on createdAt
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate)   query.createdAt.$lte = new Date(toDate);
    }

    const total    = await Listing.countDocuments(query);

    // Real platform-wide stats (NOT page-scoped) — respects current filters except status
    const statsQuery = { ...query };
    delete statsQuery.status;
    const [activeCount, inactiveCount, viewsAgg] = await Promise.all([
      Listing.countDocuments({ ...statsQuery, status: 'active' }),
      Listing.countDocuments({ ...statsQuery, status: { $ne: 'active' } }),
      Listing.aggregate([{ $match: statsQuery }, { $group: { _id: null, views: { $sum: '$views' } } }]),
    ]);
    const totalViews = viewsAgg[0]?.views || 0;

    let listings   = await Listing.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip((+page - 1) * +limit).limit(+limit).lean();

    // Booking counts per listing (single grouped query)
    const ids = listings.map(l => l._id);
    const counts = await Booking.aggregate([
      { $match: { listing: { $in: ids } } },
      { $group: { _id: '$listing', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    counts.forEach(c => { countMap[String(c._id)] = c.count; });

    // Enrich each listing with owner info + bookings count
    listings = listings.map(l => ({
      ...l,
      ownerName:     l.createdBy?.name  || 'Unknown',
      ownerEmail:    l.createdBy?.email || '',
      bookingsCount: countMap[String(l._id)] || 0,
    }));

    // Optionally filter the current page by owner name (post-populate)
    if (search) {
      const re = new RegExp(esc(search), 'i');
      listings = listings.filter(l => re.test(l.title || '') || re.test(l.ownerName || ''));
    }

    res.json({
      success: true,
      data: {
        listings,
        stats: { active: activeCount, inactive: inactiveCount, totalViews, total },
        pagination: { total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateListingStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['active', 'inactive', 'rented', 'deleted'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Allowed: ${allowed.join(', ')}` });
    }

    const listing = await Listing.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });

    // Notify the owner of the status change
    try {
      await Notification.notify(listing.createdBy, 'system', 'Listing Status Updated',
        `Your listing "${listing.title}" is now marked as ${status}.`, { listingId: listing._id });
    } catch (e) { console.error('notify failed:', e.message); }

    invalidateStatsCache();
    res.json({ success: true, message: `Listing ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });

    // Soft delete (model method sets isDeleted + status + deletedBy)
    await listing.softDelete(req.user._id);

    // Remove images from Cloudinary
    try {
      const publicIds = (listing.images || []).map(i => i.publicId).filter(Boolean);
      if (publicIds.length) await require('../config/cloudinary').deleteImages(publicIds);
    } catch (e) { console.error('cloudinary delete failed:', e.message); }

    // Notify the owner
    try {
      await Notification.notify(listing.createdBy, 'system', 'Listing Removed',
        `Your listing "${listing.title}" has been removed by an administrator.`, { listingId: listing._id });
    } catch (e) { console.error('notify failed:', e.message); }

    invalidateStatsCache();
    res.json({ success: true, message: 'Listing deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Bulk listing actions ──────────────────────────────────────────────────────
exports.bulkUpdateListings = async (req, res) => {
  try {
    const { ids, action } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ success: false, message: 'ids array required' });
    }
    if (ids.length > 100) {
      return res.status(400).json({ success: false, message: 'Max 100 listings per bulk action' });
    }
    const actions = {
      activate:   { status: 'active' },
      deactivate: { status: 'inactive' },
      delete:     { isDeleted: true, status: 'deleted' },
    };
    if (!actions[action]) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    const result = await Listing.updateMany({ _id: { $in: ids } }, { $set: actions[action] });
    invalidateStatsCache();
    res.json({ success: true, message: `${result.modifiedCount || 0} listings updated`, data: { modified: result.modifiedCount || 0 } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Export listings as CSV ──────────────────────────────────────────────────────
exports.exportListings = async (req, res) => {
  try {
    const listings = await Listing.find({ isDeleted: false })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(5000).lean();

    const headers = ['Title', 'Owner', 'Email', 'Category', 'City', 'Price', 'Status', 'Views', 'Created'];
    const escCsv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = listings.map(l => [
      escCsv(l.title), escCsv(l.createdBy?.name || ''), escCsv(l.createdBy?.email || ''),
      escCsv(l.category), escCsv(l.city || ''), l.price || 0,
      escCsv(l.status), l.views || 0, new Date(l.createdAt).toISOString().slice(0, 10),
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');

    const filename = `listings-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Bookings ──────────────────────────────────────────────────────────────────
exports.getBookings = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = '', fromDate = '', toDate = '' } = req.query;
    const query = {};
    if (status) query.status = status;

    // Date range on createdAt
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate)   query.createdAt.$lte = new Date(toDate);
    }

    const total    = await Booking.countDocuments(query);
    let bookings = await Booking.find(query)
      .populate('listing', 'title images')
      .populate('renter',  'name email')
      .populate('owner',   'name email')
      .sort({ createdAt: -1 })
      .skip((+page - 1) * +limit).limit(+limit).lean();

    // Post-populate search: renter name/email or listing title
    if (search) {
      const esc = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(esc, 'i');
      bookings = bookings.filter(b =>
        re.test(b.renter?.name || '') || re.test(b.renter?.email || '') || re.test(b.listing?.title || '')
      );
    }

    res.json({
      success: true,
      data: { bookings, pagination: { total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) } },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Update Booking Status (admin approve / confirm / active / complete / cancel) ─
exports.updateBookingStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'confirmed', 'active', 'completed', 'cancelled'];

    // 1. Validate the requested status
    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed: ${allowed.join(', ')}`,
      });
    }

    // 2. Load booking (404 if missing)
    const booking = await Booking.findById(req.params.id)
      .populate('renter', 'name')
      .populate('owner', 'name')
      .populate('listing', 'title');
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // 3. Guard against invalid transitions.
    //    Terminal states (completed / cancelled) cannot be re-opened.
    const terminal = ['completed', 'cancelled'];
    if (terminal.includes(booking.status) && booking.status !== status) {
      return res.status(400).json({
        success: false,
        message: `Cannot change a ${booking.status} booking. This booking is finalised.`,
      });
    }
    // A completed booking can only come from an active/confirmed one
    if (status === 'completed' && !['active', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: 'Only active or confirmed bookings can be marked completed.',
      });
    }
    // 'active' should follow 'confirmed'
    if (status === 'active' && booking.status !== 'confirmed') {
      return res.status(400).json({
        success: false,
        message: 'Only a confirmed booking can be marked active.',
      });
    }

    // 4. Apply the status + relevant timestamps
    const prevStatus = booking.status;
    booking.status = status;
    if (status === 'confirmed') booking.confirmedAt = new Date();
    if (status === 'completed') booking.completedAt = new Date();
    if (status === 'cancelled') {
      booking.cancelledAt = new Date();
      booking.cancelledBy = req.user._id;
    }
    await booking.save();

    // 5. Notify the renter (and owner) about the change.
    //    Map booking status → notification type from the model enum.
    const typeMap = {
      confirmed: 'booking_confirmed',
      active:    'booking_started',
      completed: 'booking_completed',
      cancelled: 'booking_cancelled',
    };
    const notifType = typeMap[status];
    if (notifType) {
      const listingTitle = booking.listing?.title || 'your booking';
      const title = {
        confirmed: 'Booking Confirmed',
        active:    'Rental Started',
        completed: 'Booking Completed',
        cancelled: 'Booking Cancelled',
      }[status];
      const body = {
        confirmed: `Your booking for "${listingTitle}" has been confirmed.`,
        active:    `Your rental for "${listingTitle}" is now active.`,
        completed: `Your booking for "${listingTitle}" is complete. Please leave a review.`,
        cancelled: `Your booking for "${listingTitle}" has been cancelled.`,
      }[status];

      const meta = { bookingId: booking._id, listingId: booking.listing?._id };
      // Notify renter + owner (guard if either is missing)
      const recipients = [booking.renter?._id, booking.owner?._id].filter(Boolean);
      await Promise.all(
        recipients.map(rid => Notification.notify(rid, notifType, title, body, meta))
      );
    }

    res.json({
      success: true,
      message: `Booking ${prevStatus} → ${status}`,
      data: { booking },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Chart Data Endpoints (all real MongoDB aggregations) ──────────────────────

// Helper: build the time buckets for a given period.
// monthly = last 12 months, weekly = last 8 weeks, daily = last 14 days.
function buildBuckets(period) {
  const now = new Date();
  const buckets = [];
  if (period === 'daily') {
    for (let i = 13; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1);
      buckets.push({ label: `${start.getDate()}/${start.getMonth() + 1}`, start, end });
    }
  } else if (period === 'weekly') {
    for (let i = 7; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (i * 7) - 6);
      const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (i * 7) + 1);
      buckets.push({ label: `W${8 - i}`, start, end });
    }
  } else { // monthly (default)
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end   = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      buckets.push({ label: monthNames[start.getMonth()], start, end });
    }
  }
  return buckets;
}

// Revenue line/area chart — service-fee revenue per time bucket
exports.getRevenueChart = async (req, res) => {
  try {
    const period  = req.query.period || 'monthly';
    const buckets = buildBuckets(period);

    // One aggregation per bucket (kept simple + readable; bucket count is small)
    const data = await Promise.all(buckets.map(async (b) => {
      const agg = await Transaction.aggregate([
        { $match: { type: 'service_fee', status: 'completed', createdAt: { $gte: b.start, $lt: b.end } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]);
      return agg[0]?.total || 0;
    }));

    res.json({
      success: true,
      data: { labels: buckets.map(b => b.label), values: data },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Bookings bar chart — booking count per time bucket
exports.getBookingsChart = async (req, res) => {
  try {
    const period  = req.query.period || 'monthly';
    const buckets = buildBuckets(period);

    const data = await Promise.all(buckets.map(b =>
      Booking.countDocuments({ createdAt: { $gte: b.start, $lt: b.end } })
    ));

    res.json({
      success: true,
      data: { labels: buckets.map(b => b.label), values: data },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// User growth line chart — new users per month (last 12 months)
exports.getUserGrowthChart = async (req, res) => {
  try {
    const buckets = buildBuckets('monthly');
    const data = await Promise.all(buckets.map(b =>
      User.countDocuments({ createdAt: { $gte: b.start, $lt: b.end } })
    ));
    res.json({
      success: true,
      data: { labels: buckets.map(b => b.label), values: data },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Category breakdown doughnut — listing count grouped by category
exports.getCategoryChart = async (req, res) => {
  try {
    const agg = await Listing.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]);
    res.json({
      success: true,
      data: {
        labels: agg.map(a => a._id || 'Other'),
        values: agg.map(a => a.count),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── CNIC verification status breakdown (donut) ─────────────────────────────────
// Counts every account that has submitted a CNIC at all (cnicNumber set),
// split into Verified / Pending / Rejected. Accounts that never started
// CNIC verification (pure renters, most of them) are intentionally excluded —
// "not submitted" isn't a verification outcome, it would just dilute the chart.
exports.getCnicStatusChart = async (req, res) => {
  try {
    const [verified, rejected, pendingTotal] = await Promise.all([
      User.countDocuments({ cnicNumber: { $exists: true, $ne: null }, cnicVerified: true }),
      User.countDocuments({ cnicNumber: { $exists: true, $ne: null }, cnicVerified: false, cnicRejected: true }),
      User.countDocuments({ cnicNumber: { $exists: true, $ne: null }, cnicVerified: false, cnicRejected: false }),
    ]);
    res.json({
      success: true,
      data: {
        labels: ['Verified', 'Pending', 'Rejected'],
        values: [verified, pendingTotal, rejected],
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Face-match score distribution (histogram-style bar) ────────────────────────
// Buckets every account that has actually been through a face-match run
// (cnicFaceMatchScore is not null) into 5 score ranges. Shows how the
// face-verification system is actually performing in practice — e.g. if
// almost everything clusters at 90-100%, that's a healthy signal; if there's
// a meaningful chunk just above the 30% auto-reject line, that's worth an
// admin's attention even though those accounts technically passed.
exports.getFaceMatchChart = async (req, res) => {
  try {
    const agg = await User.aggregate([
      { $match: { cnicFaceMatchScore: { $ne: null } } },
      {
        $bucket: {
          groupBy: '$cnicFaceMatchScore',
          boundaries: [0, 30, 50, 70, 90, 101], // 101 so a perfect 100 falls in the last bucket
          default: 'other',
          output: { count: { $sum: 1 } },
        },
      },
    ]);

    // $bucket returns sparse results (only buckets that have at least one
    // match) — reindex into a fixed 5-label set so the chart always shows
    // all ranges, with 0 for any range that has no accounts yet.
    const ranges = [
      { lo: 0,  label: '0-29% (below threshold)' },
      { lo: 30, label: '30-49%' },
      { lo: 50, label: '50-69%' },
      { lo: 70, label: '70-89%' },
      { lo: 90, label: '90-100%' },
    ];
    const countsByLo = {};
    agg.forEach(b => { if (typeof b._id === 'number') countsByLo[b._id] = b.count; });

    res.json({
      success: true,
      data: {
        labels: ranges.map(r => r.label),
        values: ranges.map(r => countsByLo[r.lo] || 0),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Revenue ───────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS  GET /api/admin/analytics
// Top 5 cities by listing count + Top 10 owners by earnings (service-fee/earning txns)
// ═══════════════════════════════════════════════════════════════════════════
exports.getAnalytics = async (req, res) => {
  try {
    // Top 5 cities by number of active listings
    const topCities = await Listing.aggregate([
      { $match: { isDeleted: false, city: { $ne: null } } },
      { $group: { _id: '$city', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    // Top 10 owners by total earnings (owner payouts are 'booking_earning')
    const topOwnersAgg = await Transaction.aggregate([
      { $match: { type: 'booking_earning', status: 'completed' } },
      { $group: { _id: '$user', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } },
      { $limit: 10 },
    ]);
    // Attach owner names/emails
    const ownerIds = topOwnersAgg.map(o => o._id);
    const owners   = await User.find({ _id: { $in: ownerIds } }).select('name email').lean();
    const ownerMap = {};
    owners.forEach(o => { ownerMap[o._id.toString()] = o; });
    const topOwners = topOwnersAgg.map(o => ({
      id: o._id,
      name:  ownerMap[o._id?.toString()]?.name  || 'Unknown',
      email: ownerMap[o._id?.toString()]?.email || '',
      earnings: o.total,
    }));

    res.json({
      success: true,
      data: {
        topCities: topCities.map(c => ({ city: c._id, listings: c.count })),
        topOwners,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// REPORTS  GET /api/admin/reports/:type?from=&to=
// type ∈ users | revenue | listings | bookings → returns rows for preview/export
// ═══════════════════════════════════════════════════════════════════════════
exports.getReports = async (req, res) => {
  try {
    const { type } = req.params;
    const { from, to } = req.query;
    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to)   dateFilter.$lte = new Date(to);
    const hasDate = Object.keys(dateFilter).length > 0;

    let rows = [];
    if (type === 'users') {
      const q = hasDate ? { createdAt: dateFilter } : {};
      const users = await User.find(q).select('name email role createdAt isSuspended').sort({ createdAt: -1 }).limit(500).lean();
      rows = users.map(u => ({
        name: u.name, email: u.email, role: u.role,
        status: u.isSuspended ? 'banned' : 'active',
        date: u.createdAt,
      }));
    } else if (type === 'listings') {
      const q = { isDeleted: false, ...(hasDate ? { createdAt: dateFilter } : {}) };
      const listings = await Listing.find(q).populate('createdBy', 'name').sort({ createdAt: -1 }).limit(500).lean();
      rows = listings.map(l => ({
        title: l.title, owner: l.createdBy?.name || '—', category: l.category,
        price: l.price, status: l.status, date: l.createdAt,
      }));
    } else if (type === 'bookings') {
      const q = hasDate ? { createdAt: dateFilter } : {};
      const bookings = await Booking.find(q)
        .populate('listing', 'title').populate('renter', 'name').populate('owner', 'name')
        .sort({ createdAt: -1 }).limit(500).lean();
      rows = bookings.map(b => ({
        item: b.listing?.title || '—', renter: b.renter?.name || '—', owner: b.owner?.name || '—',
        amount: b.totalAmount || 0, status: b.status, date: b.createdAt,
      }));
    } else if (type === 'revenue') {
      const q = hasDate ? { createdAt: dateFilter } : {};
      const txns = await Transaction.find(q).populate('user', 'name').sort({ createdAt: -1 }).limit(500).lean();
      rows = txns.map(t => ({
        user: t.user?.name || '—', type: t.type, amount: t.amount,
        status: t.status, date: t.createdAt,
      }));
    } else {
      return res.status(400).json({ success: false, message: 'Invalid report type.' });
    }

    res.json({ success: true, data: { type, count: rows.length, rows } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Revenue ───────────────────────────────────────────────────────────────────
exports.getRevenueSummary = async (req, res) => {
  try {
    const [earned, withdrawn, fees] = await Promise.all([
      // Total money that flowed to owners + riders through the platform.
      // (Types are 'booking_earning' / 'rider_earning', not 'earning'.)
      Transaction.aggregate([
        { $match: { type: { $in: ['booking_earning', 'rider_earning'] }, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      // Withdrawals are stored as negative amounts; count both pending and
      // completed as "payouts" and flip the sign so the card shows a positive.
      Transaction.aggregate([
        { $match: { type: 'withdrawal', status: { $in: ['pending', 'completed'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Transaction.aggregate([
        { $match: { type: 'service_fee', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);
    res.json({
      success: true,
      data: {
        totalEarned:    earned[0]?.total    || 0,
        totalWithdrawn: Math.abs(withdrawn[0]?.total || 0),
        totalFees:      fees[0]?.total      || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Platform Wallet ───────────────────────────────────────────────────────────
// GET /api/admin/platform-wallet — the platform's own commission ledger:
// a running balance plus the paginated history of every service-fee row.
exports.getPlatformWallet = async (req, res) => {
  try {
    const page  = Math.max(1, +req.query.page  || 1);
    const limit = Math.min(50, +req.query.limit || 15);

    // Available balance = commission earned − what's already been withdrawn
    // (pending withdrawals count too, so the money can't be requested twice).
    const LEDGER = { $in: ['service_fee', 'platform_withdrawal'] };

    const [earnedAgg, withdrawnAgg, thisMonthAgg, count, rows] = await Promise.all([
      Transaction.aggregate([
        { $match: { type: 'service_fee', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        { $match: { type: 'platform_withdrawal', status: { $in: ['pending', 'completed'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Transaction.aggregate([
        { $match: {
          type: 'service_fee', status: 'completed',
          createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Transaction.countDocuments({ type: LEDGER }),
      Transaction.find({ type: LEDGER })
        .populate({ path: 'booking', select: 'listing', populate: { path: 'listing', select: 'title' } })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit).limit(limit).lean(),
    ]);

    const earned    = earnedAgg[0]?.total || 0;
    const txnCount  = earnedAgg[0]?.count || 0;
    // Withdrawals are stored negative (Transaction.debit), so this adds up to
    // a negative number — abs() it for display.
    const withdrawn = Math.abs(withdrawnAgg[0]?.total || 0);
    const thisMonth = thisMonthAgg[0]?.total || 0;

    const history = rows.map(r => ({
      _id: r._id,
      type: r.type,
      amount: r.amount,
      status: r.status,
      item: r.type === 'platform_withdrawal'
        ? (r.description || 'Platform withdrawal')
        : (r.booking?.listing?.title || '—'),
      bookingId: r.booking?._id || r.booking || null,
      date: r.createdAt,
      backfilled: !!r.meta?.backfilled,
    }));

    res.json({
      success: true,
      data: {
        balance: earned - withdrawn,
        earned,
        withdrawn,
        thisMonth,
        txnCount,
        avgFee: txnCount ? Math.round(earned / txnCount) : 0,
        history,
        pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/admin/platform-wallet/withdraw — withdraw from the commission
// balance. Mirrors the owner wallet flow (same methods, same Rs 100 minimum),
// but debits the platform ledger rather than any user's wallet.
exports.withdrawPlatformFunds = async (req, res) => {
  try {
    const { amount, method, accountNumber } = req.body;

    if (!amount || !method || !accountNumber) {
      return res.status(400).json({ success: false, message: 'amount, method, accountNumber are required.' });
    }

    const withdrawAmount = parseFloat(amount);
    if (isNaN(withdrawAmount) || withdrawAmount < 100) {
      return res.status(400).json({ success: false, message: 'Minimum withdrawal is Rs. 100.' });
    }

    const VALID_METHODS = ['easypaisa', 'jazzcash', 'bank_transfer'];
    if (!VALID_METHODS.includes(method)) {
      return res.status(400).json({ success: false, message: `Invalid method. Use: ${VALID_METHODS.join(', ')}` });
    }

    // Recompute the available balance server-side — never trust a client total.
    const [earnedAgg, withdrawnAgg] = await Promise.all([
      Transaction.aggregate([
        { $match: { type: 'service_fee', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Transaction.aggregate([
        { $match: { type: 'platform_withdrawal', status: { $in: ['pending', 'completed'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    const earned    = earnedAgg[0]?.total || 0;
    const withdrawn = Math.abs(withdrawnAgg[0]?.total || 0);
    const available = earned - withdrawn;

    if (available < withdrawAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient balance. Available: Rs. ${Math.round(available)}`,
      });
    }

    const masked = String(accountNumber).slice(-4).padStart(String(accountNumber).length, '*');

    const tx = await Transaction.create({
      user: null,                       // platform ledger, not a user wallet
      type: 'platform_withdrawal',
      amount: -Math.abs(withdrawAmount),  // negative = debit, same as user withdrawals
      balance: available - withdrawAmount,
      status: 'pending',
      description: `Platform withdrawal via ${method} to ${masked}`,
      withdrawalMethod: method,
      withdrawalAccount: accountNumber,
      meta: { platform: true, requestedBy: req.user?._id || null },
    });

    return res.json({
      success: true,
      message: `Withdrawal of Rs. ${withdrawAmount} requested successfully. Processing in 1-3 business days.`,
      data: { transaction: tx, newBalance: available - withdrawAmount },
    });
  } catch (err) {
    console.error('[withdrawPlatformFunds]', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 10, type = '' } = req.query;
    const query = {};
    if (type) query.type = type;
    const total = await Transaction.countDocuments(query);
    const txns  = await Transaction.find(query)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip((+page - 1) * +limit).limit(+limit).lean();
    res.json({ success: true, data: { transactions: txns, pagination: { total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) } } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Notifications ─────────────────────────────────────────────────────────────
// GET /api/admin/notifications/feed — recent platform notifications (all users)
// Lets the admin see live activity across the platform from the bell dropdown.
exports.getAdminNotifications = async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit) || 15);
    const notifications = await Notification.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('recipient', 'name')
      .lean();

    // unreadCount here = notifications created in the last 24h (a useful "new activity" signal)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const unreadCount = await Notification.countDocuments({ createdAt: { $gte: since } });

    res.json({ success: true, data: { notifications, unreadCount } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.sendAnnouncement = async (req, res) => {
  try {
    const { title, body, targetRole } = req.body;
    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({ success: false, message: 'Title and message are required.' });
    }

    // "All Users" means actual users — not the admins sending the message.
    const STAFF = ['admin', 'super_admin', 'manager', 'support'];
    const query = targetRole ? { role: targetRole } : { role: { $nin: STAFF } };
    const users = await User.find(query).select('_id').lean();
    if (!users.length) {
      return res.status(404).json({ success: false, message: 'No users match that audience.' });
    }

    // 'system' is the type for platform-wide messages — 'account_verified' was
    // not in NOTIFICATION_TYPES, so every send failed schema validation.
    const results = await Promise.allSettled(users.map(u =>
      Notification.notify(u._id, 'system', title.trim(), body.trim(),
        { broadcast: true, targetRole: targetRole || 'all' })
    ));

    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.length - sent;
    if (failed) console.error(`[sendAnnouncement] ${failed}/${results.length} failed`);

    res.json({
      success: true,
      message: `Announcement sent to ${sent} user${sent === 1 ? '' : 's'}${failed ? ` (${failed} failed)` : ''}`,
      data: { count: sent, failed },
    });
  } catch (err) {
    console.error('[sendAnnouncement]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/admin/notifications/history — distinct broadcast announcements (most recent)
exports.getAnnouncementHistory = async (req, res) => {
  try {
    // Broadcasts share the same title/body across many users; group to de-duplicate
    const history = await Notification.aggregate([
      { $match: { 'meta.broadcast': true } },
      { $group: {
          _id: { title: '$title', body: '$body', day: { $dateToString: { format: '%Y-%m-%d %H:%M', date: '$createdAt' } } },
          title: { $first: '$title' }, body: { $first: '$body' },
          targetRole: { $first: '$meta.targetRole' },
          recipients: { $sum: 1 }, createdAt: { $first: '$createdAt' },
      } },
      { $sort: { createdAt: -1 } },
      { $limit: 50 },
    ]);
    res.json({ success: true, data: { history } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Activity Logs ─────────────────────────────────────────────────────────────
exports.getActivityLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pull = 60; // pull recent of each type, then merge + paginate

    // Optional models — wrapped so a missing one never blanks the whole page.
    let InspectionReport = null;
    try { InspectionReport = require('../models/InspectionReport'); } catch (_) {}

    const [bookings, users, listings, txns, inspections] = await Promise.all([
      Booking.find().sort({ createdAt: -1 }).limit(pull)
        .populate('renter', 'name').populate('listing', 'title').lean(),
      User.find().sort({ createdAt: -1 }).limit(pull).select('name email role createdAt').lean(),
      Listing.find().sort({ createdAt: -1 }).limit(pull)
        .populate('createdBy', 'name').select('title createdBy status createdAt').lean(),
      Transaction.find().sort({ createdAt: -1 }).limit(pull)
        .populate('user', 'name').select('type amount status user createdAt').lean(),
      InspectionReport
        ? InspectionReport.find().sort({ submittedAt: -1 }).limit(pull)
            .populate('conductedBy', 'name')
            .populate({ path: 'booking', select: 'listing', populate: { path: 'listing', select: 'title' } })
            .select('type conductedBy booking submittedAt comparisonResult').lean()
        : [],
    ]);

    const TX_LABEL = {
      booking_payment: 'Payment Received', booking_earning: 'Owner Payout',
      rider_earning: 'Rider Payout', service_fee: 'Commission Earned',
      withdrawal: 'Withdrawal Requested', platform_withdrawal: 'Platform Withdrawal',
      refund: 'Refund Issued', deposit_hold: 'Deposit Held', deposit_release: 'Deposit Released',
    };

    const activities = [
      ...bookings.map(b => ({
        _id: b._id, action: 'Booking Created',
        entity: b.listing?.title || 'Listing', user: b.renter?.name || 'Unknown',
        details: `Status: ${b.status}`, createdAt: b.createdAt,
      })),
      ...users.map(u => ({
        _id: u._id, action: 'User Registered',
        entity: u.email || '', user: u.name || 'Unknown',
        details: `Role: ${u.role}`, createdAt: u.createdAt,
      })),
      ...listings.map(l => ({
        _id: l._id, action: 'Listing Created',
        entity: l.title || 'Listing', user: l.createdBy?.name || 'Unknown',
        details: `Status: ${l.status}`, createdAt: l.createdAt,
      })),
      ...txns.map(t => ({
        _id: t._id, action: TX_LABEL[t.type] || 'Transaction',
        entity: `Rs ${Math.abs(t.amount || 0)}`,
        user: t.user?.name || (t.type === 'service_fee' || t.type === 'platform_withdrawal' ? 'Platform' : 'Unknown'),
        details: `Status: ${t.status}`, createdAt: t.createdAt,
      })),
      ...inspections.map(i => ({
        _id: i._id, action: 'Inspection Submitted',
        entity: i.booking?.listing?.title || 'Item',
        user: i.conductedBy?.name || 'Unknown',
        details: i.comparisonResult?.hasDamage
          ? `${i.type} — damage found (+${i.comparisonResult.damageDelta})`
          : `${i.type} — no new damage`,
        createdAt: i.submittedAt,
      })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Paginate the merged list
    const total = activities.length;
    const start = (+page - 1) * +limit;
    const paged = activities.slice(start, start + +limit);

    res.json({
      success: true,
      data: { activities: paged, total, pagination: { total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) } },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Settings ──────────────────────────────────────────────────────────────────
// The xssClean middleware HTML-escapes every incoming string, so free-text
// settings land in the DB as "Pakistan&#x27;s ...". Escaped storage is the safe
// default, but the admin textareas (and any consumer of these values) need the
// readable form — decode on the way out rather than weakening the middleware.
const TEXT_SETTINGS = ['siteName', 'contactEmail', 'homeBannerText', 'aboutPageText'];

const decodeSettings = (doc) => {
  const he = require('he');
  const obj = doc?.toObject ? doc.toObject() : { ...doc };
  for (const f of TEXT_SETTINGS) {
    if (typeof obj[f] === 'string') obj[f] = he.decode(obj[f]);
  }
  return obj;
};

exports.getSettings = async (req, res) => {
  try {
    const Settings = require('../models/Settings');
    const settings = await Settings.getSingleton();
    res.json({ success: true, data: decodeSettings(settings) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const Settings = require('../models/Settings');
    // Only allow known fields to be updated
    const allowed = ['siteName', 'contactEmail', 'maintenanceMode', 'serviceFeePercent',
                     'currency', 'homeBannerText', 'aboutPageText', 'ipWhitelist'];
    const update = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) update[f] = req.body[f]; });

    const settings = await Settings.findOneAndUpdate(
      { key: 'platform' }, { $set: update }, { new: true, upsert: true }
    );
    // Return the decoded form so the admin page doesn't re-render the escaped
    // text right after saving.
    res.json({ success: true, message: 'Settings saved', data: decodeSettings(settings) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/admin/force-logout — invalidate all users' sessions by clearing refresh tokens
exports.forceLogoutAll = async (req, res) => {
  try {
    // Clearing refreshToken forces users to log in again on next token refresh
    const result = await User.updateMany(
      { role: { $ne: 'admin' } },
      { $set: { refreshToken: null } }
    );
    res.json({ success: true, message: `Logged out ${result.modifiedCount || 0} users.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


// ── Contact form messages ──────────────────────────────────────────────────
exports.getContactMessages = async (req, res) => {
  try {
    const messages = await ContactMessage.find().sort({ createdAt: -1 }).limit(300).lean();
    const unread = await ContactMessage.countDocuments({ isRead: false });
    return res.json({ success: true, data: { messages, unread } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.markContactMessageRead = async (req, res) => {
  try {
    const isRead = req.body.isRead !== false;
    const m = await ContactMessage.findByIdAndUpdate(req.params.id, { isRead }, { new: true });
    if (!m) return res.status(404).json({ success: false, message: 'Message not found' });
    return res.json({ success: true, data: m });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteContactMessage = async (req, res) => {
  try {
    await ContactMessage.findByIdAndDelete(req.params.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
