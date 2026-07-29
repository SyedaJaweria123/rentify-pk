'use strict';
/**
 * Newsletter Routes — Rentify PK (public, no auth)
 *   POST /api/newsletter/subscribe
 *   GET  /api/newsletter/unsubscribe?email=...
 */
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/newsletter.controller');

router.post('/subscribe',   ctrl.subscribe);
router.get('/unsubscribe',  ctrl.unsubscribe);

module.exports = router;
