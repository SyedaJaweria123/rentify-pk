'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/dispute.controller');
const { protect, adminOnly } = require('../middleware/auth');

// Optional evidence upload (photos). Resolve regardless of upload export style —
// same resilient pattern as damageClaim.routes.js.
let uploadEvidenceFiles = (req, _res, next) => next();
try {
  const mod = require('../middleware/upload');
  const m = mod.upload || mod;
  if (m && typeof m.array === 'function') {
    uploadEvidenceFiles = m.array('evidence', 5);
  }
} catch (_) { /* no upload middleware available — body URLs still work */ }

router.use(protect);
router.get('/',                       adminOnly, ctrl.listDisputes);
router.post('/',                      uploadEvidenceFiles, ctrl.createDispute);
router.get('/:disputeId',             ctrl.getDispute);
router.patch('/:disputeId/evidence',  uploadEvidenceFiles, ctrl.addEvidence);
router.patch('/:disputeId/resolve',   adminOnly, ctrl.adminResolve);

module.exports = router;
