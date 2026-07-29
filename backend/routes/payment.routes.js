'use strict';
/**
 * Payment Routes — Rentify PK
 *   • Public callbacks (gateways post back here — NO auth)
 *   • Stripe webhook needs the RAW body for signature verification
 *   • Authenticated routes below; admin-only where noted.
 *
 * Security: credentials live only in .env; payment success is always verified
 * server-side (hash/signature), never trusted from the frontend.
 */
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/payment.controller');
const { protect, adminOnly } = require('../middleware/auth');

// Optional proof upload (single image, field: "proof")
let proofUpload = (req, _res, next) => next();
try {
  const mod = require('../middleware/upload');
  const m = mod.upload || mod;
  if (m && typeof m.single === 'function') proofUpload = m.single('proof');
} catch (_) {}

// ── PUBLIC callbacks (gateway → server, no auth) ─────────────────────────────
router.post('/jazzcash/callback',  ctrl.jazzCashCallback);
router.post('/easypaisa/callback', ctrl.easypaisaCallback);
// NOTE: POST /stripe/webhook is mounted in server.js BEFORE express.json()
// so the raw body survives for Stripe signature verification.

// Static bank list — no auth, no DB
router.get('/supported-banks', ctrl.getSupportedBanks);

// ── AUTHENTICATED ─────────────────────────────────────────────────────────────
router.use(protect);

router.post('/initiate',          ctrl.initiatePayment);
router.get('/status/:bookingId',  ctrl.getPaymentStatus);
router.post('/refund',            adminOnly, ctrl.requestRefund);

// Bank transfer — renter submits proof screenshot
router.post('/bank-transfer/proof', proofUpload, ctrl.submitBankTransferProof);

// Bank transfer — admin actions (reference in URL)
router.get('/bank-transfer/pending',     adminOnly, ctrl.getPendingBankTransfers);
router.patch('/bank-transfer/:ref/verify', adminOnly, ctrl.verifyBankTransfer);
router.patch('/bank-transfer/:ref/reject', adminOnly, ctrl.rejectBankTransfer);

module.exports = router;
