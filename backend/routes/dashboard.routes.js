'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/dashboard.controller');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/owner',  ctrl.getOwnerDashboard);
router.get('/renter', ctrl.getRenterDashboard);
module.exports = router;
