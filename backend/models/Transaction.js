'use strict';
const mongoose = require('mongoose');

const TX_TYPES = [
  'booking_payment',    // renter pays
  'booking_earning',    // owner receives
  'rider_earning',      // rider receives delivery/return fee share
  'service_fee',        // platform deducts
  'deposit_hold',       // security deposit frozen
  'deposit_release',    // deposit returned
  'refund',             // cancellation refund
  'withdrawal',         // owner withdraws to bank
  'platform_withdrawal',// platform withdraws its own commission balance
  'withdrawal_failed',  // failed withdrawal re-credit
  'referral_bonus',     // credited to a referrer when their referral completes their first earning
  'rider_milestone_bonus', // credited to a rider for hitting a completed-orders milestone
  'adjustment',         // admin manual adjustment
];

const TX_STATUS = ['pending', 'completed', 'failed', 'reversed'];

const transactionSchema = new mongoose.Schema({
  // Optional because platform-owned rows (type: 'service_fee') belong to the
  // business, not to any user wallet. Every user-facing type still sets it.
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  type:      { type: String, enum: TX_TYPES, required: true },
  amount:    { type: Number, required: true },           // positive = credit, negative = debit
  balance:   { type: Number, required: true },           // wallet balance AFTER this tx
  status:    { type: String, enum: TX_STATUS, default: 'completed' },

  description: { type: String, trim: true, maxlength: 300, required: true },

  // References
  booking:   { type: mongoose.Schema.Types.ObjectId, ref: 'Booking',  default: null },
  listing:   { type: mongoose.Schema.Types.ObjectId, ref: 'Listing',  default: null },
  relatedTx: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },

  // Withdrawal info
  withdrawalMethod:  { type: String, default: null },    // easypaisa, jazzcash, bank
  withdrawalAccount: { type: String, default: null },    // masked account
  processedAt:       { type: Date, default: null },

  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ booking: 1 });
transactionSchema.index({ status: 1, type: 1 });

// ── Static: credit user wallet ────────────────────────────────────────────────
transactionSchema.statics.credit = async function (userId, amount, type, description, refs = {}) {
  const User = mongoose.model('User');
  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { walletBalance: amount } },
    { new: true }
  );
  return this.create({
    user:      userId,
    type,
    amount:    +amount,
    balance:   user.walletBalance,
    status:    'completed',
    description,
    ...refs,
  });
};

// ── Static: debit user wallet (throws if insufficient) ───────────────────────
transactionSchema.statics.debit = async function (userId, amount, type, description, refs = {}) {
  const User = mongoose.model('User');
  const user = await User.findById(userId);
  if (!user || user.walletBalance < amount) {
    throw new Error(`Insufficient wallet balance. Available: Rs. ${user?.walletBalance || 0}`);
  }
  await User.findByIdAndUpdate(userId, { $inc: { walletBalance: -amount } });
  return this.create({
    user:      userId,
    type,
    amount:    -amount,
    balance:   user.walletBalance - amount,
    status:    'completed',
    description,
    ...refs,
  });
};

module.exports = {
  Transaction: mongoose.model('Transaction', transactionSchema),
  TX_TYPES,
  TX_STATUS,
};
