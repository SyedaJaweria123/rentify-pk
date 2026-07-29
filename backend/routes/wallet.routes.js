'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/wallet.controller');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/balance',      ctrl.getBalance);
router.get('/transactions', ctrl.getTransactions);
router.get('/summary',      ctrl.getWalletSummary);
router.post('/withdraw',    ctrl.requestWithdrawal);
module.exports = router;
