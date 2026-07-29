'use strict';
/**
 * Rider Controller — Rentify PK
 * Delivery riders: view/accept assignments, mark pickup/delivery with photo
 * evidence + encrypted-QR handover verification, complete, and earn.
 */
const RiderAssignment = require('../models/RiderAssignment');
const { Booking } = require('../models/Booking');
const User = require('../models/User');
const { Notification } = require('../models/Notification');
const { emitToUser } = require('../utils/socket');
const { encryptQR, decryptQR } = require('../utils/qrCrypto');
const notif = require('../services/notification.service');
let Escrow = null;
try { Escrow = require('../models/Escrow'); } catch (_) {}
let createInspectionFromRiderEvidence = null;
try { ({ createInspectionFromRiderEvidence } = require('./inspection.controller')); } catch (_) {}
let InspectionReport = null;
try { InspectionReport = require('../models/InspectionReport'); } catch (_) {}

const eq = (a, b) => String(a) === String(b);

// ── GET /api/rider/assignments?filter=active|completed ────────────────────────
exports.getMyAssignments = async (req, res) => {
  try {
    const { filter } = req.query;
    const q = { rider: req.user._id };
    if (filter === 'completed')       q.status = { $in: ['completed', 'cancelled'] };
    else if (filter === 'active')     q.status = { $in: ['assigned', 'accepted', 'picked_up', 'delivered'] };
    else if (filter === 'pending_returns') {
      // Return assignments that are active/not yet completed — used by the
      // "Pending Returns" page so the rider can see which deliveries they
      // made that now need to be collected back from the renter.
      q.type   = 'return';
      q.status = { $in: ['assigned', 'accepted', 'picked_up', 'delivered'] };
    }

    const assignments = await RiderAssignment.find(q)
      .populate({
        path: 'booking',
        select: 'startDate endDate status totalAmount listing renter owner',
        populate: [
          { path: 'listing', select: 'title images city' },
          { path: 'renter', select: 'name phone email fcmToken' },
          { path: 'owner',  select: 'name phone email address fcmToken' },
        ],
      })
      .select('+qrCode')   // qrCode field include karo — rider ko dikhana hai
      .sort({ createdAt: -1 });

    return res.json({ success: true, data: assignments });
  } catch (err) {
    console.error('[rider.getMyAssignments]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch assignments.' });
  }
};

// ── GET /api/rider/assignments/:id ─────────────────────────────────────────
exports.getAssignment = async (req, res) => {
  try {
    const assignment = await RiderAssignment.findOne({ _id: req.params.id, rider: req.user._id })
      .populate({
        path: 'booking',
        select: 'startDate endDate status totalAmount listing renter owner',
        populate: [
          { path: 'listing', select: 'title images city' },
          { path: 'renter', select: 'name phone email' },
          { path: 'owner',  select: 'name phone email address' },
        ],
      })
      .select('+qrCode');

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }

    const renter = assignment.booking?.renter;
    return res.json({
      success: true,
      data: { ...assignment.toObject(), renter },
    });
  } catch (err) {
    console.error('[rider.getAssignment]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch assignment.' });
  }
};

// ── PATCH /api/rider/assignments/:assignmentId/accept ─────────────────────────
exports.acceptAssignment = async (req, res) => {
  try {
    const a = await RiderAssignment.findById(req.params.id || req.params.assignmentId);
    if (!a) return res.status(404).json({ success: false, message: 'Assignment not found.' });
    if (!eq(a.rider, req.user._id)) return res.status(403).json({ success: false, message: 'Not your assignment.' });
    if (a.status !== 'assigned') return res.status(409).json({ success: false, message: `Cannot accept from '${a.status}'.` });

    a.status = 'accepted';
    a.acceptedAt = new Date();
    await a.save();

    const booking = await Booking.findById(a.booking);
    if (booking) {
      Notification.notify(booking.owner, 'system', 'Rider accepted',
        'A rider has accepted the delivery for your item.', { bookingId: a.booking }).catch(() => {});
      emitToUser(String(booking.owner), 'rider:accepted', { assignmentId: a._id, bookingId: a.booking });
      // riderAssignedAt timestamp save karo
      await Booking.findByIdAndUpdate(a.booking, { riderAssignedAt: new Date() });
      // SMS + Push: both renter and owner
      const fullBooking1 = await Booking.findById(a.booking)
        .populate('renter', 'name phone email fcmToken')
        .populate('owner', 'name phone email fcmToken')
        .populate('listing', 'title')
        .select('+trackingNumber');
      if (fullBooking1) notif.notifyRiderAssigned(fullBooking1).catch(() => {});
    }
    return res.json({ success: true, message: 'Assignment accepted.', data: a });
  } catch (err) {
    console.error('[rider.acceptAssignment]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to accept.' });
  }
};

// ── PATCH /api/rider/assignments/:assignmentId/decline ────────────────────────
exports.declineAssignment = async (req, res) => {
  try {
    const a = await RiderAssignment.findById(req.params.id || req.params.assignmentId);
    if (!a) return res.status(404).json({ success: false, message: 'Assignment not found.' });
    if (!eq(a.rider, req.user._id)) return res.status(403).json({ success: false, message: 'Not your assignment.' });
    if (a.status !== 'assigned') return res.status(409).json({ success: false, message: `Cannot decline from '${a.status}'.` });

    const { reason } = req.body || {};
    a.status = 'declined';
    a.declinedAt = new Date();
    if (reason) a.declineReason = String(reason).trim().slice(0, 200);
    await a.save();

    // Dispatch to another available rider so declining doesn't leave the
    // delivery permanently stuck — same path used when this assignment was
    // first created, which already excludes 'declined' from its duplicate
    // check (see riderDispatch.service.js).
    try {
      const { assignRider } = require('../services/riderDispatch.service');
      await assignRider(a.booking, a.type);
    } catch (e) {
      console.error('[rider.declineAssignment] reassign failed:', e.message);
      // Not fatal to the decline itself — an admin/owner can still see the
      // booking has no active rider and intervene; we don't fail this request.
    }

    const booking = await Booking.findById(a.booking);
    if (booking) {
      Notification.notify(booking.owner, 'system', 'Rider declined',
        'A rider declined the delivery for your item — we are finding another rider.', { bookingId: a.booking }).catch(() => {});
      emitToUser(String(booking.owner), 'rider:declined', { assignmentId: a._id, bookingId: a.booking });
    }

    return res.json({ success: true, message: 'Assignment declined.', data: a });
  } catch (err) {
    console.error('[rider.declineAssignment]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to decline.' });
  }
};

// ── PATCH /api/rider/assignments/:assignmentId/pickup ─────────────────────────
exports.markPickedUp = async (req, res) => {
  try {
    const { evidence, qrCode } = req.body;
    const a = await RiderAssignment.findById(req.params.id || req.params.assignmentId);
    if (!a) return res.status(404).json({ success: false, message: 'Assignment not found.' });
    if (!eq(a.rider, req.user._id)) return res.status(403).json({ success: false, message: 'Not your assignment.' });
    if (!['assigned', 'accepted'].includes(a.status)) return res.status(409).json({ success: false, message: `Cannot pick up from '${a.status}'.` });

    // Require at least one evidence photo
    if (!Array.isArray(evidence) || evidence.length < 1) {
      return res.status(422).json({ success: false, message: 'At least one pickup evidence photo is required.' });
    }
    // QR verification — optional agar assignment already accepted hai
    if (qrCode) {
      let decoded;
      try { decoded = decryptQR(qrCode); }
      catch { return res.status(400).json({ success: false, message: 'Invalid QR code.' }); }
      // bookingId match karo
      if (!eq(decoded.bookingId, a.booking)) {
        return res.status(400).json({ success: false, message: 'QR code does not match this booking.' });
      }
    }

    await a.markPickedUp(evidence);

    // Rider evidence is kept as a delivery record, but the rider no longer runs
    // an AI inspection. Condition inspections are the renter's and owner's
    // responsibility (delivery + return), so the rider just captures proof of
    // handover and moves on.
    const inspection = null;

    const booking = await Booking.findById(a.booking);
    if (booking) {
      booking.status    = 'in_delivery';
      booking.pickedUpAt = new Date();   // ← tracking ke liye
      await booking.save();
      emitToUser(String(booking.renter), 'delivery:picked_up', { bookingId: a.booking, assignmentId: a._id });
      Notification.notify(booking.renter, 'system', 'Item picked up',
        'Your rental item has been picked up and is on the way.', { bookingId: a.booking }).catch(() => {});
      // SMS + Push: notify both
      const fullBooking2 = await Booking.findById(a.booking)
        .populate('renter', 'name phone email fcmToken')
        .populate('owner', 'name phone email fcmToken')
        .populate('listing', 'title')
        .select('+trackingNumber');
      if (fullBooking2) notif.notifyItemPickedUp(fullBooking2).catch(() => {});
    }
    return res.json({ success: true, message: 'Marked as picked up.', data: a, inspection });
  } catch (err) {
    console.error('[rider.markPickedUp]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to mark pickup.' });
  }
};

// ── PATCH /api/rider/assignments/:assignmentId/deliver ────────────────────────
exports.markDelivered = async (req, res) => {
  try {
    const { evidence, location } = req.body;
    const a = await RiderAssignment.findById(req.params.id || req.params.assignmentId);
    if (!a) return res.status(404).json({ success: false, message: 'Assignment not found.' });
    if (!eq(a.rider, req.user._id)) return res.status(403).json({ success: false, message: 'Not your assignment.' });
    if (a.status !== 'picked_up') return res.status(409).json({ success: false, message: `Cannot deliver from '${a.status}'.` });

    if (!Array.isArray(evidence) || evidence.length < 1) {
      return res.status(422).json({ success: false, message: 'At least one delivery evidence photo is required.' });
    }

    await a.markDelivered(evidence);
    if (location && (location.lat || location.lng)) await a.recordQrScan(location.lat, location.lng);

    // The rider's delivery photo doubles as the 'delivery' condition baseline,
    // exactly as before — so the renter only has to submit RETURN photos, and
    // the delivery↔return comparison runs when they do. No comparison happens
    // here (there's nothing to compare a delivery baseline against yet), so this
    // costs a single AI call at most and never blocks the handover.
    const inspection = null;
    if (createInspectionFromRiderEvidence && a.type !== 'return') {
      try {
        await createInspectionFromRiderEvidence(a.booking, 'delivery', evidence, req.user._id);
      } catch (e) {
        console.error('[rider.markDelivered] delivery baseline failed:', e.message);
      }
    }

    const booking = await Booking.findById(a.booking);
    if (booking) {
      booking.status      = 'delivered';
      booking.deliveredAt = new Date();   // ← tracking ke liye timestamp
      await booking.save();
      emitToUser(String(booking.renter), 'booking:delivered', { bookingId: a.booking, assignmentId: a._id });
      emitToUser(String(booking.owner), 'booking:delivered', { bookingId: a.booking, assignmentId: a._id });
      Notification.notify(booking.renter, 'system', 'Item delivered',
        'Your rental item has been delivered. Enjoy!', { bookingId: a.booking }).catch(() => {});
      // SMS + Push: notify both
      const fullBooking3 = await Booking.findById(a.booking)
        .populate('renter', 'name phone email fcmToken')
        .populate('owner', 'name phone email fcmToken')
        .populate('listing', 'title')
        .select('+trackingNumber');
      if (fullBooking3) notif.notifyItemDelivered(fullBooking3).catch(() => {});
    }
    return res.json({ success: true, message: 'Marked as delivered.', data: a, inspection });
  } catch (err) {
    console.error('[rider.markDelivered]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to mark delivery.' });
  }
};

// ── POST /api/rider/scan-qr  (verify booking authenticity) ────────────────────
exports.scanQR = async (req, res) => {
  try {
    const { qrCode } = req.body;
    if (!qrCode) return res.status(422).json({ success: false, message: 'qrCode is required.' });

    let decoded;
    try { decoded = decryptQR(qrCode); }
    catch { return res.status(400).json({ success: false, message: 'Invalid or tampered QR code.' }); }

    const booking = await Booking.findById(decoded.bookingId)
      .populate('listing', 'title city area')
      .populate('renter', 'name phone')
      .populate('owner', 'name phone address');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found for this QR.' });

    // Confirm the scanning rider is assigned to this booking
    const assignment = await RiderAssignment.findOne({ booking: booking._id, rider: req.user._id });
    if (!assignment) return res.status(403).json({ success: false, message: 'You are not assigned to this booking.' });

    await assignment.recordQrScan(req.body.lat, req.body.lng);

    return res.json({
      success: true,
      message: 'QR verified.',
      data: {
        bookingId: booking._id,
        assignmentId: assignment._id,
        type: assignment.type,
        status: assignment.status,
        listing: booking.listing,
        renter: booking.renter,
        owner: booking.owner,
        startDate: booking.startDate,
        endDate: booking.endDate,
        // Where to pick up (owner) and where to deliver (renter):
        pickup: {
          name:    booking.owner?.name || null,
          phone:   booking.owner?.phone || null,
          address: booking.owner?.address
                   || [booking.listing?.area, booking.listing?.city].filter(Boolean).join(', ')
                   || 'See owner for exact address',
        },
        delivery: {
          name:    booking.renter?.name || null,
          phone:   booking.deliveryPhone || booking.renter?.phone || null,
          address: booking.deliveryAddress || 'No delivery address provided',
        },
      },
    });
  } catch (err) {
    console.error('[rider.scanQR]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to verify QR.' });
  }
};

// ── PATCH /api/rider/assignments/:assignmentId/complete ───────────────────────
exports.completeAssignment = async (req, res) => {
  try {
    const a = await RiderAssignment.findById(req.params.id || req.params.assignmentId);
    if (!a) return res.status(404).json({ success: false, message: 'Assignment not found.' });
    if (!eq(a.rider, req.user._id)) return res.status(403).json({ success: false, message: 'Not your assignment.' });
    if (a.status !== 'delivered') return res.status(409).json({ success: false, message: `Cannot complete from '${a.status}'.` });

    a.status = 'completed';
    a.completedAt = new Date();
    // Booking mein bhi completedAt save karo — tracking ke liye
    await Booking.findByIdAndUpdate(a.booking, { completedAt: new Date(), status: 'completed' });
    await a.save();

    const rider = await User.findById(a.rider);
    if (rider) {
      rider.totalDeliveries = (rider.totalDeliveries || 0) + 1;
      await rider.save({ validateBeforeSave: false });
    }

    // Payout does NOT happen here — riderPayoutCron.service.js releases it
    // 24h after deliveredAt, independent of any damage claim on the booking
    // (a damage claim is about the item's condition, not whether the rider
    // did their job). This just confirms the leg is done.
    Notification.notify(a.rider, 'system', 'Delivery completed',
      a.earnings > 0
        ? `Rs ${a.earnings} will be added to your wallet within 24 hours.`
        : 'Delivery completed.',
      // Riders can't open /bookings/:id (owner/renter only) — send them to
      // their own earnings page instead of an "Access denied" screen.
      { bookingId: a.booking, link: '/rider/earnings' }).catch(() => {});
    return res.json({ success: true, message: 'Assignment completed.', data: a });
  } catch (err) {
    console.error('[rider.completeAssignment]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to complete.' });
  }
};

// ── PATCH /api/rider/assignments/:assignmentId/collect-remaining ──────────────
// Rider collects the renter's remaining booking balance as cash, or confirms
// the renter paid it via wallet, at handover. Independent of this
// assignment's own delivery-fee payout.
exports.collectRemaining = async (req, res) => {
  try {
    const a = await RiderAssignment.findById(req.params.id || req.params.assignmentId);
    if (!a) return res.status(404).json({ success: false, message: 'Assignment not found.' });
    if (!eq(a.rider, req.user._id)) return res.status(403).json({ success: false, message: 'Not your assignment.' });

    const { method } = req.body;   // 'cash' | 'wallet'
    if (!['cash', 'wallet'].includes(method)) {
      return res.status(422).json({ success: false, message: "method must be 'cash' or 'wallet'." });
    }

    const booking = await Booking.findById(a.booking);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
    if (!booking.remainingAmount || booking.remainingAmount <= 0) {
      return res.status(409).json({ success: false, message: 'Nothing remaining to collect on this booking.' });
    }
    if (booking.remainingCollectedAt) {
      return res.status(409).json({ success: false, message: 'Remaining amount already collected.' });
    }

    booking.remainingPaymentMethod = method;
    booking.remainingCollectedAt = new Date();
    booking.remainingRefused = false;
    await booking.save();

    // FIX (30 Jun): the advance-only escrow hold never reflected this
    // collection, which meant the owner's eventual payout was calculated
    // off the advance alone — short by everything collected here. Top up
    // the rental portion only (remainingAmount includes deliveryFee, which
    // isn't part of escrow/owner-payout accounting).
    if (Escrow && typeof Escrow.topUpRental === 'function') {
      try {
        const rentalPortion = Math.max(0, Number(booking.remainingAmount) - Number(booking.deliveryFee || 0));
        if (rentalPortion > 0) await Escrow.topUpRental(booking._id, rentalPortion);
      } catch (e) { console.error('[rider.collectRemaining] escrow top-up failed:', e.message); }
    }

    Notification.notify(booking.owner, 'payment_received', 'Remaining balance collected',
      `Rs ${booking.remainingAmount} collected from the renter (${method}).`, { bookingId: booking._id }).catch(() => {});

    return res.json({ success: true, message: 'Remaining amount marked as collected.', data: { booking: booking.toPublicJSON() } });
  } catch (err) {
    console.error('[rider.collectRemaining]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to record collection.' });
  }
};

// ── PATCH /api/rider/assignments/:assignmentId/refused ─────────────────────────
// Renter refused to pay the remaining balance at handover. Raises a dispute
// rather than silently completing the booking, and the rider still earns a
// partial "attempt fee" for showing up — they aren't penalized for a
// renter's refusal.
exports.markRefused = async (req, res) => {
  try {
    const a = await RiderAssignment.findById(req.params.id || req.params.assignmentId);
    if (!a) return res.status(404).json({ success: false, message: 'Assignment not found.' });
    if (!eq(a.rider, req.user._id)) return res.status(403).json({ success: false, message: 'Not your assignment.' });

    const booking = await Booking.findById(a.booking);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    booking.remainingRefused = true;
    booking.status = 'disputed';
    booking.disputeReason = 'Renter refused to pay the remaining balance at handover.';
    booking.disputeRaisedBy = a.rider;
    booking.disputeRaisedAt = new Date();
    await booking.save();

    // Partial attempt fee — half of what this leg would have earned — so the
    // rider isn't paid nothing for a trip that wasn't their fault, but also
    // isn't paid the full fee for a leg that didn't actually complete.
    const ATTEMPT_FEE_RATE = 0.5;
    a.earnings = Math.round((a.earnings || 0) * ATTEMPT_FEE_RATE);
    a.payoutStatus = 'refused';
    a.riderNotes = (a.riderNotes ? a.riderNotes + ' | ' : '') + 'Customer refused remaining payment.';
    await a.save();

    Notification.notify(booking.owner, 'system', 'Payment refused',
      'The renter refused to pay the remaining balance. This booking has been flagged for dispute review.',
      { bookingId: booking._id }).catch(() => {});

    return res.json({ success: true, message: 'Refusal recorded and booking flagged for dispute.', data: { booking: booking.toPublicJSON(), assignment: a } });
  } catch (err) {
    console.error('[rider.markRefused]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to record refusal.' });
  }
};

// ── GET /api/rider/earnings  (rider's earnings summary) ──────────────────────
exports.getEarnings = async (req, res) => {
  try {
    const riderId = req.user._id;
    const now = new Date();
    const startOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek  = new Date(startOfDay); startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Pull from the Transaction ledger (type 'rider_earning') rather than
    // re-summing RiderAssignment.earnings directly — this guarantees the
    // numbers shown here always match what's in the rider's wallet history,
    // since both read from the same source of truth.
    const { Transaction } = require('../models/Transaction');
    const released = await Transaction.find({
      user: riderId, type: 'rider_earning', status: 'completed',
    }).select('amount createdAt').lean();

    const sum = (from) => released
      .filter(t => new Date(t.createdAt) >= from)
      .reduce((tot, t) => tot + (t.amount || 0), 0);

    const totalEarnings = released.reduce((tot, t) => tot + (t.amount || 0), 0);

    // Pending = assignments delivered/completed but not yet released by the
    // 24h payout cron — shown separately so riders can see what's still
    // coming without it being counted as already-earned.
    const pendingAssignments = await RiderAssignment.find({
      rider: riderId,
      status: { $in: ['delivered', 'completed'] },
      payoutStatus: 'pending',
    }).select('earnings').lean();
    const pendingEarnings = pendingAssignments.reduce((tot, a) => tot + (a.earnings || 0), 0);

    // Active (in-progress) assignments
    const activeCount = await RiderAssignment.countDocuments({
      rider: riderId,
      status: { $in: ['assigned', 'accepted', 'picked_up'] },
    });

    const totalDeliveries = await RiderAssignment.countDocuments({
      rider: riderId,
      status: { $in: ['delivered', 'completed'] },
    });

    const rider = await User.findById(riderId).select('riderRating isAvailable').lean();

    // Last 7 days, oldest→newest, real daily totals from the same released
    // transactions already loaded above — zero extra DB round-trips.
    const dayKey = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(startOfDay);
      d.setDate(d.getDate() - i);
      last7Days.push(dayKey(d));
    }
    const byDay = {};
    for (const t of released) {
      const k = dayKey(new Date(t.createdAt));
      byDay[k] = (byDay[k] || 0) + (t.amount || 0);
    }

    // Daily delivery count (completed/delivered assignments) for the bar chart
    const completedAssignments = await RiderAssignment.find({
      rider: riderId,
      status: { $in: ['delivered', 'completed'] },
      deliveredAt: { $ne: null },
    }).select('deliveredAt').lean();
    const byDayCount = {};
    for (const a of completedAssignments) {
      const k = dayKey(new Date(a.deliveredAt));
      byDayCount[k] = (byDayCount[k] || 0) + 1;
    }

    const weeklyTrend = last7Days.map(k => ({
      date:   k,
      amount: byDay[k]      || 0,
      count:  byDayCount[k] || 0,
    }));

    // Status + type breakdown for the rider's full assignment history — real
    // counts, used for the dashboard's delivery-mix chart.
    const [statusAgg, typeAgg] = await Promise.all([
      RiderAssignment.aggregate([
        { $match: { rider: riderId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      RiderAssignment.aggregate([
        { $match: { rider: riderId } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
    ]);
    const statusBreakdown = { assigned: 0, accepted: 0, declined: 0, picked_up: 0, delivered: 0, completed: 0, cancelled: 0 };
    statusAgg.forEach(s => { statusBreakdown[s._id] = s.count; });
    const typeBreakdown = { delivery: 0, return: 0 };
    typeAgg.forEach(t => { typeBreakdown[t._id] = t.count; });

    // ── Performance metrics — every one of these is derived straight from
    //    real RiderAssignment records, never a placeholder or guess. ──────────

    // Avg delivery time: minutes between pickup and delivery, across every
    // assignment that actually has both timestamps (delivered or completed).
    const timedAssignments = await RiderAssignment.find({
      rider: riderId,
      pickedUpAt: { $ne: null },
      deliveredAt: { $ne: null },
    }).select('pickedUpAt deliveredAt').lean();
    const avgDeliveryMinutes = timedAssignments.length > 0
      ? Math.round(
          timedAssignments.reduce((sum, a) => sum + (new Date(a.deliveredAt) - new Date(a.pickedUpAt)), 0)
          / timedAssignments.length / 60000
        )
      : null; // null (not 0) when there's no data yet — "0 min" would be misleadingly precise

    // Completion rate: of everything ever picked up, what fraction actually
    // reached delivered/completed (vs. e.g. cancelled after pickup).
    const everPickedUp = await RiderAssignment.countDocuments({
      rider: riderId,
      status: { $in: ['picked_up', 'delivered', 'completed', 'cancelled'] },
      pickedUpAt: { $ne: null },
    });
    const completionRate = everPickedUp > 0
      ? Math.round((totalDeliveries / everPickedUp) * 100)
      : null;

    // Acceptance rate: of offers actually responded to (accepted or
    // declined — excludes ones still sitting as 'assigned' awaiting a
    // response), what fraction were accepted.
    const acceptedCount = statusBreakdown.accepted + statusBreakdown.picked_up
      + statusBreakdown.delivered + statusBreakdown.completed;
    const respondedCount = acceptedCount + statusBreakdown.declined;
    const acceptanceRate = respondedCount > 0
      ? Math.round((acceptedCount / respondedCount) * 100)
      : null;

    // Milestone bonus progress — releasedCount is what actually counts
    // toward milestones (payoutStatus: 'released'), which can lag slightly
    // behind totalDeliveries while a payout is still in its 24h grace period.
    const { MILESTONES } = require('../services/riderMilestone.service');
    const releasedCount = await RiderAssignment.countDocuments({ rider: riderId, payoutStatus: 'released' });
    const nextMilestone = MILESTONES.find(m => releasedCount < m.count) || null;
    const bonusTxns = await Transaction.find({ user: riderId, type: 'rider_milestone_bonus', status: 'completed' }).select('amount').lean();
    const totalMilestoneBonus = bonusTxns.reduce((tot, t) => tot + (t.amount || 0), 0);

    return res.json({
      success: true,
      data: {
        today:       sum(startOfDay),
        thisWeek:    sum(startOfWeek),
        thisMonth:   sum(startOfMonth),
        totalEarnings,
        pendingEarnings,
        totalDeliveries,
        activeDeliveries: activeCount,
        riderRating: rider?.riderRating || 0,
        isAvailable: rider?.isAvailable || false,
        weeklyTrend,
        milestones: {
          completedOrders: releasedCount,
          totalBonusEarned: totalMilestoneBonus,
          nextMilestone: nextMilestone
            ? { count: nextMilestone.count, bonus: nextMilestone.bonus, remaining: nextMilestone.count - releasedCount }
            : null,   // null once every milestone has been reached
          all: MILESTONES,
        },
        statusBreakdown,
        typeBreakdown,
        avgDeliveryMinutes,
        completionRate,
        acceptanceRate,
      },
    });
  } catch (err) {
    console.error('[rider.getEarnings]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load earnings.' });
  }
};
exports.toggleAvailability = async (req, res) => {
  try {
    const rider = await User.findById(req.user._id);
    if (!rider || rider.role !== 'rider') {
      return res.status(403).json({ success: false, message: 'Rider account required.' });
    }
    // Explicit value if provided, otherwise flip
    rider.isAvailable = typeof req.body.isAvailable === 'boolean'
      ? req.body.isAvailable
      : !rider.isAvailable;
    await rider.save({ validateBeforeSave: false });

    emitToUser(String(rider._id), 'rider:availability', { isAvailable: rider.isAvailable });
    return res.json({ success: true, message: `You are now ${rider.isAvailable ? 'ON' : 'OFF'} duty.`, data: { isAvailable: rider.isAvailable } });
  } catch (err) {
    console.error('[rider.toggleAvailability]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update availability.' });
  }
};

// ── PATCH /api/rider/location  (update live location; also via socket) ────────
exports.updateLocation = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      return res.status(422).json({ success: false, message: 'Valid lat and lng are required.' });
    }
    const rider = await User.findByIdAndUpdate(
      req.user._id,
      { currentLocation: { type: 'Point', coordinates: [Number(lng), Number(lat)] } },
      { new: true }
    );
    // Broadcast so any party tracking this rider gets the live position
    emitToUser(String(req.user._id), 'rider:location_update', { lat: Number(lat), lng: Number(lng) });

    // ── ETA check: if rider has an active delivery, calculate ETA to renter ──
    // Fire-and-forget — never delay the location update response
    (async () => {
      try {
        const activeAssignment = await RiderAssignment.findOne({
          rider: req.user._id,
          status: { $in: ['accepted', 'picked_up'] },
        }).populate({
          path: 'booking',
          populate: [
            { path: 'renter',  select: 'name phone fcmToken' },
            { path: 'owner',   select: 'name phone fcmToken' },
            { path: 'listing', select: 'title' },
          ],
        });

        if (!activeAssignment || !activeAssignment.booking) return;

        const booking = activeAssignment.booking;

        // Only check ETA when item is picked_up (rider going to renter)
        if (activeAssignment.status !== 'picked_up') {
          // If rider is at accepted stage, notify owner that rider is arriving
          const eta = await notif.getETAMinutes(Number(lat), Number(lng),
            booking.owner?.currentLocation?.coordinates?.[1],
            booking.owner?.currentLocation?.coordinates?.[0]);
          if (eta !== null && eta <= 5 && !activeAssignment.arrivedAtOwnerNotified) {
            await RiderAssignment.findByIdAndUpdate(activeAssignment._id, { arrivedAtOwnerNotified: true });
            notif.notifyRiderAtPickup(booking).catch(() => {});
          }
          return;
        }

        // Status is picked_up — check ETA to renter delivery address
        if (!booking.deliveryLat || !booking.deliveryLng) return;

        const etaMin = await notif.getETAMinutes(
          Number(lat), Number(lng),
          Number(booking.deliveryLat), Number(booking.deliveryLng)
        );
        if (etaMin === null) return;

        // Send 10-min warning once (guard with a flag on the assignment)
        if (etaMin <= 10 && !activeAssignment.eta10MinNotified) {
          await RiderAssignment.findByIdAndUpdate(activeAssignment._id, { eta10MinNotified: true });
          notif.notifyETA10Min(booking, etaMin).catch(() => {});
          emitToUser(String(booking.renter._id), 'delivery:eta_10min', { etaMinutes: etaMin, bookingId: booking._id });
        }
      } catch (e) {
        // Never crash the location update
        if (process.env.NODE_ENV === 'development') console.warn('[ETA check]', e.message);
      }
    })();

    return res.json({ success: true, message: 'Location updated.', data: { currentLocation: rider.currentLocation } });
  } catch (err) {
    console.error('[rider.updateLocation]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update location.' });
  }
};

// ── Helper export: generate a QR token for an assignment (used by admin/system) ─
exports.generateAssignmentQR = (bookingId, assignmentId, type) =>
  encryptQR({ bookingId: String(bookingId), assignmentId: String(assignmentId), type });
