'use strict';
/**
 * Damage Claim Routes — Rentify PK
 * Owner files, renter responds, admin resolves/lists.
 */
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/damageClaim.controller');
const { protect, adminOnly } = require('../middleware/auth');

// Optional media upload (photos/videos). Resolve regardless of upload export style.
let uploadFields = (req, _res, next) => next();
try {
  const mod = require('../middleware/upload');
  const m = mod.upload || mod;
  if (m && typeof m.fields === 'function') {
    uploadFields = m.fields([{ name: 'photos', maxCount: 8 }, { name: 'videos', maxCount: 4 }]);
  }
} catch (_) { /* no upload middleware available — body URLs still work */ }

router.use(protect);

router.get('/',            adminOnly, ctrl.listClaims);              // admin list
router.post('/',           uploadFields, ctrl.createClaim);          // owner files (checked inside)
router.get('/by-booking/:bookingId', ctrl.getClaimByBooking);        // party/admin — find existing claim for a booking
router.get('/:claimId',    ctrl.getClaim);                          // party/admin
router.patch('/:claimId/respond', ctrl.renterRespond);              // renter accept/dispute
router.patch('/:claimId/resolve', adminOnly, ctrl.adminResolve);    // admin resolve/reject

module.exports = router;
