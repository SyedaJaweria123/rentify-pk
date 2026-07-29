'use strict';
/**
 * Escrow Model — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Holds a booking's rental fee + security deposit until the rental completes,
 * then releases to the owner / refunds the renter (minus platform fee and any
 * damage deduction). One escrow per booking.
 *
 * Statics:
 *   holdFunds(bookingId, renterId, ownerId, rentalAmount, depositAmount, paymentRef)
 *   releaseFunds(bookingId, releaseBreakdown)   → credits owner, refunds renter
 *   holdForDispute(bookingId, reason)
 * ─────────────────────────────────────────────────────────────────────────────
 */
const mongoose = require('mongoose');
const User = require('./User');
const { Transaction } = require('./Transaction');

const ESCROW_STATUS = ['holding', 'released', 'refunded', 'disputed', 'partial_release'];

const escrowSchema = new mongoose.Schema(
  {
    booking:       { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true, index: true },
    renter:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    owner:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    rentalAmount:  { type: Number, required: true, min: 0 },   // rental fee held
    depositAmount: { type: Number, default: 0, min: 0 },       // security deposit held
    totalHeld:     { type: Number, required: true, min: 0 },

    status:        { type: String, enum: ESCROW_STATUS, default: 'holding', index: true },

    heldAt:        { type: Date, default: Date.now },
    releasedAt:    { type: Date, default: null },
    refundedAt:    { type: Date, default: null },

    releaseBreakdown: {
      ownerAmount:     { type: Number, default: 0 },
      renterRefund:    { type: Number, default: 0 },
      platformFee:     { type: Number, default: 0 },
      damageDeduction: { type: Number, default: 0 },
    },

    paymentRef:    { type: String, default: null },   // gateway transaction ID
    releaseNotes:  { type: String, default: '' },
    disputeReason: { type: String, default: '' },
  },
  { timestamps: true }
);

// ── Helper: credit a user's wallet + record a transaction (within a session) ──
async function creditWallet(userId, amount, type, description, bookingId, session) {
  if (!amount || amount <= 0) return;
  const q = User.findById(userId);
  if (session) q.session(session);
  const user = await q;
  if (!user) {
    // The user was deleted after the booking settled. Don't abort the whole
    // release (which would leave the escrow stuck in 'holding' forever and
    // block the platform-fee record) — log it and skip just this credit.
    console.warn('[Escrow.creditWallet] wallet owner missing, skipping credit: ' + userId);
    return;
  }
  user.walletBalance = (user.walletBalance || 0) + amount;
  await user.save(session ? { session, validateBeforeSave: false } : { validateBeforeSave: false });
  const txDoc = {
    user: userId,
    type,
    amount,                              // positive = credit
    balance: user.walletBalance,
    status: 'completed',
    description,
    booking: bookingId || null,
  };
  if (session) await Transaction.create([txDoc], { session });
  else await Transaction.create(txDoc);
}

// ══════════════════════════════════════════════════════════════════════════════
// STATICS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Create (or return existing) escrow for a booking, holding the funds.
 */
escrowSchema.statics.holdFunds = async function (
  bookingId, renterId, ownerId, rentalAmount, depositAmount = 0, paymentRef = null
) {
  const existing = await this.findOne({ booking: bookingId });
  if (existing) return existing;   // idempotent — never double-hold

  const rental  = Number(rentalAmount)  || 0;
  const deposit  = Number(depositAmount) || 0;
  return this.create({
    booking: bookingId,
    renter:  renterId,
    owner:   ownerId,
    rentalAmount:  rental,
    depositAmount: deposit,
    totalHeld:     rental + deposit,
    status: 'holding',
    paymentRef,
    heldAt: new Date(),
  });
};

/**
 * FIX (30 Jun): With Trust-Tiered Payment, holdFunds() is first called with
 * only the advance portion of the rent (e.g. 40%) — but it's idempotent, so
 * the escrow's rentalAmount was permanently stuck at that advance figure.
 * When the rider later collects the remaining balance as cash/wallet on
 * delivery (rider.controller.js collectRemaining()), nothing ever told the
 * escrow about it — so every owner payout (normal release, damage claim,
 * dispute resolution) silently shorted the owner by the uncollected portion.
 *
 * Call this once the remaining balance is collected, to bring
 * escrow.rentalAmount up to the booking's full rental subtotal so payouts
 * are calculated against what was actually paid in total.
 */
escrowSchema.statics.topUpRental = async function (bookingId, additionalRentalAmount) {
  const escrow = await this.findOne({ booking: bookingId });
  if (!escrow) return null;                          // no escrow held for this booking — nothing to top up
  if (escrow.status !== 'holding') return escrow;     // already released/refunded/disputed — don't touch settled funds

  const extra = Number(additionalRentalAmount) || 0;
  if (extra <= 0) return escrow;

  escrow.rentalAmount = (Number(escrow.rentalAmount) || 0) + extra;
  escrow.totalHeld    = (Number(escrow.totalHeld) || 0) + extra;
  await escrow.save();
  return escrow;
};

/**
 * Release held funds per breakdown: credit owner, refund renter, take fee,
 * deduct damages. Runs in a transaction so wallet + escrow stay consistent.
 *
 * @param {string} bookingId
 * @param {{ownerAmount?,renterRefund?,platformFee?,damageDeduction?,notes?}} breakdown
 */
escrowSchema.statics.releaseFunds = async function (bookingId, breakdown = {}) {
  const escrow = await this.findOne({ booking: bookingId });
  if (!escrow) throw new Error('Escrow not found for booking ' + bookingId);
  if (escrow.status === 'released' || escrow.status === 'refunded') {
    return escrow;   // already settled — idempotent
  }

  const ownerAmount     = Number(breakdown.ownerAmount)     || 0;
  const renterRefund    = Number(breakdown.renterRefund)    || 0;
  const platformFee     = Number(breakdown.platformFee)     || 0;
  const damageDeduction = Number(breakdown.damageDeduction) || 0;

  const applyRelease = async (session) => {
    await creditWallet(escrow.owner, ownerAmount, 'booking_earning',
      'Rental payout released from escrow', bookingId, session);
    await creditWallet(escrow.renter, renterRefund, 'deposit_release',
      'Security deposit refunded from escrow', bookingId, session);
    escrow.releaseBreakdown = { ownerAmount, renterRefund, platformFee, damageDeduction };
    escrow.releaseNotes = breakdown.notes || '';
    escrow.releasedAt = new Date();
    escrow.status = damageDeduction > 0 ? 'partial_release' : 'released';
    await escrow.save(session ? { session } : {});
  };

  // Prefer an atomic transaction (replica set). Fall back to non-transactional
  // writes on a standalone MongoDB, which doesn't support transactions.
  let session;
  try {
    session = await mongoose.startSession();
    await session.withTransaction(() => applyRelease(session));
    return escrow;
  } catch (err) {
    const noTxn = /Transaction numbers are only allowed|replica set|Transactions are not supported/i.test(err.message);
    if (noTxn) {
      console.warn('[Escrow.releaseFunds] standalone Mongo — applying without transaction.');
      await applyRelease(null);
      return escrow;
    }
    throw err;
  } finally {
    if (session) session.endSession();
  }
};

/**
 * Freeze the escrow for dispute resolution (funds stay held).
 */
escrowSchema.statics.holdForDispute = async function (bookingId, reason = '') {
  const escrow = await this.findOne({ booking: bookingId });
  if (!escrow) throw new Error('Escrow not found for booking ' + bookingId);
  escrow.status = 'disputed';
  escrow.disputeReason = reason;
  await escrow.save();
  return escrow;
};

module.exports = mongoose.models.Escrow
  || mongoose.model('Escrow', escrowSchema);
module.exports.ESCROW_STATUS = ESCROW_STATUS;
