'use strict';
/**
 * Rider Routes — Rentify PK  (protect + riderOnly)
 * All rider actions emit real-time events to the relevant parties.
 */
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/rider.controller');
const { protect, riderOnly } = require('../middleware/auth');

router.use(protect, riderOnly);

router.get('/assignments',                 ctrl.getMyAssignments);
router.get('/assignments/:id',             ctrl.getAssignment);
router.get('/earnings',                    ctrl.getEarnings);
router.patch('/assignments/:id/accept',    ctrl.acceptAssignment);
router.patch('/assignments/:id/decline',   ctrl.declineAssignment);
router.patch('/assignments/:id/pickup',    ctrl.markPickedUp);
router.patch('/assignments/:id/deliver',   ctrl.markDelivered);
router.patch('/assignments/:id/complete',  ctrl.completeAssignment);
router.patch('/assignments/:id/collect-remaining', ctrl.collectRemaining);
router.patch('/assignments/:id/refused',   ctrl.markRefused);
router.post('/scan-qr',                    ctrl.scanQR);
router.patch('/availability',              ctrl.toggleAvailability);
router.patch('/location',                  ctrl.updateLocation);   // bonus: REST fallback for location

module.exports = router;
