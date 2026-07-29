'use strict';
/**
 * Inspection Routes — Rentify PK  (protect)
 * Delivery (rider) + return (renter) condition reports with Gemini AI analysis.
 */
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/inspection.controller');
const { protect } = require('../middleware/auth');

router.use(protect);

// My proofs hub — must come before the generic /:bookingId-style routes below
router.get('/my', ctrl.getMyInspections);

// Submit
router.post('/pickup/:bookingId',          ctrl.submitPickupInspection);          // rider, at owner
router.post('/delivery/:bookingId',        ctrl.submitDeliveryInspection);        // rider, at renter
router.post('/return-pickup/:bookingId',   ctrl.submitReturnPickupInspection);    // rider, collecting back
router.post('/return/:bookingId',          ctrl.submitReturnInspection);          // renter
router.post('/return-delivery/:bookingId', ctrl.submitReturnDeliveryInspection);  // rider, back at owner

// Fetch
router.get('/delivery/:bookingId',  (req, res) => { req.params.type = 'delivery'; return ctrl.getReport(req, res); });
router.get('/return/:bookingId',    (req, res) => { req.params.type = 'return';   return ctrl.getReport(req, res); });
router.get('/leg/:type/:bookingId', ctrl.getReport);   // any of the four legs
router.get('/compare/:bookingId',   ctrl.compareInspections);
router.get('/all-comparisons/:bookingId', ctrl.getAllComparisons);   // every leg
router.get('/leg-result/:type/:bookingId', ctrl.getLegResult);       // one leg

// AI (admin/internal manual re-run)
router.post('/ai-analyze/:inspectionId', ctrl.runAIAnalysis);

module.exports = router;
