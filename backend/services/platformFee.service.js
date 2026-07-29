'use strict';
/**
 * Platform Fee Service — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for the platform's service fee. The rate is read
 * server-side from Settings (never trusted from the client).
 * ─────────────────────────────────────────────────────────────────────────────
 */
const Settings = require('../models/Settings');
const { Transaction } = require('../models/Transaction');

const DEFAULT_FEE_PERCENT = Number(process.env.SERVICE_FEE_PERCENT || 5);

/**
 * Current fee rate as a fraction (e.g. 0.05 for 5%). Reads Settings, falls back
 * to env/default if Settings is unavailable.
 * @returns {Promise<number>}
 */
const getFeeRate = async () => {
  try {
    const settings = await Settings.getSingleton();
    const percent = Number(settings?.serviceFeePercent);
    if (Number.isFinite(percent) && percent >= 0) return percent / 100;
  } catch (_) { /* fall through to default */ }
  return DEFAULT_FEE_PERCENT / 100;
};

/**
 * Split a subtotal into platform fee + owner earning.
 * @param {number} subtotal  rental amount (server-derived — never client value)
 * @returns {Promise<{ subtotal, platformFee, ownerEarning, feeRate }>}
 */
const calculateFees = async (subtotal) => {
  const amount = Number(subtotal);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Invalid subtotal.');

  const feeRate = await getFeeRate();
  const platformFee = Math.round(amount * feeRate);
  const ownerEarning = Math.max(0, amount - platformFee);

  return { subtotal: amount, platformFee, ownerEarning, feeRate };
};

/**
 * Record the platform's fee as a Transaction (audit trail). The "platform
 * account" is identified by PLATFORM_USER_ID in env; if unset, the record is
 * stored without a user (still queryable by type + booking).
 * @param {string} bookingId
 * @param {number} amount
 * @param {mongoose.ClientSession} [session]
 */
const recordPlatformFee = async (bookingId, amount, session = null) => {
  const fee = Number(amount);
  if (!Number.isFinite(fee) || fee <= 0) return null;

  const doc = {
    // No user: this is platform revenue, not a user's wallet movement.
    // (Transaction.user is nullable for exactly this case.)
    user: process.env.PLATFORM_USER_ID || null,
    type: 'service_fee',
    amount: fee,
    balance: 0,                         // platform account isn't a user wallet
    status: 'completed',
    description: `Platform service fee for booking ${bookingId}`,
    booking: bookingId,
    meta: { platform: true },
  };

  if (session) return (await Transaction.create([doc], { session }))[0];
  return Transaction.create(doc);
};

module.exports = { getFeeRate, calculateFees, recordPlatformFee, DEFAULT_FEE_PERCENT };
