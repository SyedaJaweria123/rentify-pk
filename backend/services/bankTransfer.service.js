'use strict';
/**
 * Bank Transfer Service — Rentify PK (manual direct deposit)
 * ─────────────────────────────────────────────────────────────────────────────
 * Renter deposits to the platform bank account and uploads proof; an admin
 * verifies against the bank statement, which then holds escrow + confirms the
 * booking.
 *
 * Env: BANK_ACCOUNT_TITLE, BANK_ACCOUNT_NUMBER, BANK_NAME, BANK_IBAN
 * ─────────────────────────────────────────────────────────────────────────────
 */
const { Transaction } = require('../models/Transaction');
const { Booking } = require('../models/Booking');
const { Notification } = require('../models/Notification');

let email = {};
try { email = require('../utils/email'); } catch (_) { /* email optional */ }
let Escrow = null;
try { Escrow = require('../models/Escrow'); } catch (_) { /* escrow optional */ }
let riderDispatch = null;
try { riderDispatch = require('./riderDispatch.service'); } catch (_) { /* dispatch optional */ }

const EXPIRY_HOURS = Number(process.env.BANK_TRANSFER_EXPIRY_HOURS || 24);

const SUPPORTED_BANKS = [
  'HBL', 'UBL', 'MCB', 'Allied Bank', 'Meezan Bank', 'Bank Alfalah',
  'Faysal Bank', 'Standard Chartered', 'Habib Metro', 'JS Bank',
  'NBP', 'Bank of Punjab', 'Askari Bank', 'Silk Bank', 'Summit Bank',
];

const getSupportedBanks = () => [...SUPPORTED_BANKS];

const bankDetails = () => ({
  accountTitle:  process.env.BANK_ACCOUNT_TITLE  || 'Rentify Pakistan',
  accountNumber: process.env.BANK_ACCOUNT_NUMBER || '',
  bankName:      process.env.BANK_NAME           || '',
  iban:          process.env.BANK_IBAN           || '',
});

// Unique reference: BT-{last6 of bookingId}-{timestamp}
const generateReference = (bookingId) => {
  const last6 = String(bookingId || '').slice(-6) || 'XXXXXX';
  return `BT-${last6}-${Date.now()}`;
};

/**
 * Start a manual bank transfer: create a pending transaction and return the
 * deposit instructions for the renter.
 */
const initiateBankTransfer = async ({ amount, bookingId, renterName, renterPhone, renterId, renterEmail }) => {
  if (!amount || Number(amount) <= 0) throw new Error('A positive amount is required.');
  if (!bookingId) throw new Error('bookingId is required.');

  const reference = generateReference(bookingId);
  const expiresAt = new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000);
  const details = bankDetails();

  const userId = renterId || (await Booking.findById(bookingId))?.renter;

  // Pending transaction — balance stays 0 until verified (no money moved yet)
  await Transaction.create({
    user: userId,
    type: 'booking_payment',
    amount: Number(amount),
    balance: 0,
    status: 'pending',
    description: `Bank transfer pending — ref ${reference}`,
    booking: bookingId,
    meta: { method: 'bank_transfer', reference, expiresAt, renterName, renterPhone, proofImageUrl: null },
  });

  const instructions = [
    `1. Apne bank app/branch se Rs ${amount} transfer karein.`,
    `2. Account Title: ${details.accountTitle}`,
    `3. Account Number: ${details.accountNumber}`,
    `4. Bank: ${details.bankName} | IBAN: ${details.iban}`,
    `5. Transfer ke "remarks/reference" mein yeh likhein: ${reference}`,
    `6. Payment proof (screenshot) upload karein. Admin verify karega (24 ghante ke andar).`,
  ].join('\n');

  // Notify renter (in-app + email best-effort)
  if (userId) {
    Notification.notify(userId, 'system', 'Bank transfer instructions',
      `Reference ${reference}. Rs ${amount} transfer karke proof upload karein.`, { bookingId, reference }).catch(() => {});
  }
  if (renterEmail && typeof email.sendMail === 'function') {
    email.sendMail({
      to: renterEmail,
      subject: `Bank Transfer Instructions — ${reference}`,
      html: `<p>Assalam-o-Alaikum ${renterName || ''},</p><pre>${instructions}</pre>`,
      text: instructions,
    }).catch(() => {});
  }

  return {
    referenceNumber: reference,
    bankName: details.bankName,
    accountTitle: details.accountTitle,
    accountNumber: details.accountNumber,
    iban: details.iban,
    amount: Number(amount),
    instructions,
    expiresAt,
  };
};

/**
 * Admin verifies a transfer after confirming the bank statement.
 * pending → completed, hold escrow, confirm booking, notify both parties.
 */
const verifyBankTransfer = async (referenceNumber, proofImageUrl, adminId) => {
  const tx = await Transaction.findOne({ 'meta.reference': referenceNumber });
  if (!tx) throw new Error('Transfer not found.');
  if (tx.status !== 'pending') throw new Error(`Transfer already ${tx.status}.`);

  tx.status = 'completed';
  tx.processedAt = new Date();
  if (proofImageUrl) tx.meta.proofImageUrl = proofImageUrl;
  tx.meta.verifiedBy = adminId || null;
  tx.markModified('meta');
  await tx.save();

  const booking = await Booking.findById(tx.booking);
  if (booking) {
    booking.paymentStatus = 'paid';
    if (booking.status === 'pending') booking.status = 'confirmed';
    await booking.save();

    // Hold funds in escrow (best-effort; standalone Mongo may skip txns)
    if (Escrow && typeof Escrow.holdFunds === 'function') {
      try {
        await Escrow.holdFunds(booking._id, booking.renter, booking.owner,
          Number(booking.subtotal) || 0, Number(booking.depositAmount) || 0, referenceNumber);
      } catch (e) { console.error('[bankTransfer] escrow hold failed:', e.message); }
    }

    Notification.notify(booking.renter, 'system', 'Payment verified',
      'Aapka bank transfer verify ho gaya. Booking confirmed!', { bookingId: booking._id }).catch(() => {});
    Notification.notify(booking.owner, 'system', 'Booking paid',
      'Renter ne payment kar di (bank transfer). Booking confirmed.', { bookingId: booking._id }).catch(() => {});

    // Auto-dispatch a rider for door delivery (best-effort — never blocks verification)
    if (booking.deliveryMethod === 'delivery'
        && riderDispatch && typeof riderDispatch.autoAssignOnBookingConfirm === 'function') {
      riderDispatch.autoAssignOnBookingConfirm(booking._id).catch((e) => {
        console.warn('[bankTransfer] rider auto-assign failed:', e.message);
      });
    }
  }

  return { reference: referenceNumber, status: 'completed', booking: tx.booking };
};

/**
 * Admin rejects a transfer. pending → failed. Booking stays unpaid.
 */
const rejectBankTransfer = async (referenceNumber, reason, adminId) => {
  const tx = await Transaction.findOne({ 'meta.reference': referenceNumber });
  if (!tx) throw new Error('Transfer not found.');
  if (tx.status !== 'pending') throw new Error(`Transfer already ${tx.status}.`);

  tx.status = 'failed';
  tx.processedAt = new Date();
  tx.meta.rejectionReason = reason || 'Not verified';
  tx.meta.rejectedBy = adminId || null;
  tx.markModified('meta');
  await tx.save();

  Notification.notify(tx.user, 'system', 'Bank transfer rejected',
    `Aapka transfer verify nahi hua: ${reason || 'details match nahi hue'}. Dobara try karein.`,
    { bookingId: tx.booking, reference: referenceNumber }).catch(() => {});

  return { reference: referenceNumber, status: 'failed', reason };
};

/** List all pending transfers for admin review. */
const getPendingBankTransfers = async () => {
  // All manual payments awaiting verification (jazzcash/easypaisa/bank_transfer)
  return Transaction.find({
    type: 'booking_payment',
    status: 'pending',
    'meta.proofImageUrl': { $ne: null },
  })
    .populate('user', 'name email phone')
    .populate('booking', 'totalAmount status')
    .sort({ createdAt: -1 });
};

/** Cron: expire pending transfers older than the expiry window. */
const expireStaleBankTransfers = async () => {
  const cutoff = new Date(Date.now() - EXPIRY_HOURS * 60 * 60 * 1000);
  const stale = await Transaction.find({
    'meta.method': 'bank_transfer', status: 'pending', createdAt: { $lt: cutoff },
  });
  let expired = 0;
  for (const tx of stale) {
    tx.status = 'failed';
    tx.meta.rejectionReason = 'Expired (no payment received within 24h)';
    tx.markModified('meta');
    await tx.save();
    Notification.notify(tx.user, 'system', 'Bank transfer expired',
      'Aapka bank transfer window expire ho gaya. Dobara booking payment karein.', { bookingId: tx.booking }).catch(() => {});
    expired++;
  }
  return { expired };
};

module.exports = {
  getSupportedBanks,
  initiateBankTransfer,
  verifyBankTransfer,
  rejectBankTransfer,
  getPendingBankTransfers,
  expireStaleBankTransfers,
};
