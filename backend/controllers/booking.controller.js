'use strict';
/**
 * Booking Controller — Rentify
 * Handles: create, list, get, confirm, reject, cancel, complete, dispute
 */
const mongoose = require('mongoose');
const { Booking, BOOKING_STATUS } = require('../models/Booking');
const { Listing }      = require('../models/Listing');
const { Transaction }  = require('../models/Transaction');
const { Notification } = require('../models/Notification');
const Escrow = require('../models/Escrow');
const DamageClaim = require('../models/DamageClaim');
let InspectionReport = null;
try { InspectionReport = require('../models/InspectionReport'); } catch (_) {}
// Rider dispatch service + assignment model for the manual return-pickup request
// (loaded defensively so a missing module never breaks the rest of the booking
// controller — same pattern payment.controller.js uses).
let riderDispatch = null;
try { riderDispatch = require('../services/riderDispatch.service'); } catch (_) {}
let RiderAssignment = null;
try { RiderAssignment = require('../models/RiderAssignment'); } catch (_) {}
const { getAdvancePercentForBadge, recalculateForOwner } = require('../services/trustScore.service');
const { getAllowedVehicles, getDefaultVehicle } = require('../utils/vehicleEligibility');
// Email triggers (booking lifecycle). Wrapped in try/catch at call sites so a
// mail failure never breaks the booking flow.
const email = require('../utils/email');
// Real-time socket emit (booking events)
const { emitToUser } = require('../utils/socket');

const SERVICE_FEE_RATE = 0.05; // 5% default platform fee (fallback)

// ── Helper: calculate booking price ──────────────────────────────────────────
// feeRate is a fraction (e.g. 0.05 = 5%). Falls back to the default if omitted.

// ── Tracking Number Generator ─────────────────────────────────────────────
// Format: RNT-YYYYMMDD-XXXXXX (e.g. RNT-20260613-A3F9K2)
const generateTrackingNumber = () => {
  const date   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const chars  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const random = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `RNT-${date}-${random}`;
};

// deliveryFee is a flat charge added only for door delivery (0 for pickup).
const calcPrice = (pricePerUnit, priceUnit, startDate, endDate, feeRate = SERVICE_FEE_RATE, deliveryFee = 0) => {
  const ms       = endDate - startDate;
  const days     = Math.ceil(ms / (1000 * 60 * 60 * 24));
  let units;
  switch (priceUnit) {
    case 'per_hour':  units = Math.ceil(ms / (1000 * 60 * 60)); break;
    case 'per_week':  units = Math.ceil(days / 7); break;
    case 'per_month': units = Math.ceil(days / 30); break;
    default:          units = days; // per_day
  }
  const subtotal    = pricePerUnit * units;
  const serviceFee  = Math.round(subtotal * feeRate * 100) / 100;
  const delivery    = Number(deliveryFee) || 0;
  const totalAmount = subtotal + serviceFee + delivery;
  return { days, units, subtotal, serviceFee, deliveryFee: delivery, totalAmount };
};

// Read the current platform fee rate (fraction) from Settings, default 5%
const getFeeRate = async () => {
  try {
    const Settings = require('../models/Settings');
    const s = await Settings.getSingleton();
    const pct = typeof s.serviceFeePercent === 'number' ? s.serviceFeePercent : 5;
    return pct / 100;
  } catch {
    return SERVICE_FEE_RATE;
  }
};

// ── Helper: check listing availability ───────────────────────────────────────
const isListingAvailable = async (listingId, startDate, endDate, excludeBookingId = null) => {
  const query = {
    listing:   listingId,
    status:    { $in: ['pending', 'confirmed', 'active'] },
    startDate: { $lt: endDate },
    endDate:   { $gt: startDate },
  };
  if (excludeBookingId) query._id = { $ne: excludeBookingId };
  const conflict = await Booking.findOne(query);
  return !conflict;
};

// ═════════════════════════════════════════════════════════════════════════════
// CREATE  POST /api/bookings
// ═════════════════════════════════════════════════════════════════════════════
const createBooking = async (req, res) => {
  try {
    const { listingId, startDate, endDate, message, deliveryMethod, deliveryAddress, deliveryPhone, vehicleType } = req.body;

    if (!listingId || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'listingId, startDate, endDate are required.' });
    }

    // Normalize to UTC midnight so the stored day matches what the user picked
    // (prevents ±1 day drift from local-timezone offsets like PKT +5).
    const start = new Date(startDate); start.setUTCHours(0, 0, 0, 0);
    const end   = new Date(endDate);   end.setUTCHours(0, 0, 0, 0);

    if (isNaN(start) || isNaN(end)) {
      return res.status(400).json({ success: false, message: 'Invalid date format.' });
    }
    if (start >= end) {
      return res.status(400).json({ success: false, message: 'endDate must be after startDate.' });
    }
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
    if (start < todayStart) {
      return res.status(400).json({ success: false, message: 'startDate cannot be in the past.' });
    }

    const listing = await Listing.findOne({ _id: listingId, isDeleted: false, status: 'active' });
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found or not available.' });
    }

    // Cannot rent your own listing
    if (listing.createdBy.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot rent your own listing.' });
    }

    // Check availability
    const available = await isListingAvailable(listingId, start, end);
    if (!available) {
      return res.status(409).json({ success: false, message: 'Listing is not available for selected dates.' });
    }

    // Calculate price (platform fee % comes from admin Settings)
    const feeRate = await getFeeRate();

    // Vehicle-based delivery fee (only for door delivery)
    // Renter selects vehicle type → fee is calculated accordingly
    // bike: Rs 250 | car: Rs 500 | van: Rs 999 | default/pickup: Rs 0
    // This fee is split in half: half pays the delivery-leg rider, half is
    // reserved for the return-leg rider when the rental period ends.
    const VEHICLE_FEES = {
      bike: Number(process.env.DELIVERY_FEE_BIKE || 250),
      car:  Number(process.env.DELIVERY_FEE_CAR  || 500),
      van:  Number(process.env.DELIVERY_FEE_VAN  || 999),
    };

    // A bike can't carry a furniture set — restrict to whatever's physically
    // plausible for this listing's category, rather than silently defaulting
    // an unrecognized/disallowed choice to 'bike'.
    const allowedVehicles = getAllowedVehicles(listing.category);
    let selectedVehicle = null;
    if (deliveryMethod === 'delivery') {
      if (!allowedVehicles.includes(vehicleType)) {
        return res.status(422).json({
          success: false,
          message: `${listing.category} items can only be delivered by: ${allowedVehicles.join(', ')}.`,
          allowedVehicles,
        });
      }
      selectedVehicle = vehicleType;
    }
    const deliveryFee = (deliveryMethod === 'delivery')
      ? VEHICLE_FEES[selectedVehicle]
      : 0;
    const { days, subtotal, serviceFee, totalAmount: rentalPortion } = calcPrice(
      listing.price, listing.priceUnit, start, end, feeRate, deliveryFee
    );

    // Security deposit comes from the listing (owner-set); held in full
    // regardless of trust tier — the advance % only applies to the rental
    // portion (subtotal + serviceFee + deliveryFee). The deposit is always
    // paid upfront alongside the advance, since it must be in escrow before
    // handover — it is never part of what's "due on delivery".
    const depositAmount = Number(listing.securityDeposit) || 0;
    const totalAmount = rentalPortion + depositAmount;

    // ── Trust-Tiered Payment: advance % comes from the owner's current badge ──
    // Snapshotted onto the booking so a later trust-score change never alters
    // the terms of an already-placed booking.
    const ownerUser = await require('../models/User').findById(listing.createdBy).select('trustBadge').lean();
    const advancePercent  = getAdvancePercentForBadge(ownerUser?.trustBadge || 'none');
    const advanceRental    = Math.round(rentalPortion * advancePercent / 100);
    const advanceAmount    = advanceRental + depositAmount;
    const remainingAmount  = Math.max(0, rentalPortion - advanceRental);

    // Delivery deadline: owner/rider has a grace window to deliver after the
    // booking is confirmed, used by the late-delivery auto-refund cron.
    const deliveryDeadline = (deliveryMethod === 'delivery')
      ? new Date(Date.now() + Number(process.env.DELIVERY_GRACE_HOURS || 4) * 60 * 60 * 1000)
      : null;

    const booking = await Booking.create({
      listing:        listing._id,
      renter:         req.user._id,
      owner:          listing.createdBy,
      startDate:      start,
      endDate:        end,
      totalDays:      days,
      pricePerUnit:   listing.price,
      priceUnit:      listing.priceUnit,
      subtotal,
      serviceFee,
      deliveryFee,
      totalAmount,
      depositAmount,
      advancePercent,
      advanceAmount,
      remainingAmount,
      deliveryDeadline,
      message:        message?.trim() || null,
      deliveryMethod: deliveryMethod || 'pickup',
      deliveryAddress: deliveryAddress?.trim() || null,
      deliveryPhone:   deliveryPhone?.trim() || null,
      vehicleType:    (deliveryMethod === 'delivery') ? selectedVehicle : null,
      trackingNumber: generateTrackingNumber(),
    });

    // Notify owner
    await Notification.notify(
      listing.createdBy,
      'booking_request',
      'New Booking Request',
      `${req.user.name} has requested to rent "${listing.title}" from ${start.toDateString()} to ${end.toDateString()}.`,
      { bookingId: booking._id, listingId: listing._id, userId: req.user._id, link: `/bookings/${booking._id}` }
    );

    // Real-time push to owner
    emitToUser(listing.createdBy, 'booking:new', {
      type: 'booking_request',
      title: 'New Booking Request',
      message: `${req.user.name} wants to rent "${listing.title}".`,
      link: `/bookings/${booking._id}`,
      bookingId: booking._id,
    });

    const populated = await Booking.findById(booking._id)
      .populate('listing', 'title images city priceUnit')
      .populate('renter',  'name avatar email')
      .populate('owner',   'name avatar email');

    // Email the owner about the new request (non-blocking)
    try {
      if (populated.owner?.email) {
        await email.sendBookingRequestedEmail({
          to: populated.owner.email,
          ownerName: populated.owner.name,
          renterName: populated.renter.name,
          listingTitle: populated.listing.title,
          startDate: start, endDate: end,
          totalAmount,
          bookingId: booking._id,
        });
      }
    } catch (e) { console.warn('[email bookingRequested]', e.message); }

    return res.status(201).json({
      success: true,
      message: 'Booking request sent successfully.',
      data: { booking: populated.toPublicJSON() },
    });
  } catch (err) {
    console.error('[createBooking]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create booking.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// LIST  GET /api/bookings  (role-aware)
// ═════════════════════════════════════════════════════════════════════════════
const getBookings = async (req, res) => {
  try {
    const { page = 1, limit = 10, status = 'all', role } = req.query;
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, parseInt(limit) || 10);
    const skip     = (pageNum - 1) * limitNum;

    const filter = {};

    // Scope by role
    if (role === 'owner' || req.user.role === 'owner') {
      filter.owner = req.user._id;
    } else {
      filter.renter = req.user._id;
    }

    if (status !== 'all' && BOOKING_STATUS.includes(status)) {
      filter.status = status;
    }

    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .populate('listing', 'title images city priceUnit price')
        .populate('renter',  'name avatar email')
        .populate('owner',   'name avatar email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Booking.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: {
        bookings,
        pagination: {
          total, page: pageNum, limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
          hasNext: pageNum < Math.ceil(total / limitNum),
          hasPrev: pageNum > 1,
        },
      },
    });
  } catch (err) {
    console.error('[getBookings]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch bookings.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// GET SINGLE  GET /api/bookings/:id
// ═════════════════════════════════════════════════════════════════════════════
const getBookingById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid booking ID.' });
    }

    const booking = await Booking.findById(id)
      .populate('listing', 'title images city area priceUnit price description')
      .populate('renter',  'name avatar email phone')
      .populate('owner',   'name avatar email phone cnicVerified');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }
    if (!booking.renter || !booking.owner) {
      // A referenced user (renter/owner) no longer exists — this would
      // otherwise throw on the .toString() below and surface as a generic
      // 500 with no useful detail.
      console.error('[getBookingById] booking has a missing renter/owner ref:', id);
      return res.status(409).json({ success: false, message: 'This booking references an account that no longer exists.' });
    }

    // Only renter, owner, or admin can see
    const uid = req.user._id.toString();
    if (booking.renter._id.toString() !== uid && booking.owner._id.toString() !== uid) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    return res.json({ success: true, data: { booking: booking.toPublicJSON() } });
  } catch (err) {
    console.error('[getBookingById] full error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch booking.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// CONFIRM  PATCH /api/bookings/:id/confirm  (owner only)
// ═════════════════════════════════════════════════════════════════════════════
const confirmBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('listing', 'title')
      .populate('renter',  'name email');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    if (booking.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only the owner can confirm bookings.' });
    }
    if (booking.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Cannot confirm a ${booking.status} booking.` });
    }

    // Re-check availability (another booking may have been confirmed in parallel)
    const available = await isListingAvailable(
      booking.listing._id, booking.startDate, booking.endDate, booking._id
    );
    if (!available) {
      return res.status(409).json({ success: false, message: 'Dates conflict with another booking.' });
    }

    booking.status      = 'confirmed';
    booking.confirmedAt = new Date();
    await booking.save();

    await Notification.notify(
      booking.renter,
      'booking_confirmed',
      'Booking Confirmed! 🎉',
      `Your booking for "${booking.listing.title}" has been confirmed by the owner.`,
      { bookingId: booking._id, listingId: booking.listing._id, link: `/bookings/${booking._id}` }
    );

    // Real-time push to renter
    emitToUser(booking.renter._id || booking.renter, 'booking:confirmed', {
      type: 'booking_confirmed',
      title: 'Booking Confirmed! 🎉',
      message: `Your booking for "${booking.listing.title}" is confirmed.`,
      link: `/bookings/${booking._id}`,
      bookingId: booking._id,
    });

    // Email renter the confirmation (non-blocking)
    try {
      if (booking.renter?.email) {
        await email.sendBookingConfirmedEmail({
          to: booking.renter.email,
          renterName: booking.renter.name,
          listingTitle: booking.listing.title,
          startDate: booking.startDate, endDate: booking.endDate,
          totalAmount: booking.totalAmount,
          bookingId: booking._id,
        });
      }
    } catch (e) { console.warn('[email bookingConfirmed]', e.message); }

    return res.json({ success: true, message: 'Booking confirmed.', data: { booking: booking.toPublicJSON() } });
  } catch (err) {
    console.error('[confirmBooking]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to confirm booking.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// REJECT  PATCH /api/bookings/:id/reject  (owner only)
// ═════════════════════════════════════════════════════════════════════════════
const rejectBooking = async (req, res) => {
  try {
    const { reason } = req.body;
    const booking = await Booking.findById(req.params.id)
      .populate('listing', 'title')
      .populate('renter',  'name');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    if (booking.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only the owner can reject bookings.' });
    }
    if (booking.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Cannot reject a ${booking.status} booking.` });
    }

    booking.status     = 'rejected';
    booking.rejectedAt = new Date();
    booking.cancellation = {
      cancelledBy:  req.user._id,
      cancelledAt:  new Date(),
      reason:       reason?.trim() || 'Not provided',
      refundAmount: 0,
    };
    await booking.save();

    await Notification.notify(
      booking.renter,
      'booking_rejected',
      'Booking Not Accepted',
      `Your booking request for "${booking.listing.title}" was not accepted. Reason: ${reason || 'Not provided'}.`,
      { bookingId: booking._id, listingId: booking.listing._id }
    );

    return res.json({ success: true, message: 'Booking rejected.', data: { booking: booking.toPublicJSON() } });
  } catch (err) {
    console.error('[rejectBooking]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to reject booking.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// CANCEL  PATCH /api/bookings/:id/cancel  (renter or owner)
// ═════════════════════════════════════════════════════════════════════════════
const cancelBooking = async (req, res) => {
  try {
    const { reason } = req.body;
    const booking = await Booking.findById(req.params.id)
      .populate('listing', 'title')
      .populate('renter',  'name email')
      .populate('owner',   'name email');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    if (!booking.canBeCancelledBy(req.user._id)) {
      console.log('[cancelBooking BLOCKED]', {
        status: booking.status,
        renter: String(booking.renter?._id || booking.renter),
        owner:  String(booking.owner?._id || booking.owner),
        user:   String(req.user._id),
      });
      return res.status(400).json({
        success: false,
        message: `Cannot cancel a booking with status "${booking.status}".`,
      });
    }

    // ── Refund policy ───────────────────────────────────────────────────────
    const hoursUntilStart = (booking.startDate - new Date()) / (1000 * 60 * 60);
    let refundPercent = 0;
    if (booking.status === 'pending') {
      refundPercent = 100;
    } else if (hoursUntilStart >= 48) {
      refundPercent = 50;
    } else if (hoursUntilStart >= 24) {
      refundPercent = 25;
    }
    const refundAmount = Math.round((booking.totalAmount * refundPercent) / 100);

    booking.status = 'cancelled';
    booking.cancellation = {
      cancelledBy:  req.user._id,
      cancelledAt:  new Date(),
      reason:       reason?.trim() || 'No reason provided',
      refundAmount,
    };
    await booking.save();

    const refundMsg = refundAmount > 0
      ? ' Refund of Rs.' + refundAmount + ' will be processed in 3-5 days.'
      : ' No refund per cancellation policy.';

    // Notify the other party
    const isRenter    = req.user._id.toString() === booking.renter._id.toString();
    const notifyUserId = isRenter ? booking.owner._id : booking.renter._id;
    const notifyName   = isRenter ? booking.renter.name : booking.owner.name;

    await Notification.notify(
      notifyUserId,
      'booking_cancelled',
      'Booking Cancelled',
      `${notifyName} has cancelled the booking for "${booking.listing.title}". Reason: ${reason || 'Not provided'}.` + refundMsg,
      { bookingId: booking._id, listingId: booking.listing._id, link: `/bookings/${booking._id}` }
    );

    // Real-time push to BOTH parties
    [booking.renter._id, booking.owner._id].forEach(uid => {
      emitToUser(uid, 'booking:cancelled', {
        type: 'booking_cancelled',
        title: 'Booking Cancelled',
        message: `Booking for "${booking.listing.title}" was cancelled.`,
        link: `/bookings/${booking._id}`,
        bookingId: booking._id,
      });
    });

    // Email BOTH parties about the cancellation (non-blocking)
    try {
      const cancelledByRole = isRenter ? 'renter' : 'owner';
      const recips = [
        { u: booking.renter }, { u: booking.owner },
      ];
      for (const { u } of recips) {
        if (u?.email) {
          await email.sendBookingCancelledEmail({
            to: u.email,
            name: u.name,
            listingTitle: booking.listing.title,
            startDate: booking.startDate, endDate: booking.endDate,
            cancelledBy: cancelledByRole,
          });
        }
      }
    } catch (e) { console.warn('[email bookingCancelled]', e.message); }

    return res.json({ success: true, message: 'Booking cancelled.', data: { booking: booking.toPublicJSON() } });
  } catch (err) {
    console.error('[cancelBooking]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to cancel booking.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// COLLECT REMAINING  PATCH /api/bookings/:id/collect-remaining  (owner, self-pickup)
// For self-pickup bookings there is no rider handover, so the owner records that
// they received the remaining balance (cash/wallet) in person. Mirrors the rider
// collectRemaining: sets remainingCollectedAt + tops up the escrow rental portion
// so the eventual payout is correct. Unblocks completeBooking's outstanding guard.
// ═════════════════════════════════════════════════════════════════════════════
const collectRemaining = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('owner', 'name email')
      .populate('renter', 'name email');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    if (booking.owner._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only the owner can collect the remaining balance.' });
    }
    if (!booking.remainingAmount || booking.remainingAmount <= 0) {
      return res.status(409).json({ success: false, message: 'Nothing remaining to collect on this booking.' });
    }
    if (booking.remainingCollectedAt) {
      return res.status(409).json({ success: false, message: 'Remaining amount already collected.' });
    }

    const method = (req.body && ['cash', 'wallet'].includes(req.body.method)) ? req.body.method : 'cash';
    booking.remainingPaymentMethod = method;
    booking.remainingCollectedAt = new Date();
    booking.remainingRefused = false;
    await booking.save();

    // Keep escrow/owner-payout accounting correct (same as rider flow).
    if (Escrow && typeof Escrow.topUpRental === 'function') {
      try {
        const rentalPortion = Math.max(0, Number(booking.remainingAmount) - Number(booking.deliveryFee || 0));
        if (rentalPortion > 0) await Escrow.topUpRental(booking._id, rentalPortion);
      } catch (e) { console.error('[booking.collectRemaining] escrow top-up failed:', e.message); }
    }

    Notification.notify(booking.renter._id, 'payment_received', 'Payment recorded',
      `The owner recorded your remaining payment of Rs ${booking.remainingAmount} (${method}).`, { bookingId: booking._id }).catch(() => {});

    return res.json({ success: true, message: 'Remaining amount marked as collected.', data: { booking: booking.toPublicJSON ? booking.toPublicJSON() : booking } });
  } catch (err) {
    console.error('[booking.collectRemaining]', err.message);
    return res.status(500).json({ success: false, message: 'Could not record the payment.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// COMPLETE  PATCH /api/bookings/:id/complete  (owner marks as done)
// ═════════════════════════════════════════════════════════════════════════════
const completeBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('listing', 'title')
      .populate('renter', 'name email')
      .populate('owner',  'name email');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    if (booking.owner._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only the owner can complete bookings.' });
    }
    if (!['confirmed', 'active'].includes(booking.status)) {
      return res.status(400).json({ success: false, message: `Cannot complete a ${booking.status} booking.` });
    }

    // Guard: for delivery bookings the item physically comes back via a return
    // leg. Completing before that leg exists releases the deposit while the
    // renter still has the item — so require an explicit confirmation
    // (?force=1) rather than silently allowing it.
    if (booking.deliveryMethod === 'delivery' && RiderAssignment) {
      const force = req.query.force === '1' || req.query.force === 'true' || req.body?.force === true;
      if (!force) {
        const returnLeg = await RiderAssignment.findOne({
          booking: booking._id, type: 'return', status: { $nin: ['cancelled', 'declined'] },
        }).select('_id status').lean();
        if (!returnLeg) {
          return res.status(409).json({
            success: false,
            needsReturnConfirm: true,
            message: 'No return pickup has been arranged for this booking — the renter may still have the item. Request a return pickup first, or confirm you already have it back.',
          });
        }
      }
    }

    // Guard: an owner's own "Complete" action must not bypass a damage claim
    // they (or anyone) already filed on this booking — same rule the hourly
    // escrow cron already enforces, applied here so instant completion can't
    // skip it.
    const openClaim = await DamageClaim.findOne({
      booking: booking._id,
      status:  { $in: ['pending', 'under_review'] },
    });
    if (openClaim) {
      return res.status(409).json({
        success: false,
        message: 'This booking has an open damage claim — resolve it before completing.',
      });
    }

    // Guard: don't let an owner instant-complete (and trigger payout) while
    // a Trust-Tiered Payment remaining balance is still outstanding — same
    // rule escrowCron.service.js enforces for its hourly pass.
    const hasOutstandingRemaining = (Number(booking.remainingAmount) || 0) > 0
      && !booking.remainingCollectedAt
      && booking.status !== 'disputed';
    if (hasOutstandingRemaining) {
      return res.status(409).json({
        success: false,
        message: `Rs ${booking.remainingAmount} is still due from the renter — collect it before completing this booking.`,
      });
    }

    // Guard: require a return condition inspection before completing.
    // Without this, a booking could be marked complete (and the deposit
    // released in full) with zero photographic record of the item's
    // returned condition — making any later damage claim or dispute
    // impossible to substantiate. Self-pickup bookings need this just as
    // much as delivered ones, so it's enforced here rather than tied to
    // the rider delivery flow.
    if (InspectionReport) {
      const returnInspection = await InspectionReport.findOne({ booking: booking._id, type: 'return' }).select('_id').lean();
      if (!returnInspection) {
        return res.status(409).json({
          success: false,
          message: 'A return inspection (photos of the item\'s returned condition) must be submitted before completing this booking.',
        });
      }
    }

    // Check BEFORE completing whether the renter has any prior completed
    // booking — determines whether THIS booking is their "first ever" for
    // the referral trigger below.
    const renterHadCompletedBefore = await Booking.findOne({
      renter: booking.renter, status: 'completed', _id: { $ne: booking._id },
    }).select('_id').lean();

    booking.status      = 'completed';
    booking.completedAt = new Date();
    await booking.save();

    // A completed booking directly raises the owner's completed-bookings
    // count, one of the trust-score signals — recompute now rather than
    // letting the cached badge go stale until some unrelated trigger fires.
    try { await recalculateForOwner(booking.owner); } catch (e) { console.error('[completeBooking] trust recalc failed:', e.message); }

    // Referral reward for the renter's referrer, if this was their first
    // ever completed booking — reward is 10% of the rental amount they paid.
    if (!renterHadCompletedBefore) {
      try {
        const { maybeRewardReferrer } = require('../services/referral.service');
        await maybeRewardReferrer(booking.renter, booking.totalAmount, 'renter_first_booking');
      } catch (e) { console.error('[completeBooking] referral reward failed:', e.message); }
    }

    // Release escrow now instead of waiting for the hourly cron — this is the
    // single place funds move for a completed booking. Routing through
    // Escrow.releaseFunds() (rather than crediting the wallet directly) keeps
    // this in sync with escrowCron.service.js, which checks escrow.status
    // before acting and will skip a booking that's already released.
    let ownerEarning = booking.subtotal;
    let renterRefund = booking.depositAmount || 0;
    try {
      const escrow = await Escrow.findOne({ booking: booking._id });
      if (escrow && escrow.status === 'holding') {
        const SERVICE_FEE_RATE = Number(process.env.SERVICE_FEE_RATE || 0.05);
        const platformFee = Math.round(escrow.rentalAmount * SERVICE_FEE_RATE);
        ownerEarning = Math.max(0, escrow.rentalAmount - platformFee);
        renterRefund = escrow.depositAmount; // no open claim (checked above) → full deposit back
        await Escrow.releaseFunds(booking._id, {
          ownerAmount: ownerEarning,
          renterRefund,
          platformFee,
          damageDeduction: 0,
          notes: 'Released immediately on owner completion (no open damage claim).',
        });
        // Book the platform's cut as revenue. It's already deducted from the
        // owner's payout above, but without this row it never reaches the
        // admin revenue totals.
        try {
          const { recordPlatformFee } = require('../services/platformFee.service');
          await recordPlatformFee(booking._id, platformFee);
        } catch (e) { console.error('[completeBooking] fee record failed:', e.message); }
      } else {
        // No escrow record (e.g. legacy/no-deposit booking) — fall back to the
        // original direct-credit behaviour so older bookings keep working.
        await Transaction.credit(
          booking.owner._id,
          ownerEarning,
          'booking_earning',
          `Earning from booking #${booking._id} - ${booking.listing.title}`,
          { booking: booking._id, listing: booking.listing._id }
        );
      }
    } catch (e) {
      console.error('[completeBooking] escrow release failed:', e.message);
    }

    // Notify both parties
    await Promise.all([
      Notification.notify(
        booking.renter._id, 'booking_completed',
        'Booking Completed',
        `Your rental of "${booking.listing.title}" has been marked as complete. Please leave a review!`,
        { bookingId: booking._id, listingId: booking.listing._id }
      ),
      Notification.notify(
        booking.owner._id, 'payment_received',
        'Payment Received',
        `Rs. ${ownerEarning} has been credited to your wallet for booking #${booking._id}.`,
        { bookingId: booking._id }
      ),
    ]);

    // Emails: renter completion + review request, owner payment received (non-blocking)
    try {
      if (booking.renter?.email) {
        await email.sendBookingCompletedEmail({
          to: booking.renter.email,
          renterName: booking.renter.name,
          listingTitle: booking.listing.title,
          bookingId: booking._id,
        });
      }
      if (booking.owner?.email) {
        await email.sendPaymentReceivedEmail({
          to: booking.owner.email,
          ownerName: booking.owner.name,
          amount: ownerEarning,
          listingTitle: booking.listing.title,
          bookingId: booking._id,
        });
      }
    } catch (e) { console.warn('[email bookingCompleted/payment]', e.message); }

    // Update listing booking count
    await Listing.updateOne({ _id: booking.listing._id }, { $inc: { bookings: 1 } });

    return res.json({ success: true, message: 'Booking completed.', data: { booking: booking.toPublicJSON() } });
  } catch (err) {
    console.error('[completeBooking]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to complete booking.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// DISPUTE  PATCH /api/bookings/:id/dispute
// ═════════════════════════════════════════════════════════════════════════════
const disputeBooking = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) {
      return res.status(400).json({ success: false, message: 'Dispute reason is required.' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    const uid = req.user._id.toString();
    if (booking.renter.toString() !== uid && booking.owner.toString() !== uid) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    if (!['active', 'completed'].includes(booking.status)) {
      return res.status(400).json({ success: false, message: 'Can only dispute active or completed bookings.' });
    }

    booking.status          = 'disputed';
    booking.disputeReason   = reason.trim();
    booking.disputeRaisedBy = req.user._id;
    booking.disputeRaisedAt = new Date();
    await booking.save();

    return res.json({ success: true, message: 'Dispute raised. Our team will contact you shortly.', data: { booking: booking.toPublicJSON() } });
  } catch (err) {
    console.error('[disputeBooking]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to raise dispute.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// REQUEST RETURN PICKUP  PUT /api/bookings/:id/request-return  (renter or owner)
// Lets the renter (or owner) manually dispatch the return-leg rider to collect
// the item and take it back to the owner — instead of waiting for the hourly
// escrow cron to auto-dispatch it at rental end. The cron still runs as a
// safety net; this just lets a user trigger the same return leg early/on demand.
// Only for 'delivery' bookings — self-pickup returns have no rider leg.
// ═════════════════════════════════════════════════════════════════════════════
const requestReturn = async (req, res) => {
  try {
    if (!riderDispatch || typeof riderDispatch.assignRider !== 'function') {
      return res.status(503).json({ success: false, message: 'Return dispatch is unavailable right now.' });
    }

    const booking = await Booking.findById(req.params.id)
      .populate('listing', 'title')
      .populate('owner',  'name')
      .populate('renter', 'name');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    const uid = req.user._id.toString();
    const isRenter = booking.renter?._id?.toString() === uid;
    const isOwner  = booking.owner?._id?.toString()  === uid;
    if (!isRenter && !isOwner) {
      return res.status(403).json({ success: false, message: 'You are not part of this booking.' });
    }

    // Only delivery bookings have a rider return leg.
    if (booking.deliveryMethod !== 'delivery') {
      return res.status(400).json({ success: false, message: 'This is a self-pickup booking — return it to the owner directly; no rider is dispatched.' });
    }

    // Item must actually be out with the renter (or the rental just ended).
    if (!['delivered', 'active', 'completed'].includes(booking.status)) {
      return res.status(400).json({ success: false, message: `Return pickup can't be requested while the booking is ${booking.status}.` });
    }

    // Don't double-dispatch — if a return leg is already in flight, just report it.
    if (RiderAssignment) {
      const existing = await RiderAssignment.findOne({
        booking: booking._id, type: 'return', status: { $nin: ['cancelled', 'declined'] },
      });
      if (existing) {
        return res.status(200).json({
          success: true, alreadyRequested: true,
          message: 'A rider is already assigned to collect this item for return.',
          data: { assignmentId: existing._id, status: existing.status },
        });
      }
    }

    const assignment = await riderDispatch.assignRider(String(booking._id), 'return');

    // Let the renter know a rider is coming to collect (owner already gets the
    // eventual return handover). Best-effort — never block the response.
    if (isRenter) {
      Notification.notify(booking.owner._id, 'system', 'Return pickup requested',
        `${booking.renter?.name || 'The renter'} requested a rider to return "${booking.listing?.title || 'the item'}".`,
        { bookingId: booking._id, link: `/bookings/${booking._id}` }).catch(() => {});
    }

    return res.status(201).json({
      success: true,
      message: 'A rider has been assigned to collect the item for return.',
      data: { assignmentId: assignment?._id || null, status: assignment?.status || 'assigned' },
    });
  } catch (err) {
    console.error('[requestReturn]', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to request return pickup.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// CHECK AVAILABILITY  POST /api/bookings/check-availability
// ═════════════════════════════════════════════════════════════════════════════
const checkAvailability = async (req, res) => {
  try {
    const { listingId, startDate, endDate } = req.body;
    if (!listingId || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'listingId, startDate, endDate required.' });
    }

    const start = new Date(startDate); start.setUTCHours(0, 0, 0, 0);
    const end   = new Date(endDate);   end.setUTCHours(0, 0, 0, 0);

    // Validate the listing first
    const listing = await Listing.findOne({ _id: listingId, isDeleted: false });
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found.' });
    }
    if (listing.status !== 'active') {
      return res.json({
        success: true,
        data: { available: false, reason: 'Listing is ' + listing.status, pricing: null },
      });
    }

    const available = await isListingAvailable(listingId, start, end);

    let pricing = null;
    if (available) {
      const feeRate = await getFeeRate();
      const { days, subtotal, serviceFee, totalAmount } = calcPrice(
        listing.price, listing.priceUnit, start, end, feeRate
      );
      pricing = { days, pricePerUnit: listing.price, priceUnit: listing.priceUnit, subtotal, serviceFee, totalAmount };
    }

    return res.json({ success: true, data: { available, pricing } });
  } catch (err) {
    console.error('[checkAvailability]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to check availability.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/listings/:id/availability — calendar data for a listing
// Returns booked (confirmed/active), pending, and owner-blocked date ranges.
// ═════════════════════════════════════════════════════════════════════════════
const getListingAvailability = async (req, res) => {
  try {
    const listingId = req.params.id;
    const listing = await Listing.findById(listingId).select('blockedDates createdBy');
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found.' });

    // Only future / current bookings matter for the calendar
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const bookings = await Booking.find({
      listing: listingId,
      status:  { $in: ['pending', 'confirmed', 'active'] },
      endDate: { $gte: today },
    }).select('startDate endDate status');

    const booked  = [];
    const pending = [];
    bookings.forEach(b => {
      const range = { start: b.startDate, end: b.endDate };
      if (b.status === 'pending') pending.push(range);
      else booked.push(range);
    });

    return res.json({
      success: true,
      data: {
        booked,                                   // confirmed/active ranges
        pending,                                  // pending ranges
        blocked: listing.blockedDates || [],      // owner-blocked individual dates
      },
    });
  } catch (err) {
    console.error('[getListingAvailability]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load availability.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/listings/:id/block-dates — owner blocks dates  body: { dates: [ISO] }
// DELETE /api/listings/:id/block-dates — owner unblocks      body: { dates: [ISO] }
// ═════════════════════════════════════════════════════════════════════════════
const blockDates = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found.' });
    if (String(listing.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Only the owner can block dates.' });
    }
    const dates = (req.body.dates || []).map(d => new Date(d));
    const existing = new Set((listing.blockedDates || []).map(d => new Date(d).toDateString()));
    dates.forEach(d => { if (!existing.has(d.toDateString())) listing.blockedDates.push(d); });
    await listing.save();
    return res.json({ success: true, data: { blockedDates: listing.blockedDates } });
  } catch (err) {
    console.error('[blockDates]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to block dates.' });
  }
};

const unblockDates = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found.' });
    if (String(listing.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Only the owner can unblock dates.' });
    }
    const remove = new Set((req.body.dates || []).map(d => new Date(d).toDateString()));
    listing.blockedDates = (listing.blockedDates || []).filter(d => !remove.has(new Date(d).toDateString()));
    await listing.save();
    return res.json({ success: true, data: { blockedDates: listing.blockedDates } });
  } catch (err) {
    console.error('[unblockDates]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to unblock dates.' });
  }
};

/**
 * GET /api/bookings/:id/qr
 * Returns the handover QR code + text for a booking.
 * Only the owner or renter on the booking can fetch it — they show it to the
 * rider for pickup/delivery confirmation.
 */
const getBookingQR = async (req, res) => {
  try {
    const RiderAssignment = require('../models/RiderAssignment');
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    const me = String(req.user._id);
    const isParty = me === String(booking.renter) || me === String(booking.owner);
    if (!isParty) return res.status(403).json({ success: false, message: 'Not your booking.' });

    const assignment = await RiderAssignment.findOne({
      booking: booking._id,
      status: { $ne: 'cancelled' },
    }).sort({ createdAt: -1 }).populate('rider', 'name avatar riderRating');

    if (!assignment) {
      return res.json({ success: true, data: { qrCode: null, status: null, message: 'No active rider assignment yet.' } });
    }

    const r = assignment.rider;
    const riderRating = r?.riderRating || 0;
    const riderBadge = (() => {
      if (riderRating >= 4.8) return 'Platinum';
      if (riderRating >= 4.5) return 'Gold';
      if (riderRating >= 4.0) return 'Silver';
      if (riderRating >= 3.0) return 'Bronze';
      return 'none';
    })();

    // Does an active RETURN leg already exist? The booking detail page uses
    // this to decide whether to still offer "Request Return Pickup" — without
    // it, a booking that was completed before the item was collected leaves
    // the renter with no way to send it back.
    const returnLeg = await RiderAssignment.findOne({
      booking: booking._id, type: 'return', status: { $nin: ['cancelled', 'declined'] },
    }).select('_id status').lean();

    return res.json({
      success: true,
      data: {
        // Only hand back a scannable QR while the handover is still live —
        // once the assignment is completed there's nothing left to scan,
        // but the rider's info should still reach the frontend so the
        // post-delivery "Rate Your Rider" card can render.
        qrCode: assignment.status === 'completed' ? null : assignment.qrCode,
        status: assignment.status,
        type:   assignment.type,
        hasReturnLeg: !!returnLeg,
        returnLegStatus: returnLeg?.status || null,
        rider: r ? {
          id:     r._id,
          name:   r.name,
          avatar: r.avatar || null,
          riderRating,
          riderBadge,
        } : null,
      },
    });
  } catch (err) {
    console.error('[getBookingQR]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load QR.' });
  }
};


/**
 * GET /api/bookings/:id/tracking  (public — no auth needed)
 * Tracking page ke liye booking status return karta hai.
 * Sensitive fields hide karta hai — sirf status timeline dikhata hai.
 */
const getBookingTracking = async (req, res) => {
  try {
    // trackingNumber (RNT-...) ya MongoDB ID dono se search karo
    const query = req.params.id.startsWith('RNT-')
      ? { trackingNumber: req.params.id.toUpperCase() }
      : mongoose.Types.ObjectId.isValid(req.params.id)
        ? { _id: req.params.id }
        : null;

    if (!query) return res.status(400).json({ success: false, message: 'Invalid tracking number.' });

    const booking = await Booking.findOne(query)
      .populate('renter',  'name')
      .populate('owner',   'name')
      .populate('listing', 'title images');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking nahi mili — tracking number check karein.' });

    // Sirf public info return karo
    return res.json({
      success: true,
      data: {
        booking: {
          _id            : booking._id,
          trackingNumber : booking.trackingNumber,
          status         : booking.status,
          deliveryMethod : booking.deliveryMethod,
          deliveryAddress: booking.deliveryAddress,
          deliveryPhone  : booking.deliveryPhone,
          createdAt      : booking.createdAt,
          confirmedAt     : booking.confirmedAt,
          riderAssignedAt : booking.riderAssignedAt,
          pickedUpAt      : booking.pickedUpAt,
          deliveredAt    : booking.deliveredAt,
          completedAt    : booking.completedAt,
          // Payment breakdown (real values from the booking)
          totalAmount     : booking.totalAmount,
          advanceAmount   : booking.advanceAmount,
          remainingAmount : booking.remainingAmount,
          depositAmount   : booking.depositAmount,
          advancePercent  : booking.advancePercent,
          paymentStatus   : booking.paymentStatus,
          paymentMethod   : booking.paymentMethod,
          remainingCollectedAt : booking.remainingCollectedAt,
          remainingRefused     : booking.remainingRefused,
          renter         : { name: booking.renter?.name },
          owner          : { name: booking.owner?.name },
          listing        : {
            title  : booking.listing?.title,
            images : booking.listing?.images || [],
            image  : booking.listing?.images?.[0]?.url || null,
          },
        },
      },
    });
  } catch (err) {
    console.error('[getBookingTracking]', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  createBooking,
  getBookings,
  getBookingById,
  getBookingQR,
  getBookingTracking,
  confirmBooking,
  rejectBooking,
  cancelBooking,
  completeBooking,
  collectRemaining,
  disputeBooking,
  requestReturn,
  checkAvailability,
  getListingAvailability,
  blockDates,
  unblockDates,
};
