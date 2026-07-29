'use strict';
/**
 * Escrow Auto-Release Cron Job — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs every hour. Finds bookings whose rental period has ended (endDate < now)
 * and automatically releases their escrow — so owner gets paid and renter gets
 * deposit back without admin having to do it manually.
 *
 * RELEASE CONDITIONS (all must be true):
 *   1. Booking status is 'completed' OR endDate has passed + status is 'active'/'delivered'
 *   2. Payment status is 'paid'
 *   3. Escrow status is 'holding' (not already released/disputed)
 *   4. No open damage claim exists for this booking
 *   5. Grace period has passed (GRACE_HOURS after endDate, default 24h)
 *
 * GRACE PERIOD:
 *   After endDate, we wait ESCROW_GRACE_HOURS (default 24) before releasing.
 *   This gives the owner time to file a damage claim if the item came back damaged.
 *   Set ESCROW_GRACE_HOURS=0 in .env for immediate release after endDate.
 *
 * DAMAGE CLAIM HOLD:
 *   If an open damage claim exists → escrow stays 'holding'.
 *   Admin must manually release/partial-release after resolving the claim.
 *
 * SETUP:
 *   npm install node-cron   (one-time install)
 *   Then in server.js add:  require('./services/escrowCron.service');
 * ─────────────────────────────────────────────────────────────────────────────
 */

const cron = require('node-cron');

const { Booking }    = require('../models/Booking');
const Escrow         = require('../models/Escrow');
const DamageClaim    = require('../models/DamageClaim');
const { Notification } = require('../models/Notification');
const User           = require('../models/User');
const sms            = require('./sms.service');
const { recalculateForOwner } = require('./trustScore.service');
let riderDispatch = null;
try { riderDispatch = require('./riderDispatch.service'); } catch (_) {}

// ── Config ────────────────────────────────────────────────────────────────────
const SERVICE_FEE_RATE = Number(process.env.SERVICE_FEE_RATE || 0.05);   // 5%
const GRACE_HOURS      = Number(process.env.ESCROW_GRACE_HOURS ?? 24);   // 24h grace
const DRY_RUN          = process.env.ESCROW_CRON_DRY_RUN === 'true';     // test mode

// ── Main logic (exported so it can be called manually/tested) ─────────────────
const runEscrowRelease = async () => {
  const label = DRY_RUN ? '[EscrowCron DRY-RUN]' : '[EscrowCron]';
  console.log(`${label} Starting auto-release check — ${new Date().toISOString()}`);

  const graceMs  = GRACE_HOURS * 60 * 60 * 1000;
  const cutoff   = new Date(Date.now() - graceMs);   // endDate must be before this

  try {
    // ── Step 1: Find eligible bookings ───────────────────────────────────────
    // Conditions:
    //   - endDate passed grace period
    //   - payment is paid
    //   - status is active, delivered, or completed (not cancelled/disputed)
    const bookings = await Booking.find({
      endDate:       { $lte: cutoff },
      paymentStatus: { $in: ['paid', 'partial_paid'] },
      status:        { $in: ['active', 'delivered', 'completed'] },
    })
      .populate('owner',   'name email phone fcmToken walletBalance')
      .populate('renter',  'name email phone fcmToken walletBalance')
      .populate('listing', 'title')
      .lean();

    if (bookings.length === 0) {
      console.log(`${label} No eligible bookings found.`);
      return { released: 0, skipped: 0, errors: 0 };
    }

    console.log(`${label} Found ${bookings.length} eligible booking(s) — checking escrows…`);

    let released = 0, skipped = 0, errors = 0;

    for (const booking of bookings) {
      const bId = String(booking._id);

      try {
        // ── Step 1b: Dispatch the return-leg rider (independent of escrow) ──
        // The rental period has ended for every booking in this batch — that's
        // the trigger for collecting the item back, regardless of whether its
        // escrow happens to release in this same pass (e.g. it may already be
        // held by an open damage claim, which only blocks payout, not pickup).
        if (riderDispatch && typeof riderDispatch.autoAssignReturnOnRentalEnd === 'function') {
          riderDispatch.autoAssignReturnOnRentalEnd(bId).catch(() => {});
        }

        // ── Step 2: Check escrow ─────────────────────────────────────────────
        const escrow = await Escrow.findOne({ booking: bId });

        if (!escrow) {
          console.log(`${label} [${bId}] No escrow found — skipping.`);
          skipped++;
          continue;
        }

        if (escrow.status !== 'holding') {
          // Already released / disputed / refunded — skip silently
          skipped++;
          continue;
        }

        // ── Step 3: Open damage claim? → hold ────────────────────────────────
        const openClaim = await DamageClaim.findOne({
          booking: bId,
          status:  { $in: ['pending', 'under_review'] },
        });

        if (openClaim) {
          console.log(`${label} [${bId}] Open damage claim (${openClaim._id}) — holding escrow.`);
          skipped++;
          continue;
        }

        // ── Step 3b: Outstanding remaining balance? → hold ───────────────────
        // Trust-Tiered Payment bookings can have a remainingAmount still owed
        // (cash/wallet at handover). Don't release the owner's payout or the
        // renter's deposit refund while that's unresolved — a renter who
        // never paid the rest, or whose refusal hasn't been settled, isn't
        // a "clean" completion yet. status 'disputed' already routes through
        // the dispute/damage-claim flow once admin resolves it, not this cron.
        const hasOutstandingRemaining = (Number(booking.remainingAmount) || 0) > 0
          && !booking.remainingCollectedAt
          && booking.status !== 'disputed';
        if (hasOutstandingRemaining) {
          console.log(`${label} [${bId}] Remaining balance of Rs ${booking.remainingAmount} not yet collected — holding escrow.`);
          skipped++;
          continue;
        }

        // ── Step 4: Calculate release amounts ─────────────────────────────────
        const rentalAmount  = Number(escrow.rentalAmount)  || 0;
        const depositAmount = Number(escrow.depositAmount) || 0;
        const platformFee   = Math.round(rentalAmount * SERVICE_FEE_RATE);
        const ownerAmount   = Math.max(0, rentalAmount - platformFee);
        const renterRefund  = depositAmount;   // no damage → full deposit back

        console.log(
          `${label} [${bId}] "${booking.listing?.title}" — ` +
          `owner: Rs ${ownerAmount}, renter refund: Rs ${renterRefund}, fee: Rs ${platformFee}`
        );

        if (DRY_RUN) {
          console.log(`${label} [${bId}] DRY RUN — no changes made.`);
          released++;
          continue;
        }

        // ── Step 5: Release escrow ────────────────────────────────────────────
        await Escrow.releaseFunds(bId, {
          ownerAmount,
          renterRefund,
          platformFee,
          damageDeduction: 0,
          notes: `Auto-released by cron after ${GRACE_HOURS}h grace period`,
        });

        // Record the platform's cut as revenue (already deducted from the
        // owner's payout) so cron-released bookings show up in admin totals.
        try {
          const { recordPlatformFee } = require('./platformFee.service');
          await recordPlatformFee(bId, platformFee);
        } catch (e) { console.error('[EscrowCron] fee record failed:', e.message); }

        // Mark booking completed if it wasn't already
        if (booking.status !== 'completed') {
          const renterHadCompletedBefore = await Booking.findOne({
            renter: booking.renter._id || booking.renter, status: 'completed', _id: { $ne: bId },
          }).select('_id').lean();

          await Booking.findByIdAndUpdate(bId, {
            status:      'completed',
            completedAt: new Date(),
          });
          try { await recalculateForOwner(booking.owner._id || booking.owner); } catch (e) { console.error('[escrowCron] trust recalc failed:', e.message); }

          if (!renterHadCompletedBefore) {
            try {
              const { maybeRewardReferrer } = require('./referral.service');
              await maybeRewardReferrer(booking.renter._id || booking.renter, booking.totalAmount, 'renter_first_booking');
            } catch (e) { console.error('[escrowCron] referral reward failed:', e.message); }
          }
        }

        // ── Step 6: Notify both parties ───────────────────────────────────────
        const listingTitle = booking.listing?.title || 'your item';

        // In-app notifications (best-effort)
        await Promise.allSettled([
          Notification.notify(
            booking.owner._id,
            'payment_received',
            'Payment released',
            `Rs ${ownerAmount} for "${listingTitle}" has been credited to your wallet.`,
            { bookingId: bId }
          ),
          Notification.notify(
            booking.renter._id,
            'payment_received',
            'Deposit refunded',
            `Rs ${renterRefund} security deposit has been refunded to your wallet.`,
            { bookingId: bId }
          ),
        ]);

        // SMS to owner (Pakistan context — SMS is more reliable than push)
        if (booking.owner?.phone) {
          sms.smsPaymentReleased(booking.owner, ownerAmount).catch(() => {});
        }

        console.log(`${label} [${bId}] ✅ Released successfully.`);
        released++;

      } catch (err) {
        console.error(`${label} [${bId}] ❌ Error: ${err.message}`);
        errors++;
      }
    }

    console.log(
      `${label} Done — released: ${released}, skipped: ${skipped}, errors: ${errors}`
    );
    return { released, skipped, errors };

  } catch (err) {
    console.error(`${label} Fatal error: ${err.message}`);
    return { released: 0, skipped: 0, errors: 1 };
  }
};

// ── Schedule: every hour at minute 0 (e.g. 1:00, 2:00, 3:00…) ───────────────
// Change '0 * * * *' to '*/30 * * * *' for every 30 minutes, etc.
const CRON_SCHEDULE = process.env.ESCROW_CRON_SCHEDULE || '0 * * * *';

let cronJob = null;

const startCron = () => {
  if (cronJob) return;   // already running

  if (!cron.validate(CRON_SCHEDULE)) {
    console.error(`[EscrowCron] Invalid schedule "${CRON_SCHEDULE}" — cron NOT started.`);
    return;
  }

  cronJob = cron.schedule(CRON_SCHEDULE, runEscrowRelease, {
    scheduled:  true,
    timezone:   process.env.TZ || 'Asia/Karachi',
  });

  console.log(
    `[EscrowCron] ✅ Scheduled — "${CRON_SCHEDULE}" (PKT) | ` +
    `grace: ${GRACE_HOURS}h | dry-run: ${DRY_RUN}`
  );
};

const stopCron = () => {
  if (cronJob) { cronJob.stop(); cronJob = null; }
};

// Auto-start when this file is required
startCron();

module.exports = { runEscrowRelease, startCron, stopCron };
