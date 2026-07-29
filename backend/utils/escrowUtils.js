'use strict';
/**
 * Escrow Utilities — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Integrity / fraud-detection helpers for the escrow ledger and a formatted
 * summary for admins. Every rupee held must reconcile against the recorded
 * release/refund transactions.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const { Transaction } = require('../models/Transaction');
let Escrow = null;
try { Escrow = require('../models/Escrow'); } catch (_) {}

const round2 = (n) => Math.round(Number(n) * 100) / 100;

/**
 * Verify that an escrow's recorded movements reconcile.
 * Rule: once released/refunded, (ownerAmount + renterRefund + platformFee +
 * damageDeduction) must equal totalHeld. While 'holding', no release tx should
 * exist. Throws on mismatch (potential fraud / bug).
 *
 * @param {string} bookingId
 * @returns {Promise<{ ok: true, status, totalHeld, accountedFor }>}
 */
const verifyEscrowIntegrity = async (bookingId) => {
  if (!Escrow) throw new Error('Escrow model not available.');
  const escrow = await Escrow.findOne({ booking: bookingId });
  if (!escrow) throw new Error('Escrow not found for booking ' + bookingId);

  const b = escrow.releaseBreakdown || {};
  const breakdownSum = round2(
    (Number(b.ownerAmount) || 0) +
    (Number(b.renterRefund) || 0) +
    (Number(b.platformFee) || 0) +
    (Number(b.damageDeduction) || 0)
  );
  const totalHeld = round2(escrow.totalHeld);

  // Related ledger entries for this booking
  const txns = await Transaction.find({
    booking: bookingId,
    type: { $in: ['booking_earning', 'deposit_release', 'service_fee', 'refund'] },
  });
  const creditedSum = round2(txns.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0));

  if (['released', 'partial_release', 'refunded'].includes(escrow.status)) {
    // Breakdown must reconcile against the total held
    if (breakdownSum !== totalHeld) {
      throw new Error(
        `Escrow integrity FAIL (booking ${bookingId}): breakdown ${breakdownSum} != totalHeld ${totalHeld}`
      );
    }
    // Wallet-affecting credits (owner + renter) must not exceed what was held
    const walletCredits = round2((Number(b.ownerAmount) || 0) + (Number(b.renterRefund) || 0));
    if (creditedSum + 0.01 < walletCredits) {
      throw new Error(
        `Escrow integrity FAIL (booking ${bookingId}): ledger credits ${creditedSum} < expected ${walletCredits}`
      );
    }
  } else if (escrow.status === 'holding') {
    // Nothing should have been credited yet
    const walletCredits = txns.filter(t => ['booking_earning', 'deposit_release'].includes(t.type))
      .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
    if (round2(walletCredits) > 0) {
      throw new Error(
        `Escrow integrity FAIL (booking ${bookingId}): funds credited while still 'holding'`
      );
    }
  }

  return { ok: true, status: escrow.status, totalHeld, accountedFor: breakdownSum, ledgerSum: creditedSum };
};

/**
 * Formatted escrow summary for admin dashboards.
 * @param {string} bookingId
 */
const getEscrowSummary = async (bookingId) => {
  if (!Escrow) throw new Error('Escrow model not available.');
  const escrow = await Escrow.findOne({ booking: bookingId })
    .populate('owner', 'name email')
    .populate('renter', 'name email');
  if (!escrow) throw new Error('Escrow not found for booking ' + bookingId);

  const txns = await Transaction.find({ booking: bookingId })
    .select('type amount status createdAt')
    .sort({ createdAt: 1 });

  let integrity = { ok: true };
  try { integrity = await verifyEscrowIntegrity(bookingId); }
  catch (e) { integrity = { ok: false, error: e.message }; }

  return {
    bookingId,
    status: escrow.status,
    rentalAmount: escrow.rentalAmount,
    depositAmount: escrow.depositAmount,
    totalHeld: escrow.totalHeld,
    releaseBreakdown: escrow.releaseBreakdown,
    owner: escrow.owner,
    renter: escrow.renter,
    heldAt: escrow.heldAt,
    releasedAt: escrow.releasedAt,
    refundedAt: escrow.refundedAt,
    transactions: txns,
    integrity,
  };
};

module.exports = { verifyEscrowIntegrity, getEscrowSummary };
