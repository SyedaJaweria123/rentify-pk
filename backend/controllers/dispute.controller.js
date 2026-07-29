'use strict';
/**
 * Dispute Controller — Rentify PK
 * For GENERAL booking issues that are not item-damage (payment problems,
 * no-shows, listing mismatches, safety concerns). Damage disagreements stay
 * on DamageClaim end-to-end (file → respond → evidence → resolve) — this
 * model only covers everything else, so admin doesn't have to track the
 * same damage case in two places.
 */
const Dispute = require('../models/Dispute');
const { Booking } = require('../models/Booking');
const { Notification } = require('../models/Notification');
const { emitToUser } = require('../utils/socket');
const { uploadBuffer } = require('../config/cloudinary');

const eq = (a, b) => String(a) === String(b);
const isAdmin = (u) => ['admin', 'super_admin'].includes(u.role);

const uploadEvidence = async (files = []) => {
  const out = [];
  for (const f of files) {
    const r = await uploadBuffer(f.buffer, { folder: 'rentify/disputes', resource_type: 'image' });
    out.push({ type: 'image', url: r.secure_url, publicId: r.public_id, description: '' });
  }
  return out;
};

// ── POST /api/disputes ────────────────────────────────────────────────────────
exports.createDispute = async (req, res) => {
  try {
    const { bookingId, issueType, reason, description } = req.body;
    // Frontend historically sent the long-form text as "description" —
    // accept either key so older client builds keep working.
    const reasonText = reason || description;

    if (issueType === 'item_damaged') {
      return res.status(400).json({
        success: false,
        message: 'Item-damage issues are handled as a damage claim, not a general dispute.',
        redirectTo: 'damage-claim',
      });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    const isParty = eq(booking.renter, req.user._id) || eq(booking.owner, req.user._id);
    if (!isParty) return res.status(403).json({ success: false, message: 'Only a booking party can raise a dispute.' });
    if (!reasonText || String(reasonText).trim().length < 20) {
      return res.status(422).json({ success: false, message: 'A description (min 20 chars) is required.' });
    }

    const Model = Dispute;
    if (!issueType || !Model.ISSUE_TYPES.includes(issueType)) {
      return res.status(422).json({ success: false, message: `Issue type must be one of: ${Model.ISSUE_TYPES.join(', ')}` });
    }

    // The other party is the one being disputed against
    const against = eq(booking.renter, req.user._id) ? booking.owner : booking.renter;

    // Evidence arrives as multipart files from the report form, OR as
    // pre-built {type,url,publicId} objects if the caller already uploaded
    // (e.g. an admin tool). Support both.
    const evidenceFiles = (req.files) || [];
    const evidence = evidenceFiles.length
      ? await uploadEvidence(evidenceFiles)
      : (Array.isArray(req.body.evidence) ? req.body.evidence : []);

    const dispute = await Dispute.create({
      booking: booking._id,
      raisedBy: req.user._id,
      against,
      issueType,
      reason: String(reasonText).slice(0, 2000),
      evidence,
      status: 'open',
    });

    Notification.notify(against, 'dispute_opened', 'Dispute opened',
      'A dispute has been opened on your booking.', { bookingId }).catch(() => {});
    Notification.notifyAdmins('dispute_opened', 'New dispute',
      'A new dispute requires review.', { bookingId, disputeId: dispute._id }).catch(() => {});
    emitToUser(String(against), 'dispute:new', { disputeId: dispute._id, bookingId });

    return res.status(201).json({
      success: true, message: 'Dispute opened.',
      data: { ...dispute.toObject(), disputeId: dispute._id },
    });
  } catch (err) {
    console.error('[dispute.createDispute]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to open dispute.' });
  }
};

// ── GET /api/disputes/:disputeId ──────────────────────────────────────────────
exports.getDispute = async (req, res) => {
  try {
    const dispute = await Dispute.findById(req.params.disputeId)
      .populate('raisedBy', 'name email')
      .populate('against', 'name email');
    if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found.' });

    const isParty = eq(dispute.raisedBy._id || dispute.raisedBy, req.user._id)
      || eq(dispute.against._id || dispute.against, req.user._id);
    if (!isAdmin(req.user) && !isParty) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }
    return res.json({ success: true, data: dispute });
  } catch (err) {
    console.error('[dispute.getDispute]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch dispute.' });
  }
};

// ── PATCH /api/disputes/:disputeId/evidence ───────────────────────────────────
exports.addEvidence = async (req, res) => {
  try {
    const dispute = await Dispute.findById(req.params.disputeId);
    if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found.' });

    const isParty = eq(dispute.raisedBy, req.user._id) || eq(dispute.against, req.user._id);
    if (!isAdmin(req.user) && !isParty) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }
    if (['resolved', 'closed'].includes(dispute.status)) {
      return res.status(409).json({ success: false, message: 'Dispute is already closed.' });
    }

    const evidenceFiles = (req.files) || [];
    const newEvidence = evidenceFiles.length
      ? await uploadEvidence(evidenceFiles)
      : (Array.isArray(req.body.evidence) ? req.body.evidence : []);
    if (!newEvidence.length) {
      return res.status(422).json({ success: false, message: 'At least one evidence photo is required.' });
    }

    dispute.evidence.push(...newEvidence);
    await dispute.save();
    return res.json({ success: true, message: 'Evidence added.', data: dispute });
  } catch (err) {
    console.error('[dispute.addEvidence]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to add evidence.' });
  }
};

// ── PATCH /api/disputes/:disputeId/resolve  (admin) ───────────────────────────
exports.adminResolve = async (req, res) => {
  try {
    const { resolution, note } = req.body;   // favor_renter|favor_owner|split|dismissed
    const valid = ['favor_renter', 'favor_owner', 'split', 'dismissed'];
    if (!valid.includes(resolution)) {
      return res.status(422).json({ success: false, message: `Resolution must be one of: ${valid.join(', ')}` });
    }
    const dispute = await Dispute.findById(req.params.disputeId);
    if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found.' });

    await dispute.resolve({ resolution, note, adminId: req.user._id });

    for (const uid of [dispute.raisedBy, dispute.against]) {
      Notification.notify(uid, 'dispute_resolved', 'Dispute resolved',
        `The dispute has been resolved: ${resolution.replace('_', ' ')}.`, { bookingId: dispute.booking }).catch(() => {});
      emitToUser(String(uid), 'dispute:resolved', { disputeId: dispute._id, resolution });
    }

    return res.json({ success: true, message: 'Dispute resolved.', data: dispute });
  } catch (err) {
    console.error('[dispute.adminResolve]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to resolve dispute.' });
  }
};

// ── GET /api/disputes  (admin list) ───────────────────────────────────────────
exports.listDisputes = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const skip = (Number(page) - 1) * Number(limit);

    const [disputes, total] = await Promise.all([
      Dispute.find(filter)
        .populate('raisedBy', 'name email')
        .populate('against', 'name email')
        .sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Dispute.countDocuments(filter),
    ]);

    return res.json({
      success: true, data: disputes,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    console.error('[dispute.listDisputes]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to list disputes.' });
  }
};
