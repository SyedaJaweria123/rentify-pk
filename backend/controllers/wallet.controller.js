'use strict';
const { Transaction } = require('../models/Transaction');
const User = require('../models/User');
const { Notification } = require('../models/Notification');
const email = require('../utils/email'); // withdrawal email trigger

// ── GET /api/wallet/balance ───────────────────────────────────────────────────
const getBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('walletBalance');
    return res.json({ success: true, data: { balance: user.walletBalance } });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch balance.' });
  }
};

// ── GET /api/wallet/transactions ──────────────────────────────────────────────
const getTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit) || 20);
    const skip     = (pageNum - 1) * limitNum;

    const filter = { user: req.user._id };
    if (type) filter.type = type;

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .populate('booking', 'status startDate endDate')
        .populate('listing', 'title')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Transaction.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: {
        transactions,
        pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
      },
    });
  } catch (err) {
    console.error('[getTransactions]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch transactions.' });
  }
};

// ── POST /api/wallet/withdraw ─────────────────────────────────────────────────
const requestWithdrawal = async (req, res) => {
  try {
    const { amount, method, accountNumber } = req.body;

    if (!amount || !method || !accountNumber) {
      return res.status(400).json({ success: false, message: 'amount, method, accountNumber are required.' });
    }

    const withdrawAmount = parseFloat(amount);
    if (isNaN(withdrawAmount) || withdrawAmount < 100) {
      return res.status(400).json({ success: false, message: 'Minimum withdrawal is Rs. 100.' });
    }

    const VALID_METHODS = ['easypaisa', 'jazzcash', 'bank_transfer'];
    if (!VALID_METHODS.includes(method)) {
      return res.status(400).json({ success: false, message: `Invalid method. Use: ${VALID_METHODS.join(', ')}` });
    }

    const user = await User.findById(req.user._id);
    if (user.walletBalance < withdrawAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient balance. Available: Rs. ${user.walletBalance}`,
      });
    }

    // Debit wallet
    const tx = await Transaction.debit(
      req.user._id,
      withdrawAmount,
      'withdrawal',
      `Withdrawal via ${method} to ${accountNumber.slice(-4).padStart(accountNumber.length, '*')}`,
    );

    await tx.updateOne({
      withdrawalMethod: method,
      withdrawalAccount: accountNumber,
      status: 'pending',
    });

    await Notification.notify(
      req.user._id,
      'withdrawal_processed',
      'Withdrawal Requested',
      `Your withdrawal of Rs. ${withdrawAmount} via ${method} is being processed. Expected 1-3 business days.`,
      {}
    );

    // Email the owner that withdrawal is initiated (non-blocking)
    try {
      if (user.email) {
        await email.sendWithdrawalProcessedEmail({
          to: user.email,
          ownerName: user.name,
          amount: withdrawAmount,
          method,
        });
      }
    } catch (e) { console.warn('[email withdrawalProcessed]', e.message); }

    return res.json({
      success: true,
      message: `Withdrawal of Rs. ${withdrawAmount} requested successfully. Processing in 1-3 business days.`,
      data: { transaction: tx },
    });
  } catch (err) {
    console.error('[requestWithdrawal]', err.message);
    if (err.message.includes('Insufficient')) {
      return res.status(400).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: 'Failed to process withdrawal.' });
  }
};

// ── GET /api/wallet/summary ───────────────────────────────────────────────────
const getWalletSummary = async (req, res) => {
  try {
    const userId = req.user._id;
    const [user, txStats, refundStats, pendingWithdrawals, recent] = await Promise.all([
      User.findById(userId).select('walletBalance'),
      Transaction.aggregate([
        { $match: { user: userId, status: { $in: ['completed', 'pending'] } } },
        {
          $group: {
            _id: null,
            totalEarned:    { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } },
            totalWithdrawn: { $sum: { $cond: [{ $and: [{ $lt: ['$amount', 0] }, { $eq: ['$type', 'withdrawal'] }] }, { $abs: '$amount' }, 0] } },
            txCount:        { $sum: 1 },
          },
        },
      ]),
      Transaction.aggregate([
        { $match: { user: userId, type: 'refund' } },
        { $group: { _id: null, totalRefunded: { $sum: { $abs: '$amount' } } } },
      ]),
      Transaction.aggregate([
        { $match: { user: userId, type: 'withdrawal', status: 'pending' } },
        { $group: { _id: null, amount: { $sum: { $abs: '$amount' } }, count: { $sum: 1 } } },
      ]),
      Transaction.find({ user: userId }).sort({ createdAt: -1 }).limit(5)
        .select('type amount balance status description createdAt meta'),
    ]);

    const stats = txStats[0] || { totalEarned: 0, totalWithdrawn: 0, txCount: 0 };
    const refunded = refundStats[0]?.totalRefunded || 0;
    const pending = pendingWithdrawals[0] || { amount: 0, count: 0 };

    return res.json({
      success: true,
      data: {
        balance:            user.walletBalance,
        totalEarned:        stats.totalEarned,
        totalWithdrawn:     stats.totalWithdrawn,
        totalRefunded:      refunded,
        pendingWithdrawals: { amount: pending.amount, count: pending.count },
        txCount:            stats.txCount,
        recentTransactions: recent,
      },
    });
  } catch (err) {
    console.error('[getWalletSummary]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch wallet summary.' });
  }
};

module.exports = { getBalance, getTransactions, requestWithdrawal, getWalletSummary };
