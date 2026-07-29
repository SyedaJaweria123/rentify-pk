'use strict';
/**
 * Rider Payout Auto-Release Cron Job — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs every hour. Finds rider assignments that were delivered/completed more
 * than RIDER_PAYOUT_GRACE_HOURS ago and releases their delivery-fee-share
 * payout into the rider's wallet — without admin having to do it manually.
 *
 * This is deliberately INDEPENDENT of damage claims (DamageClaim is about the
 * item's condition; the rider didn't make the item, they only delivered or
 * collected it). A damage claim on the booking never blocks a rider's payout.
 *
 * RELEASE CONDITIONS (all must be true):
 *   1. Assignment status is 'delivered' or 'completed'
 *   2. payoutStatus is 'pending' (not already released/held/refused)
 *   3. Grace period has passed (RIDER_PAYOUT_GRACE_HOURS after deliveredAt,
 *      default 24h)
 *   4. There is real evidence the handover happened — either a QR scan
 *      (qrScannedAt set) or at least one photo (deliveryEvidence non-empty).
 *      This protects against a rider fraudulently marking "delivered"
 *      without proof, completely separate from item-condition disputes.
 *   5. The booking itself was not disputed by the renter as "never arrived"
 *      (booking.disputeRaisedBy set) — that's a question of whether delivery
 *      happened at all, which is different from whether the item was damaged.
 *
 * After each release, also checks (via riderMilestone.service.js) whether
 * the rider has just crossed a completed-orders milestone (15/25/50) and
 * credits a one-time bonus if so.
 *
 * SETUP:
 *   In server.js add:  require('./services/riderPayoutCron.service');
 * ─────────────────────────────────────────────────────────────────────────────
 */

const cron = require('node-cron');

const RiderAssignment = require('../models/RiderAssignment');
const { Booking } = require('../models/Booking');
const { Transaction } = require('../models/Transaction');
const { Notification } = require('../models/Notification');

// ── Config ────────────────────────────────────────────────────────────────────
const GRACE_HOURS = Number(process.env.RIDER_PAYOUT_GRACE_HOURS ?? 24);
const DRY_RUN      = process.env.RIDER_PAYOUT_CRON_DRY_RUN === 'true';

// ── Main logic (exported so it can be called manually/tested) ─────────────────
const runRiderPayoutRelease = async () => {
  const label = DRY_RUN ? '[RiderPayoutCron DRY-RUN]' : '[RiderPayoutCron]';
  console.log(`${label} Starting auto-release check — ${new Date().toISOString()}`);

  const graceMs = GRACE_HOURS * 60 * 60 * 1000;
  const cutoff  = new Date(Date.now() - graceMs);   // deliveredAt must be before this

  try {
    const assignments = await RiderAssignment.find({
      status:       { $in: ['delivered', 'completed'] },
      payoutStatus: 'pending',
      deliveredAt:  { $lte: cutoff, $ne: null },
    }).populate('rider', 'name phone walletBalance').lean();

    if (assignments.length === 0) {
      console.log(`${label} No eligible assignments found.`);
      return { released: 0, held: 0, errors: 0 };
    }

    console.log(`${label} Found ${assignments.length} eligible assignment(s) — checking evidence…`);

    let released = 0, held = 0, errors = 0;

    for (const a of assignments) {
      const aId = String(a._id);

      try {
        // ── Evidence guard — independent of damage claims ─────────────────────
        const hasEvidence = !!a.qrScannedAt || (Array.isArray(a.deliveryEvidence) && a.deliveryEvidence.length > 0);
        if (!hasEvidence) {
          await RiderAssignment.findByIdAndUpdate(aId, {
            payoutStatus: 'held',
            payoutHoldReason: 'No QR scan or delivery photo evidence on file.',
          });
          console.log(`${label} [${aId}] No handover evidence — held for admin review.`);
          held++;
          continue;
        }

        // ── "Never arrived" dispute guard — separate from damage claims ───────
        const booking = await Booking.findById(a.booking).select('disputeRaisedBy status').lean();
        if (booking?.disputeRaisedBy) {
          await RiderAssignment.findByIdAndUpdate(aId, {
            payoutStatus: 'held',
            payoutHoldReason: 'Booking is under dispute.',
          });
          console.log(`${label} [${aId}] Booking under dispute — held.`);
          held++;
          continue;
        }

        const amount = Number(a.earnings) || 0;
        console.log(`${label} [${aId}] (${a.feeShare}) — rider: Rs ${amount}`);

        if (DRY_RUN) {
          console.log(`${label} [${aId}] DRY RUN — no changes made.`);
          released++;
          continue;
        }

        if (amount > 0 && a.rider?._id) {
          // Check BEFORE crediting whether this rider has any prior earning —
          // determines whether this specific payout is their "first ever"
          // for the referral trigger below.
          const hadEarningBefore = await Transaction.findOne({
            user: a.rider._id, type: 'rider_earning', status: 'completed',
          }).select('_id').lean();

          await Transaction.credit(
            a.rider._id,
            amount,
            'rider_earning',
            `Rider ${a.feeShare === 'return_half' ? 'return' : 'delivery'} fee — assignment #${aId}`,
            { booking: a.booking }
          );

          if (!hadEarningBefore) {
            try {
              const { maybeRewardReferrer } = require('./referral.service');
              await maybeRewardReferrer(a.rider._id, amount, 'rider_first_earning');
            } catch (e) { console.error('[riderPayoutCron] referral reward failed:', e.message); }
          }
        }

        // Mark this assignment released BEFORE the milestone check — the
        // check counts released assignments, and this one must already be
        // reflected in that count (otherwise every rider's milestone would
        // be hit one assignment late).
        await RiderAssignment.findByIdAndUpdate(aId, {
          payoutStatus: 'released',
          payoutReleasedAt: new Date(),
        });

        if (a.rider?._id) {
          try {
            const { checkAndAwardMilestone } = require('./riderMilestone.service');
            const hit = await checkAndAwardMilestone(a.rider._id);
            if (hit) console.log(`${label} [${aId}] 🎉 Rider hit ${hit.milestone}-order milestone — Rs ${hit.bonus} bonus awarded.`);
          } catch (e) { console.error('[riderPayoutCron] milestone check failed:', e.message); }
        }

        Notification.notify(
          a.rider._id, 'payment_received', 'Payment released',
          amount > 0 ? `Rs ${amount} has been credited to your wallet.` : 'Delivery payout processed.',
          { assignmentId: aId, bookingId: a.booking }
        ).catch(() => {});

        console.log(`${label} [${aId}] ✅ Released successfully.`);
        released++;

      } catch (err) {
        console.error(`${label} [${aId}] ❌ Error: ${err.message}`);
        errors++;
      }
    }

    console.log(`${label} Done — released: ${released}, held: ${held}, errors: ${errors}`);
    return { released, held, errors };

  } catch (err) {
    console.error(`${label} Fatal error: ${err.message}`);
    return { released: 0, held: 0, errors: 1 };
  }
};

// ── Schedule: every hour at minute 5 (offset from escrowCron's minute 0) ────
const CRON_SCHEDULE = process.env.RIDER_PAYOUT_CRON_SCHEDULE || '5 * * * *';

let cronJob = null;

const startCron = () => {
  if (cronJob) return;

  if (!cron.validate(CRON_SCHEDULE)) {
    console.error(`[RiderPayoutCron] Invalid schedule "${CRON_SCHEDULE}" — cron NOT started.`);
    return;
  }

  cronJob = cron.schedule(CRON_SCHEDULE, runRiderPayoutRelease, {
    scheduled: true,
    timezone:  process.env.TZ || 'Asia/Karachi',
  });

  console.log(
    `[RiderPayoutCron] ✅ Scheduled — "${CRON_SCHEDULE}" (PKT) | ` +
    `grace: ${GRACE_HOURS}h | dry-run: ${DRY_RUN}`
  );
};

const stopCron = () => {
  if (cronJob) { cronJob.stop(); cronJob = null; }
};

// Auto-start when this file is required
startCron();

module.exports = { runRiderPayoutRelease, startCron, stopCron };
