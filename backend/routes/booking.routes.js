'use strict';
/**
 * Booking Routes — Rentify PK
 * All routes require auth. Lifecycle actions are exposed as both PUT (used by
 * the current frontend) and PATCH (per API spec) so either verb works.
 */
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/booking.controller');
const { protect } = require('../middleware/auth');
const { validateCreateBooking } = require('../middleware/bookingValidation');
const { bookingLimiter } = require('../middleware/rateLimiter');

router.use(protect);

// ── List & create ─────────────────────────────────────────────────────────────
router.get('/', ctrl.getBookings);
router.post('/', bookingLimiter, validateCreateBooking, ctrl.createBooking);

// ── Availability check (POST per spec; GET kept for backward-compat) ──────────
router.post('/check-availability', ctrl.checkAvailability);
router.get('/check-availability',  ctrl.checkAvailability);

// ── Single ──────────────────────────────────────────────────────────────────
router.get('/:id', ctrl.getBookingById);
router.get('/:id/qr',       ctrl.getBookingQR);
router.get('/:id/tracking',  ctrl.getBookingTracking);  // public — RNT-xxx ya MongoDB ID

// ── Lifecycle actions — PUT (frontend) + PATCH (spec) ─────────────────────────
router.route('/:id/confirm').put(ctrl.confirmBooking).patch(ctrl.confirmBooking);
router.route('/:id/reject').put(ctrl.rejectBooking).patch(ctrl.rejectBooking);
router.route('/:id/cancel').put(ctrl.cancelBooking).patch(ctrl.cancelBooking);
router.route('/:id/collect-remaining').put(ctrl.collectRemaining).patch(ctrl.collectRemaining);
router.route('/:id/complete').put(ctrl.completeBooking).patch(ctrl.completeBooking);
router.route('/:id/request-return').put(ctrl.requestReturn).patch(ctrl.requestReturn);
router.route('/:id/dispute').put(ctrl.disputeBooking).patch(ctrl.disputeBooking);

module.exports = router;
