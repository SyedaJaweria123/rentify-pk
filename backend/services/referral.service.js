'use strict';
/**
 * Referral Service — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Real, fraud-resistant referral rewards:
 *   - A referrer gets a unique shareable code (generated lazily, not at signup).
 *   - A new user can sign up using someone's code — referredBy is set once.
 *   - The referrer is rewarded ONLY when the referred person actually earns
 *     their FIRST real money on the platform:
 *       · rider  → their first released rider_earning transaction
 *       · renter/owner → their first completed booking (rental amount)
 *   - Reward = 10% of that first earning/booking amount, credited to the
 *     referrer's wallet as a 'referral_bonus' transaction.
 *   - A simple "already rewarded" guard (referralRewardEarned tracked per
 *     referral pairing via a transaction lookup) prevents double-paying for
 *     the same referred user — signing up alone never pays anything, so
 *     creating fake accounts gains nothing without a real first transaction.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const REFERRAL_REWARD_RATE = 0.10; // 10% of the referred user's first real earning/booking

/** Generate a short, human-shareable referral code if the user doesn't have one yet. */
async function ensureReferralCode(userId) {
  const User = require('../models/User');
  const user = await User.findById(userId).select('referralCode name');
  if (!user) return null;
  if (user.referralCode) return user.referralCode;

  // RNT + first 3 letters of name (or XXX) + 4 random digits — short, readable,
  // and collision-checked before saving.
  const namePart = (user.name || 'RID').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
  let code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const digits = Math.floor(1000 + Math.random() * 9000);
    code = `RNT${namePart}${digits}`;
    const taken = await User.findOne({ referralCode: code }).select('_id').lean();
    if (!taken) break;
  }
  user.referralCode = code;
  await user.save();
  return code;
}

/** Look up the referrer for a given referral code, used at signup. Returns null if invalid. */
async function findReferrerByCode(code) {
  if (!code) return null;
  const User = require('../models/User');
  return User.findOne({ referralCode: String(code).trim().toUpperCase() }).select('_id name');
}

/**
 * Called once a user's first real earning/booking event happens. Checks
 * whether they were referred and haven't already triggered a reward, and if
 * so credits their referrer 10% of the amount.
 *
 * @param {string} userId - the referred user who just earned/booked
 * @param {number} amount - the real amount their first earning/booking represents
 * @param {'rider_first_earning'|'renter_first_booking'} eventType - for the transaction description only
 */
async function maybeRewardReferrer(userId, amount, eventType) {
  if (!amount || amount <= 0) return null;

  const User = require('../models/User');
  const { Transaction } = require('../models/Transaction');

  const user = await User.findById(userId).select('referredBy name').lean();
  if (!user?.referredBy) return null; // never referred — nothing to do

  // Guard against double-rewarding: if a referral_bonus transaction already
  // exists for this specific referred user, skip. We tag the bonus
  // transaction's description with the referred user's ID for this check
  // rather than adding a new schema field, since this is a one-time check.
  const alreadyRewarded = await Transaction.findOne({
    user: user.referredBy,
    type: 'referral_bonus',
    description: { $regex: String(userId) },
  }).select('_id').lean();
  if (alreadyRewarded) return null;

  const reward = Math.round(amount * REFERRAL_REWARD_RATE);
  if (reward <= 0) return null;

  await Transaction.credit(
    user.referredBy,
    reward,
    'referral_bonus',
    `Referral bonus — ${user.name || 'your referral'} (${userId}) earned their first ${eventType === 'rider_first_earning' ? 'delivery payout' : 'completed booking'}.`,
  );

  return { referrerId: user.referredBy, reward };
}

module.exports = { ensureReferralCode, findReferrerByCode, maybeRewardReferrer, REFERRAL_REWARD_RATE };
