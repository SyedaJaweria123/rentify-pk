'use strict';
/**
 * Trust Score routes — Rentify PK
 *   GET   /api/trust/:ownerId         → public: an owner's trust score + badge
 *   POST  /api/trust/:ownerId/recalc  → admin: force a recalculation
 *   POST  /api/trust/me/recalc        → owner: recalc own score
 */
const express = require('express');
const router = express.Router();

const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');
const { recalculateForOwner, computeTrustScore } = require('../services/trustScore.service');

// ── Public: get an owner's trust score + badge (+ live breakdown) ─────────────
router.get('/:ownerId', async (req, res) => {
  try {
    const owner = await User.findById(req.params.ownerId)
      .select('name avatar role trustScore trustBadge trustScoreUpdatedAt')
      .lean();
    if (!owner || owner.role !== 'owner') {
      return res.status(404).json({ success: false, message: 'Owner not found.' });
    }

    // If never computed, compute on the fly (and cache).
    let score = owner.trustScore;
    let badge = owner.trustBadge;
    let breakdown = null;
    if (!owner.trustScoreUpdatedAt) {
      const fresh = await recalculateForOwner(owner._id);
      if (fresh) { score = fresh.score; badge = fresh.badge; breakdown = fresh.breakdown; }
    }

    return res.json({
      success: true,
      data: {
        ownerId: owner._id,
        name: owner.name,
        avatar: owner.avatar,
        trustScore: score || 0,
        trustBadge: badge || 'none',
        updatedAt: owner.trustScoreUpdatedAt,
        breakdown,   // present only when freshly computed
      },
    });
  } catch (err) {
    console.error('[trust.get]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load trust score.' });
  }
});

// ── Owner: recalculate own score (with full breakdown) ───────────────────────
router.post('/me/recalc', protect, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ success: false, message: 'Only owners have a trust score.' });
    }
    const result = await recalculateForOwner(req.user._id);
    if (!result) return res.status(404).json({ success: false, message: 'Owner not found.' });
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[trust.me.recalc]', err.message);
    return res.status(500).json({ success: false, message: 'Recalculation failed.' });
  }
});

// ── Admin: force recalculation for any owner ─────────────────────────────────
router.post('/:ownerId/recalc', protect, adminOnly, async (req, res) => {
  try {
    const result = await recalculateForOwner(req.params.ownerId);
    if (!result) return res.status(404).json({ success: false, message: 'Owner not found.' });
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[trust.recalc]', err.message);
    return res.status(500).json({ success: false, message: 'Recalculation failed.' });
  }
});

module.exports = router;
