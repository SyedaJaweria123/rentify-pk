'use strict';
/**
 * Escrow Routes — Rentify PK
 * Hold/release/partial-release/dispute are admin-triggered; status is for
 * the booking parties + admin.
 */
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/escrow.controller');
const { protect, adminOnly } = require('../middleware/auth');

router.use(protect);

router.post('/:bookingId/hold',            adminOnly, ctrl.holdFunds);
router.post('/:bookingId/release',         adminOnly, ctrl.releaseFunds);
router.post('/:bookingId/partial-release', adminOnly, ctrl.partialRelease);
router.post('/:bookingId/dispute',         adminOnly, ctrl.holdForDispute);
router.get('/:bookingId',                  ctrl.getEscrowStatus);

module.exports = router;
