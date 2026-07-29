'use strict';
/**
 * Damage Claim Controller — Rentify PK
 * Owner files a damage claim → renter responds (accept/dispute) → admin resolves.
 * On resolution the resolved amount is deducted from the renter's escrow deposit.
 */
const DamageClaim = require('../models/DamageClaim');
const Escrow = require('../models/Escrow');
const { Booking } = require('../models/Booking');
const { Notification } = require('../models/Notification');
const { uploadBuffer } = require('../config/cloudinary');

const eq = (a, b) => String(a) === String(b);
const isAdmin = (u) => ['admin', 'super_admin'].includes(u.role);

// Upload an array of multer files to Cloudinary → [{ url, publicId }]
const uploadMedia = async (files = [], resourceType = 'image') => {
  const out = [];
  for (const f of files) {
    const r = await uploadBuffer(f.buffer, { folder: 'rentify/damage-claims', resource_type: resourceType });
    out.push({ url: r.secure_url, publicId: r.public_id });
  }
  return out;
};

// ── POST /api/damage-claims  (owner only) ─────────────────────────────────────
exports.createClaim = async (req, res) => {
  try {
    const { bookingId, description, estimatedCost } = req.body;
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    if (!eq(booking.owner, req.user._id)) {
      return res.status(403).json({ success: false, message: 'Only the owner can file a damage claim.' });
    }
    if (!description || !estimatedCost || Number(estimatedCost) < 1) {
      return res.status(422).json({ success: false, message: 'Description and a valid estimated cost are required.' });
    }

    // Photos/videos may arrive via multer (req.files) or pre-uploaded URLs in body
    const photoFiles = (req.files?.photos) || [];
    const videoFiles = (req.files?.videos) || [];
    const photos = photoFiles.length ? await uploadMedia(photoFiles, 'image') : (req.body.photos || []);
    const videos = videoFiles.length ? await uploadMedia(videoFiles, 'video') : (req.body.videos || []);

    const claim = await DamageClaim.create({
      booking: booking._id,
      owner:   booking.owner,
      renter:  booking.renter,
      description: String(description).slice(0, 2000),
      photos, videos,
      estimatedCost: Number(estimatedCost),
      status: 'pending',
    });

    Notification.notify(booking.renter, 'system', 'Damage claim filed',
      `The owner filed a damage claim of Rs ${estimatedCost} on your rental.`, { bookingId, link: `/damage-claim/${claim._id}` }).catch(() => {});

    return res.status(201).json({ success: true, message: 'Damage claim filed.', data: claim });
  } catch (err) {
    console.error('[damageClaim.createClaim]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to file claim.' });
  }
};

// ── GET /api/damage-claims/by-booking/:bookingId  (party or admin) ────────────
// Lets the booking-detail page check whether a claim already exists for this
// booking, so it can link to the existing claim instead of only ever showing
// "File Damage Claim" (which would otherwise let an owner think no claim
// exists, or leave the renter with no way to find the one already filed).
exports.getClaimByBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId).select('owner renter');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    const isParty = eq(booking.owner, req.user._id) || eq(booking.renter, req.user._id);
    if (!isAdmin(req.user) && !isParty) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }

    const claim = await DamageClaim.findOne({ booking: req.params.bookingId }).sort({ createdAt: -1 });
    if (!claim) return res.status(404).json({ success: false, message: 'No claim found for this booking.' });

    return res.json({ success: true, data: claim });
  } catch (err) {
    console.error('[damageClaim.getClaimByBooking]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch claim.' });
  }
};

// ── GET /api/damage-claims/:claimId ───────────────────────────────────────────
exports.getClaim = async (req, res) => {
  try {
    const claim = await DamageClaim.findById(req.params.claimId)
      .populate('owner', 'name email')
      .populate('renter', 'name email');
    if (!claim) return res.status(404).json({ success: false, message: 'Claim not found.' });

    const isParty = eq(claim.owner._id || claim.owner, req.user._id)
      || eq(claim.renter._id || claim.renter, req.user._id);
    if (!isAdmin(req.user) && !isParty) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this claim.' });
    }

    return res.json({ success: true, data: claim });
  } catch (err) {
    console.error('[damageClaim.getClaim]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch claim.' });
  }
};

// ── PATCH /api/damage-claims/:claimId/respond  (renter: accept | dispute) ─────
exports.renterRespond = async (req, res) => {
  try {
    const { response, note } = req.body;       // 'accepted' | 'disputed'
    if (!['accepted', 'disputed'].includes(response)) {
      return res.status(422).json({ success: false, message: "Response must be 'accepted' or 'disputed'." });
    }
    const claim = await DamageClaim.findById(req.params.claimId);
    if (!claim) return res.status(404).json({ success: false, message: 'Claim not found.' });
    if (!eq(claim.renter, req.user._id)) {
      return res.status(403).json({ success: false, message: 'Only the renter can respond to this claim.' });
    }
    if (claim.status !== 'pending') {
      return res.status(409).json({ success: false, message: 'This claim has already progressed.' });
    }

    await claim.markRenterResponse(response, note || '');

    Notification.notify(claim.owner, 'system', `Renter ${response} your claim`,
      `The renter has ${response} your damage claim.`, { bookingId: claim.booking, link: `/damage-claim/${claim._id}` }).catch(() => {});

    // When disputed, the admin must make the final decision — notify admins.
    if (response === 'disputed') {
      Notification.notifyAdmins('system', 'Damage claim disputed',
        `A renter disputed a damage claim (Rs ${claim.estimatedCost}). Admin review needed.`,
        { bookingId: claim.booking, link: `/damage-claim/${claim._id}` }).catch(() => {});
    }

    return res.json({ success: true, message: `Claim ${response}.`, data: claim });
  } catch (err) {
    console.error('[damageClaim.renterRespond]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to record response.' });
  }
};

// ── PATCH /api/damage-claims/:claimId/resolve  (admin only) ───────────────────
exports.adminResolve = async (req, res) => {
  try {
    const { decision, amount, note } = req.body;   // decision: 'resolve' | 'reject'
    if (!['resolve', 'reject'].includes(decision)) {
      return res.status(422).json({ success: false, message: "Decision must be 'resolve' or 'reject'." });
    }
    const claim = await DamageClaim.findById(req.params.claimId);
    if (!claim) return res.status(404).json({ success: false, message: 'Claim not found.' });

    const resolvedAmount = decision === 'resolve' ? Number(amount) || 0 : 0;
    await claim.resolve({ decision, amount: resolvedAmount, note, adminId: req.user._id });

    // Deduct from escrow deposit when the claim is upheld
    if (decision === 'resolve' && resolvedAmount > 0) {
      try {
        const escrow = await Escrow.findOne({ booking: claim.booking });
        if (escrow && escrow.status === 'holding') {
          const renterRefund = Math.max(0, escrow.depositAmount - resolvedAmount);
          const SERVICE_FEE_RATE = Number(process.env.SERVICE_FEE_RATE || 0.05);
          const platformFee = Math.round(escrow.rentalAmount * SERVICE_FEE_RATE);
          const ownerAmount = Math.max(0, escrow.rentalAmount - platformFee) + resolvedAmount; // owner gets rental + damages
          await Escrow.releaseFunds(claim.booking, {
            ownerAmount, renterRefund, platformFee, damageDeduction: resolvedAmount,
            notes: `Damage claim resolved: Rs ${resolvedAmount} deducted`,
          });
          // Platform's cut is deducted from the owner's side above — record it
          // so it lands in admin revenue like every other settlement path.
          try {
            const { recordPlatformFee } = require('../services/platformFee.service');
            await recordPlatformFee(claim.booking, platformFee);
          } catch (e) { console.error('[damageClaim.adminResolve] fee record failed:', e.message); }
        }
      } catch (e) {
        console.error('[damageClaim.adminResolve] escrow settle failed:', e.message);
      }
    }

    Notification.notify(claim.renter, 'system', 'Damage claim resolved',
      decision === 'resolve' ? `Rs ${resolvedAmount} was deducted from your deposit.` : 'The damage claim was rejected.',
      { bookingId: claim.booking, link: `/damage-claim/${claim._id}` }).catch(() => {});
    Notification.notify(claim.owner, 'system', 'Damage claim resolved',
      `Admin ${decision === 'resolve' ? 'upheld' : 'rejected'} your claim.`, { bookingId: claim.booking, link: `/damage-claim/${claim._id}` }).catch(() => {});

    return res.json({ success: true, message: `Claim ${decision}d.`, data: claim });
  } catch (err) {
    console.error('[damageClaim.adminResolve]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to resolve claim.' });
  }
};

// ── GET /api/damage-claims  (admin: list all, filter by status) ───────────────
exports.listClaims = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [claims, total] = await Promise.all([
      DamageClaim.find(filter)
        .populate('owner', 'name email')
        .populate('renter', 'name email')
        .sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      DamageClaim.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: claims,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    console.error('[damageClaim.listClaims]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to list claims.' });
  }
};
