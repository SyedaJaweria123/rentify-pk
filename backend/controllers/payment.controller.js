'use strict';
/**
 * Payment Controller — Rentify PK
 * Unifies JazzCash, Easypaisa, Stripe and manual Bank Transfer over booking +
 * escrow. Gateways post back to public callback/webhook routes; bank transfers
 * are verified by an admin.
 */
const { Booking } = require('../models/Booking');
const { Transaction } = require('../models/Transaction');
const { Notification } = require('../models/Notification');
const { emitToUser, getIO } = require('../utils/socket');
const { uploadBuffer } = require('../config/cloudinary');

let Escrow = null;
try { Escrow = require('../models/Escrow'); } catch (_) {}

const jazzcash    = require('../services/jazzcash.service');
const easypaisa   = require('../services/easypaisa.service');
const stripeSvc   = require('../services/stripe.service');
const bankSvc     = require('../services/bankTransfer.service');
let riderDispatch = null;
try { riderDispatch = require('../services/riderDispatch.service'); } catch (_) {}

const FRONTEND = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'http://localhost:4200';
const eq = (a, b) => String(a) === String(b);

// ── Shared: mark a booking paid + hold escrow + notify ────────────────────────
async function settleBookingPaid(booking, reference) {
  // Trust-Tiered Payment: the renter may only have paid the advance amount,
  // not the full subtotal. Mark paymentStatus accordingly so the UI and the
  // rider's "collect remaining" flow know whether anything is still owed.
  const advanceAmount = Number(booking.advanceAmount) || Number(booking.totalAmount) || 0;
  const fullyPaid = advanceAmount >= Number(booking.totalAmount);
  booking.paymentStatus = fullyPaid ? 'paid' : 'partial_paid';
  if (booking.status === 'pending') booking.status = 'confirmed';
  await booking.save();

  if (Escrow && typeof Escrow.holdFunds === 'function') {
    try {
      // advanceAmount already includes the deposit (set in createBooking) —
      // subtract it back out so Escrow.holdFunds gets a clean
      // (rentalPortion, depositAmount) split rather than double-counting it.
      const depositAmount = Number(booking.depositAmount) || 0;
      const rentalPortion = Math.max(0, advanceAmount - depositAmount);
      await Escrow.holdFunds(booking._id, booking.renter, booking.owner,
        rentalPortion, depositAmount, reference);
    } catch (e) { console.error('[payment] escrow hold failed:', e.message); }
  }

  emitToUser(String(booking.renter), 'booking:confirmed', { bookingId: booking._id });
  emitToUser(String(booking.owner), 'booking:confirmed', { bookingId: booking._id });
  Notification.notify(booking.renter, 'booking_confirmed', 'Payment successful',
    fullyPaid
      ? 'Your payment was received and the booking is confirmed.'
      : `Your advance of Rs ${advanceAmount} was received. Rs ${booking.remainingAmount || 0} is due on delivery.`,
    { bookingId: booking._id }).catch(() => {});
  Notification.notify(booking.owner, 'booking_confirmed', 'Booking confirmed',
    'A booking has been paid and confirmed.', { bookingId: booking._id }).catch(() => {});

  // Auto-dispatch a delivery rider (best-effort — never blocks payment settlement)
  // Only for door delivery; self-pickup needs no rider.
  if (booking.deliveryMethod === 'delivery'
      && riderDispatch && typeof riderDispatch.autoAssignOnBookingConfirm === 'function') {
    riderDispatch.autoAssignOnBookingConfirm(booking._id).catch(() => {});
  }
}

// ── Manual proof mode: create a pending tx + return pay-to details + reference ─
// Used when a gateway has no API keys (user pays to our number/account, then
// uploads a slip which an admin verifies).
async function manualProofMode(req, booking, amount, method) {
  const last6 = String(booking._id).slice(-6).toUpperCase();
  const prefix = method === 'jazzcash' ? 'JC' : method === 'easypaisa' ? 'EP' : 'BT';
  const reference = `${prefix}-${last6}-${Date.now().toString().slice(-6)}`;

  await Transaction.create({
    user: req.user._id, type: 'booking_payment', amount, balance: 0, status: 'pending',
    description: `${method} manual payment — ${reference}`, booking: booking._id,
    meta: { method, reference, manual: true, proofImageUrl: null },
  });

  // Pay-to details from env (the platform's receiving accounts)
  const payTo = {
    jazzcash:  { label: 'JazzCash Number', value: process.env.JAZZCASH_RECEIVE_NUMBER || process.env.PLATFORM_PHONE || '' },
    easypaisa: { label: 'Easypaisa Number', value: process.env.EASYPAISA_RECEIVE_NUMBER || process.env.PLATFORM_PHONE || '' },
    bank_transfer: {
      label: 'Bank Account',
      accountTitle:  process.env.BANK_ACCOUNT_TITLE  || 'Rentify Pakistan',
      accountNumber: process.env.BANK_ACCOUNT_NUMBER || '',
      bankName:      process.env.BANK_NAME           || '',
      iban:          process.env.BANK_IBAN           || '',
    },
  };

  return {
    success: true,
    gateway: method,
    manual: true,
    data: {
      referenceNumber: reference,
      amount,
      method,
      payTo: payTo[method],
      instructions: `Send Rs ${amount} to the ${method} account above, write reference "${reference}" in the note, then upload your payment slip.`,
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// INITIATE
// ══════════════════════════════════════════════════════════════════════════════
exports.initiatePayment = async (req, res) => {
  try {
    const { bookingId, gateway } = req.body;
    const valid = ['jazzcash', 'easypaisa', 'stripe', 'bank_transfer', 'cash_on_delivery'];
    if (!valid.includes(gateway)) {
      return res.status(422).json({ success: false, message: `gateway must be one of: ${valid.join(', ')}` });
    }
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
    if (!eq(booking.renter, req.user._id)) {
      return res.status(403).json({ success: false, message: 'This is not your booking.' });
    }
    if (!['pending', 'confirmed'].includes(booking.status)) {
      return res.status(409).json({ success: false, message: `Cannot pay for a '${booking.status}' booking.` });
    }
    if (booking.paymentStatus === 'paid') {
      return res.status(409).json({ success: false, message: 'Booking is already paid.' });
    }

    const amount = Number(booking.advanceAmount ?? booking.totalAmount);

    // Idempotency: if a pending payment already exists for this booking…
    const existingPending = await Transaction.findOne({
      booking: booking._id, type: 'booking_payment', status: 'pending',
    });
    if (existingPending) {
      const existingMethod = existingPending.meta?.method;
      // Same method chosen again → return its full pay-to details + reference
      if (existingMethod === gateway) {
        const ref = existingPending.meta?.reference;
        const payTo = {
          jazzcash:  { label: 'JazzCash Number',  value: process.env.JAZZCASH_RECEIVE_NUMBER || process.env.PLATFORM_PHONE || '' },
          easypaisa: { label: 'Easypaisa Number', value: process.env.EASYPAISA_RECEIVE_NUMBER || process.env.PLATFORM_PHONE || '' },
          bank_transfer: {
            label: 'Bank Account',
            accountTitle:  process.env.BANK_ACCOUNT_TITLE  || 'Rentify Pakistan',
            accountNumber: process.env.BANK_ACCOUNT_NUMBER || '',
            bankName:      process.env.BANK_NAME           || '',
            iban:          process.env.BANK_IBAN           || '',
          },
        };
        return res.status(200).json({
          success: true, gateway, manual: true, reused: true,
          data: {
            referenceNumber: ref,
            amount: existingPending.amount,
            method: gateway,
            payTo: payTo[gateway],
            instructions: `Send Rs ${existingPending.amount} to the account above, write reference "${ref}" in the note, then upload your payment slip.`,
          },
        });
      }
      // Different method → cancel the old pending and let a fresh one be created
      existingPending.status = 'failed';
      existingPending.meta = { ...(existingPending.meta || {}), cancelledReason: 'switched_method' };
      existingPending.markModified('meta');
      await existingPending.save();
    }

    // ── JazzCash ──
    if (gateway === 'jazzcash') {
      // If gateway keys are configured, use the live redirect flow.
      if (jazzcash.isConfigured && jazzcash.isConfigured()) {
        const pay = jazzcash.initiatePayment({
          amount, bookingId: String(booking._id),
          customerPhone: req.user.phone, customerEmail: req.user.email, customerName: req.user.name,
        });
        await Transaction.create({
          user: req.user._id, type: 'booking_payment', amount, balance: 0, status: 'pending',
          description: `JazzCash payment — ${pay.txnRefNo}`, booking: booking._id,
          meta: { method: 'jazzcash', reference: pay.txnRefNo },
        });
        return res.json({ success: true, gateway, data: { redirectUrl: pay.redirectUrl, fields: pay.fields, txnRefNo: pay.txnRefNo } });
      }
      // No keys → manual proof mode (user pays to our JazzCash number, uploads slip)
      return res.json(await manualProofMode(req, booking, amount, 'jazzcash'));
    }

    // ── Easypaisa ──
    if (gateway === 'easypaisa') {
      if (easypaisa.isConfigured && easypaisa.isConfigured()) {
        const pay = easypaisa.initiatePayment({
          amount, bookingId: String(booking._id), customerPhone: req.user.phone,
          paymentMethod: req.body.paymentMethod || 'MA',
        });
        await Transaction.create({
          user: req.user._id, type: 'booking_payment', amount, balance: 0, status: 'pending',
          description: `Easypaisa payment — ${pay.orderId}`, booking: booking._id,
          meta: { method: 'easypaisa', reference: pay.orderId },
        });
        return res.json({ success: true, gateway, data: { paymentUrl: pay.paymentUrl, fields: pay.fields, orderId: pay.orderId } });
      }
      return res.json(await manualProofMode(req, booking, amount, 'easypaisa'));
    }

    // ── Stripe ──
    if (gateway === 'stripe') {
      const intent = await stripeSvc.createPaymentIntent({
        amount, currency: 'pkr', bookingId: String(booking._id),
        metadata: { renterId: String(req.user._id) },
      });
      await Transaction.create({
        user: req.user._id, type: 'booking_payment', amount, balance: 0, status: 'pending',
        description: `Stripe payment — ${intent.id}`, booking: booking._id,
        meta: { method: 'stripe', reference: intent.id },
      });
      return res.json({ success: true, gateway, data: { clientSecret: intent.clientSecret, paymentIntentId: intent.id } });
    }

    // ── Cash on Delivery ──
    // No gateway redirect, no proof upload — the rider collects this amount
    // at handover and confirms it via collectRemaining(). The booking is
    // marked confirmed immediately; settleBookingPaid() still runs so escrow,
    // notifications, and rider dispatch all behave exactly as a paid booking.
    if (gateway === 'cash_on_delivery') {
      const reference = `COD-${String(booking._id).slice(-6).toUpperCase()}-${Date.now().toString().slice(-6)}`;
      await Transaction.create({
        user: req.user._id, type: 'booking_payment', amount, balance: 0, status: 'completed',
        description: `Cash on delivery — ${reference}`, booking: booking._id,
        meta: { method: 'cash_on_delivery', reference, cod: true },
      });
      await settleBookingPaid(booking, reference);
      return res.json({
        success: true, gateway, cod: true,
        data: { referenceNumber: reference, amount, method: 'cash_on_delivery' },
      });
    }

    // ── Bank Transfer ──
    const transfer = await bankSvc.initiateBankTransfer({
      amount, bookingId: String(booking._id),
      renterName: req.user.name, renterPhone: req.user.phone,
      renterId: req.user._id, renterEmail: req.user.email,
    });
    return res.json({ success: true, gateway, data: transfer });
  } catch (err) {
    console.error('[payment.initiatePayment]', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to initiate payment.' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// CALLBACKS (public — no auth)
// ══════════════════════════════════════════════════════════════════════════════
exports.jazzCashCallback = async (req, res) => {
  try {
    const result = jazzcash.verifyCallback(req.body);
    const tx = await Transaction.findOne({ 'meta.reference': result.txnRefNo });
    if (!tx) return res.redirect(`${FRONTEND}/payment/failed?reason=unknown_txn`);

    if (result.valid && result.success) {
      tx.status = 'completed'; tx.processedAt = new Date(); tx.markModified('meta'); await tx.save();
      const booking = await Booking.findById(tx.booking);
      if (booking) await settleBookingPaid(booking, result.txnRefNo);
      return res.redirect(`${FRONTEND}/payment/success?booking=${tx.booking}`);
    }
    tx.status = 'failed'; await tx.save();
    return res.redirect(`${FRONTEND}/payment/failed?reason=${result.responseCode || 'declined'}`);
  } catch (err) {
    console.error('[payment.jazzCashCallback]', err.message);
    return res.redirect(`${FRONTEND}/payment/failed?reason=error`);
  }
};

exports.easypaisaCallback = async (req, res) => {
  try {
    const result = easypaisa.handleCallback(req.body);
    const tx = await Transaction.findOne({ 'meta.reference': result.orderId });
    if (!tx) return res.redirect(`${FRONTEND}/payment/failed?reason=unknown_txn`);

    if (result.valid && result.success) {
      tx.status = 'completed'; tx.processedAt = new Date(); tx.markModified('meta'); await tx.save();
      const booking = await Booking.findById(tx.booking);
      if (booking) await settleBookingPaid(booking, result.orderId);
      return res.redirect(`${FRONTEND}/payment/success?booking=${tx.booking}`);
    }
    tx.status = 'failed'; await tx.save();
    return res.redirect(`${FRONTEND}/payment/failed?reason=${result.responseCode || 'declined'}`);
  } catch (err) {
    console.error('[payment.easypaisaCallback]', err.message);
    return res.redirect(`${FRONTEND}/payment/failed?reason=error`);
  }
};

// ── Stripe webhook (raw body, no auth) ────────────────────────────────────────
exports.stripeWebhook = async (req, res) => {
  let event;
  try {
    event = stripeSvc.constructWebhookEvent(req.body, req.headers['stripe-signature']);
  } catch (err) {
    console.error('[payment.stripeWebhook] signature:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  try {
    const r = stripeSvc.handleWebhookEvent(event);
    if (!r.handled) return res.json({ received: true });

    if (r.status === 'succeeded') {
      const tx = await Transaction.findOne({ 'meta.reference': r.paymentIntentId });
      if (tx && tx.status !== 'completed') { tx.status = 'completed'; tx.processedAt = new Date(); await tx.save(); }
      const booking = await Booking.findById(r.bookingId || tx?.booking);
      if (booking) await settleBookingPaid(booking, r.paymentIntentId);
    } else if (r.status === 'failed') {
      const tx = await Transaction.findOne({ 'meta.reference': r.paymentIntentId });
      if (tx) { tx.status = 'failed'; await tx.save(); }
    } else if (r.status === 'refunded') {
      const tx = await Transaction.findOne({ 'meta.reference': r.paymentIntentId });
      if (tx) { tx.status = 'reversed'; tx.markModified('meta'); await tx.save(); }
    }
    return res.json({ received: true });
  } catch (err) {
    console.error('[payment.stripeWebhook] handler:', err.message);
    return res.status(500).json({ received: false });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// BANK TRANSFER
// ══════════════════════════════════════════════════════════════════════════════
exports.submitBankTransferProof = async (req, res) => {
  try {
    const { referenceNumber } = req.body;
    const tx = await Transaction.findOne({ 'meta.reference': referenceNumber, status: 'pending' });
    if (!tx) return res.status(404).json({ success: false, message: 'Pending payment not found.' });
    if (!eq(tx.user, req.user._id)) return res.status(403).json({ success: false, message: 'Not your payment.' });

    let proofImageUrl = req.body.proofImageUrl || null;
    if (req.file?.buffer) {
      const up = await uploadBuffer(req.file.buffer, { folder: 'rentify/payment-proofs' });
      proofImageUrl = up.secure_url;
    }
    if (!proofImageUrl) return res.status(422).json({ success: false, message: 'Proof image is required.' });

    tx.meta.proofImageUrl = proofImageUrl;
    tx.meta.proofSubmittedAt = new Date();
    tx.markModified('meta');
    await tx.save();

    const method = tx.meta?.method || 'payment';

    // Notify admins (verify) + owner (awareness)
    Notification.notifyAdmins('system', 'Payment proof submitted',
      `A ${method} payment proof was uploaded (ref ${referenceNumber}).`,
      { reference: referenceNumber, bookingId: tx.booking }).catch(() => {});

    const booking = await Booking.findById(tx.booking);
    if (booking) {
      Notification.notify(booking.owner, 'system', 'Payment submitted',
        `The renter submitted a ${method} payment proof. Awaiting admin verification.`,
        { bookingId: tx.booking }).catch(() => {});
      emitToUser(String(booking.owner), 'payment:proof_submitted', { bookingId: tx.booking, reference: referenceNumber });
    }

    const io = getIO?.();
    if (io) io.emit('admin:payment_proof', { reference: referenceNumber, bookingId: tx.booking, method });

    return res.json({ success: true, message: 'Proof submitted. Awaiting admin verification.', data: { proofImageUrl } });
  } catch (err) {
    console.error('[payment.submitBankTransferProof]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to submit proof.' });
  }
};

exports.verifyBankTransfer = async (req, res) => {
  try {
    const referenceNumber = req.params.ref || req.body.referenceNumber;
    const { proofImageUrl } = req.body;
    const result = await bankSvc.verifyBankTransfer(referenceNumber, proofImageUrl, req.user._id);
    return res.json({ success: true, message: 'Bank transfer verified.', data: result });
  } catch (err) {
    console.error('[payment.verifyBankTransfer]', err.message);
    return res.status(400).json({ success: false, message: err.message || 'Verification failed.' });
  }
};

exports.rejectBankTransfer = async (req, res) => {
  try {
    const referenceNumber = req.params.ref || req.body.referenceNumber;
    const { reason } = req.body;
    const result = await bankSvc.rejectBankTransfer(referenceNumber, reason, req.user._id);
    return res.json({ success: true, message: 'Bank transfer rejected.', data: result });
  } catch (err) {
    console.error('[payment.rejectBankTransfer]', err.message);
    return res.status(400).json({ success: false, message: err.message || 'Rejection failed.' });
  }
};

// Static list — no DB call needed
exports.getSupportedBanks = (req, res) => {
  return res.json({ success: true, data: bankSvc.getSupportedBanks() });
};

exports.getPendingBankTransfers = async (req, res) => {
  try {
    const list = await bankSvc.getPendingBankTransfers();
    return res.json({ success: true, data: list });
  } catch (err) {
    console.error('[payment.getPendingBankTransfers]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch transfers.' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// STATUS + REFUND
// ══════════════════════════════════════════════════════════════════════════════
exports.getPaymentStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    const isParty = eq(booking.renter, req.user._id) || eq(booking.owner, req.user._id);
    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    if (!isParty && !isAdmin) return res.status(403).json({ success: false, message: 'Not authorized.' });

    const tx = await Transaction.findOne({ booking: bookingId, type: 'booking_payment' }).sort({ createdAt: -1 });
    return res.json({
      success: true,
      data: {
        bookingId, paymentStatus: booking.paymentStatus, bookingStatus: booking.status,
        advancePercent:  booking.advancePercent,
        advanceAmount:   booking.advanceAmount,
        remainingAmount: booking.remainingAmount,
        remainingPaymentMethod: booking.remainingPaymentMethod,
        remainingCollectedAt:   booking.remainingCollectedAt,
        transaction: tx ? {
          status: tx.status,
          method: tx.meta?.method,
          reference: tx.meta?.reference,
          amount: tx.amount,
          proofImageUrl: tx.meta?.proofImageUrl || null,
          proofSubmittedAt: tx.meta?.proofSubmittedAt || null,
        } : null,
      },
    });
  } catch (err) {
    console.error('[payment.getPaymentStatus]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch status.' });
  }
};

exports.requestRefund = async (req, res) => {
  try {
    const { bookingId, amount, reason } = req.body;
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    if (!isAdmin && booking.status !== 'cancelled') {
      return res.status(403).json({ success: false, message: 'Refunds are for cancelled bookings or admin action.' });
    }

    const tx = await Transaction.findOne({ booking: bookingId, type: 'booking_payment', status: 'completed' }).sort({ createdAt: -1 });
    if (!tx) return res.status(404).json({ success: false, message: 'No completed payment to refund.' });

    const method = tx.meta?.method;
    const refundAmount = Number(amount) || tx.amount;

    if (method === 'stripe') {
      // Automated refund via Stripe
      const refund = await stripeSvc.createRefund(tx.meta.reference, refundAmount, 'pkr');
      tx.meta.refundId = refund.id; tx.markModified('meta');
    } else {
      // Manual gateways: record intent; admin pays out off-system then it's marked refunded
      tx.meta.refundPending = true; tx.meta.refundReason = reason || ''; tx.markModified('meta');
    }
    await tx.save();

    // Record a refund transaction + update booking/escrow
    await Transaction.create({
      user: booking.renter, type: 'refund', amount: refundAmount, balance: 0,
      status: method === 'stripe' ? 'completed' : 'pending',
      description: `Refund for booking ${bookingId}${reason ? ' — ' + reason : ''}`,
      booking: bookingId, meta: { method, relatedReference: tx.meta?.reference },
    });
    booking.paymentStatus = 'refunded';
    await booking.save();

    if (Escrow) {
      try {
        const escrow = await Escrow.findOne({ booking: bookingId });
        if (escrow && escrow.status === 'holding') { escrow.status = 'refunded'; escrow.refundedAt = new Date(); await escrow.save(); }
      } catch (e) { console.error('[payment.requestRefund] escrow:', e.message); }
    }

    Notification.notify(booking.renter, 'system', 'Refund processed',
      method === 'stripe' ? `Rs ${refundAmount} refunded to your card.` : `Rs ${refundAmount} refund is being processed.`,
      { bookingId }).catch(() => {});

    return res.json({ success: true, message: 'Refund processed.', data: { method, amount: refundAmount, automated: method === 'stripe' } });
  } catch (err) {
    console.error('[payment.requestRefund]', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Refund failed.' });
  }
};
