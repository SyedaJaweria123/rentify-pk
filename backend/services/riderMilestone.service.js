'use strict';
/**
 * Rider Milestone Bonus Service — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Rewards riders for hitting completed-order milestones, on top of their
 * normal per-delivery earnings:
 *
 *     15 completed orders  → Rs 250  bonus
 *     25 completed orders  → Rs 750  bonus
 *     50 completed orders  → Rs 1250 bonus
 *
 * "1 completed order" = 1 RiderAssignment (delivery OR return leg) whose
 * payoutStatus has been released — i.e. it's already been paid out by
 * riderPayoutCron.service.js. Delivery and return legs of the SAME booking
 * are always assigned to the same rider (see riderDispatch.service.js), so
 * this can't be inflated by splitting one booking's two legs across riders.
 *
 * Each milestone pays out exactly once per rider — idempotency is checked by
 * looking for an existing 'rider_milestone_bonus' transaction tagged with
 * that milestone number in meta, not by re-deriving it from the count (which
 * would re-pay every time the count is re-checked above a passed milestone).
 *
 * Called from riderPayoutCron.service.js right after a payout is released,
 * since that's the only place a rider's completed-order count changes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const MILESTONES = [
  { count: 15, bonus: 250 },
  { count: 25, bonus: 750 },
  { count: 50, bonus: 1250 },
];

/**
 * Check whether `rider` just crossed a milestone (after a payout release)
 * and credit the bonus exactly once if so. Best-effort: never throws to the
 * caller, since a bonus-check failure must never block the rider's actual
 * delivery payout from going through.
 *
 * Checks milestones lowest-to-highest and pays the first unpaid one found —
 * if a batch of payouts is processed in one cron run and a rider crosses two
 * milestones at once, the next cron pass (or next call) will catch the
 * second one, since the count-based check naturally re-evaluates every time.
 *
 * @param {string} riderId
 * @returns {Promise<{ milestone: number, bonus: number } | null>} the milestone hit, or null
 */
async function checkAndAwardMilestone(riderId) {
  try {
    const RiderAssignment = require('../models/RiderAssignment');
    const { Transaction } = require('../models/Transaction');
    const { Notification } = require('../models/Notification');

    const completedCount = await RiderAssignment.countDocuments({ rider: riderId, payoutStatus: 'released' });

    for (const m of MILESTONES) {
      if (completedCount < m.count) continue;

      const already = await Transaction.findOne({
        user: riderId, type: 'rider_milestone_bonus', 'meta.milestone': m.count,
      }).select('_id').lean();
      if (already) continue;   // this milestone already paid — check the next one

      await Transaction.credit(
        riderId, m.bonus, 'rider_milestone_bonus',
        `Milestone bonus — ${m.count} completed orders`,
        { meta: { milestone: m.count } }
      );

      Notification.notify(
        riderId, 'payment_received', 'Milestone bonus!',
        `You've completed ${m.count} orders — Rs ${m.bonus} bonus credited to your wallet.`,
        { milestone: m.count }
      ).catch(() => {});

      return { milestone: m.count, bonus: m.bonus };
    }

    return null;
  } catch (e) {
    console.error('[riderMilestone] check failed:', e.message);
    return null;
  }
}

module.exports = { checkAndAwardMilestone, MILESTONES };
