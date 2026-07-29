'use strict';
/**
 * Escrow Controller — Rentify PK
 * Holds booking funds on payment, releases after a clean inspection, and lets
 * the parties/admin view escrow status.
 */
const Escrow = require('../models/Escrow');
const { Booking } = require('../models/Booking');
const { Notification } = require('../models/Notification');
const User = require('../models/User');
const sms = require('../services/sms.service');
const { recordPlatformFee } = require('../services/platformFee.service');
let InspectionReport = null;
try { InspectionReport = require('../models/InspectionReport'); } catch (_) {}

const SERVICE_FEE_RATE = Number(process.env.SERVICE_FEE_RATE || 0.05);
const eq = (a, b) => String(a) === String(b);

// ── POST /api/escrow/:bookingId/hold  (after payment success) ─────────────────
exports.holdFunds = async (req, res) => {
  try {
    const bookingId = req.params.bookingId || req.body.bookingId;
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    const rentalAmount  = Number(booking.subtotal) || 0;        // owner-side rental
    const depositAmount = Number(booking.depositAmount) || 0;
    const paymentRef    = req.body.paymentRef || null;

    const escrow = await Escrow.holdFunds(
      booking._id, booking.renter, booking.owner, rentalAmount, depositAmount, paymentRef
    );

    return res.status(201).json({ success: true, message: 'Funds held in escrow.', data: escrow });
  } catch (err) {
    console.error('[escrow.holdFunds]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to hold funds.' });
  }
};

// ── POST /api/escrow/:bookingId/release  (after inspection, no damage) ────────
exports.releaseFunds = async (req, res) => {
  try {
    const bookingId = req.params.bookingId || req.body.bookingId;
    const escrow = await Escrow.findOne({ booking: bookingId });
    if (!escrow) return res.status(404).json({ success: false, message: 'Escrow not found.' });
    if (escrow.status === 'released' || escrow.status === 'refunded') {
      return res.status(409).json({ success: false, message: 'Escrow already settled.' });
    }

    // Escrow funds are never released without a completed return InspectionReport.
    // (Admins may override with ?force=true / { force:true } when no inspection applies.)
    const force = req.body.force === true || req.query.force === 'true';
    if (InspectionReport && !force) {
      const inspection = await InspectionReport.findOne({ booking: bookingId, type: 'return' });
      if (!inspection) {
        return res.status(409).json({
          success: false,
          message: 'A completed return inspection is required before releasing escrow.',
          code: 'INSPECTION_REQUIRED',
        });
      }
    }

    // Damage deduction (0 when inspection is clean), can be passed by caller
    const damageDeduction = Number(req.body.damageDeduction) || 0;
    const platformFee     = Math.round(escrow.rentalAmount * SERVICE_FEE_RATE);
    const ownerAmount     = Math.max(0, escrow.rentalAmount - platformFee);
    const renterRefund    = Math.max(0, escrow.depositAmount - damageDeduction);

    const updated = await Escrow.releaseFunds(bookingId, {
      ownerAmount, renterRefund, platformFee, damageDeduction,
      notes: req.body.notes || 'Released after inspection',
    });

    // Book the platform's cut as revenue. The fee was already deducted from the
    // owner's payout above, but without this Transaction row it never showed up
    // in admin revenue totals — which is why Total Revenue read Rs 0.
    recordPlatformFee(bookingId, platformFee).catch(e =>
      console.error('[escrow.releaseFunds] fee record failed:', e.message));

    // Notify both parties (best-effort)
    Notification.notify(escrow.owner, 'payment_received', 'Payout released',
      `Rs ${ownerAmount} has been credited to your wallet.`, { bookingId }).catch(() => {});
    Notification.notify(escrow.renter, 'payment_received', 'Deposit refunded',
      `Rs ${renterRefund} security deposit has been refunded.`, { bookingId }).catch(() => {});

    // SMS alert to the owner about the payout (Pakistan reads SMS reliably)
    User.findById(escrow.owner).select('phone').lean()
      .then(u => { if (u?.phone) sms.smsPaymentReleased(u, ownerAmount).catch(() => {}); })
      .catch(() => {});

    return res.json({ success: true, message: 'Escrow released.', data: updated });
  } catch (err) {
    console.error('[escrow.releaseFunds]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to release funds.' });
  }
};

// ── POST /api/escrow/:bookingId/partial-release  (admin, after dispute) ───────
exports.partialRelease = async (req, res) => {
  try {
    const bookingId = req.params.bookingId || req.body.bookingId;
    const ownerAmount  = Number(req.body.ownerAmount)  || 0;
    const renterRefund = Number(req.body.renterRefund) || 0;

    const escrow = await Escrow.findOne({ booking: bookingId });
    if (!escrow) return res.status(404).json({ success: false, message: 'Escrow not found.' });
    if (escrow.status === 'released' || escrow.status === 'refunded') {
      return res.status(409).json({ success: false, message: 'Escrow already settled.' });
    }

    const totalSplit = ownerAmount + renterRefund;
    const damageDeduction = Math.max(0, escrow.totalHeld - totalSplit);

    const updated = await Escrow.releaseFunds(bookingId, {
      ownerAmount, renterRefund, platformFee: 0, damageDeduction,
      notes: req.body.notes || 'Partial release after dispute resolution',
    });

    Notification.notify(escrow.owner, 'payment_received', 'Dispute settled',
      `Rs ${ownerAmount} released to your wallet after dispute resolution.`, { bookingId }).catch(() => {});
    Notification.notify(escrow.renter, 'payment_received', 'Dispute settled',
      `Rs ${renterRefund} refunded to you after dispute resolution.`, { bookingId }).catch(() => {});

    return res.json({ success: true, message: 'Funds split per dispute resolution.', data: updated });
  } catch (err) {
    console.error('[escrow.partialRelease]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to partially release funds.' });
  }
};

// ── POST /api/escrow/:bookingId/dispute  (freeze funds) ───────────────────────
exports.holdForDispute = async (req, res) => {
  try {
    const bookingId = req.params.bookingId || req.body.bookingId;
    const escrow = await Escrow.holdForDispute(bookingId, req.body.reason || '');
    return res.json({ success: true, message: 'Escrow frozen for dispute.', data: escrow });
  } catch (err) {
    console.error('[escrow.holdForDispute]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to freeze escrow.' });
  }
};

// ── GET /api/escrow/:bookingId  (admin / owner / renter) ──────────────────────
exports.getEscrowStatus = async (req, res) => {
  try {
    const bookingId = req.params.bookingId;
    const escrow = await Escrow.findOne({ booking: bookingId })
      .populate('booking')
      .populate('owner', 'name email')
      .populate('renter', 'name email');
    if (!escrow) return res.status(404).json({ success: false, message: 'Escrow not found.' });

    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    const isParty = eq(escrow.owner, req.user._id) || eq(escrow.renter, req.user._id);
    if (!isAdmin && !isParty) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this escrow.' });
    }

    return res.json({ success: true, data: escrow });
  } catch (err) {
    console.error('[escrow.getEscrowStatus]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch escrow.' });
  }
};
