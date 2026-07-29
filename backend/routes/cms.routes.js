'use strict';
/**
 * CMS Routes — Rentify PK
 * Public GET endpoints — no auth needed (safe for frontend pages)
 * Admin POST/PUT/DELETE — admin role required
 *
 * Routes:
 *   GET  /api/cms/team          → list active team members
 *   GET  /api/cms/testimonials  → list active testimonials
 *   GET  /api/cms/owner-stories → list active owner success stories
 *
 *   POST   /api/cms/team          → create (admin)
 *   PUT    /api/cms/team/:id       → update (admin)
 *   DELETE /api/cms/team/:id       → delete (admin)
 *   (same pattern for testimonials + owner-stories)
 */
const express  = require('express');
const router   = express.Router();
const { protect } = require('../middleware/auth');
const { TeamMember, Testimonial, OwnerStory } = require('../models/cms.model');

// ── Admin role guard ──────────────────────────────────────────────────────────
const adminOnly = (req, res, next) => {
  const adminRoles = ['super_admin', 'admin', 'manager'];
  if (!adminRoles.includes(req.user?.role)) {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
  next();
};

// ══════════════════════════════════════════════════════════════════════════════
// TEAM MEMBERS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/cms/team — public
router.get('/team', async (req, res) => {
  try {
    const members = await TeamMember
      .find({ isActive: true })
      .sort({ order: 1, createdAt: 1 })
      .lean();
    return res.json({ success: true, data: { members } });
  } catch (err) {
    console.error('[CMS:team]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load team.' });
  }
});

// POST /api/cms/team — admin only
router.post('/team', protect, adminOnly, async (req, res) => {
  try {
    const member = await TeamMember.create(req.body);
    return res.status(201).json({ success: true, data: { member } });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// PUT /api/cms/team/:id — admin only
router.put('/team/:id', protect, adminOnly, async (req, res) => {
  try {
    const member = await TeamMember.findByIdAndUpdate(
      req.params.id, req.body, { new: true, runValidators: true }
    );
    if (!member) return res.status(404).json({ success: false, message: 'Team member not found.' });
    return res.json({ success: true, data: { member } });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /api/cms/team/:id — admin only (soft delete)
router.delete('/team/:id', protect, adminOnly, async (req, res) => {
  try {
    await TeamMember.findByIdAndUpdate(req.params.id, { isActive: false });
    return res.json({ success: true, message: 'Team member hidden.' });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// TESTIMONIALS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/cms/testimonials — public
router.get('/testimonials', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 6, 20);
    const testimonials = await Testimonial
      .find({ isActive: true })
      .sort({ order: 1, createdAt: -1 })
      .limit(limit)
      .lean();
    return res.json({ success: true, data: { testimonials } });
  } catch (err) {
    console.error('[CMS:testimonials]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load testimonials.' });
  }
});

// POST /api/cms/testimonials — admin only
router.post('/testimonials', protect, adminOnly, async (req, res) => {
  try {
    const testimonial = await Testimonial.create(req.body);
    return res.status(201).json({ success: true, data: { testimonial } });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// PUT /api/cms/testimonials/:id — admin only
router.put('/testimonials/:id', protect, adminOnly, async (req, res) => {
  try {
    const testimonial = await Testimonial.findByIdAndUpdate(
      req.params.id, req.body, { new: true, runValidators: true }
    );
    if (!testimonial) return res.status(404).json({ success: false, message: 'Testimonial not found.' });
    return res.json({ success: true, data: { testimonial } });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /api/cms/testimonials/:id — admin only (soft delete)
router.delete('/testimonials/:id', protect, adminOnly, async (req, res) => {
  try {
    await Testimonial.findByIdAndUpdate(req.params.id, { isActive: false });
    return res.json({ success: true, message: 'Testimonial hidden.' });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// OWNER SUCCESS STORIES
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/cms/owner-stories — public
router.get('/owner-stories', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 3, 10);
    const stories = await OwnerStory
      .find({ isActive: true })
      .sort({ order: 1, createdAt: -1 })
      .limit(limit)
      .lean();
    return res.json({ success: true, data: { stories } });
  } catch (err) {
    console.error('[CMS:owner-stories]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load owner stories.' });
  }
});

// POST /api/cms/owner-stories — admin only
router.post('/owner-stories', protect, adminOnly, async (req, res) => {
  try {
    const story = await OwnerStory.create(req.body);
    return res.status(201).json({ success: true, data: { story } });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// PUT /api/cms/owner-stories/:id — admin only
router.put('/owner-stories/:id', protect, adminOnly, async (req, res) => {
  try {
    const story = await OwnerStory.findByIdAndUpdate(
      req.params.id, req.body, { new: true, runValidators: true }
    );
    if (!story) return res.status(404).json({ success: false, message: 'Story not found.' });
    return res.json({ success: true, data: { story } });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /api/cms/owner-stories/:id — admin only
router.delete('/owner-stories/:id', protect, adminOnly, async (req, res) => {
  try {
    await OwnerStory.findByIdAndUpdate(req.params.id, { isActive: false });
    return res.json({ success: true, message: 'Story hidden.' });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
