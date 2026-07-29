'use strict';
/**
 * CNIC Verification Routes
 * POST /api/cnic/validate      — Format + logic validation (instant)
 * POST /api/cnic/submit        — Submit CNIC for owner registration
 * GET  /api/cnic/status        — Check own CNIC status
 * POST /api/cnic/admin/verify  — Admin: approve CNIC
 * POST /api/cnic/admin/reject  — Admin: reject CNIC
 * GET  /api/cnic/admin/queue   — Admin: pending verifications list
 */

const express  = require('express');
const router   = express.Router();
const rateLimit = require('express-rate-limit');
const User     = require('../models/User');
const { protect, requireRole } = require('../middleware/auth');
const { validateCNIC, isValidCNICFormat, PROVINCE_CODES } = require('../utils/cnic');
const { readCNIC } = require('../utils/geminiVision'); // CNIC photo OCR
const { upload, uploadToCloudinary } = require('../middleware/upload.middleware'); // CNIC image upload
const { Notification } = require('../models/Notification'); // notify user on verify/reject
const email = require('../utils/email');                    // CNIC verify/reject emails
const { emitToUser } = require('../utils/socket');          // real-time push

const cnicRL = rateLimit({
  windowMs: 60 * 60 * 1000, max: 10,
  message: { success: false, message: 'Too many CNIC validation attempts. Wait 1 hour.' }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/cnic/validate — Instant format + logic validation
// ══════════════════════════════════════════════════════════════════════════════
router.post('/validate', cnicRL, async (req, res) => {
  try {
    const { cnicNumber } = req.body;

    if (!cnicNumber) {
      return res.status(400).json({ success: false, message: 'CNIC number required.' });
    }

    // Run full validation
    const result = validateCNIC(cnicNumber);

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        message: result.errors[0],
        errors:  result.errors,
        score:   result.score,
      });
    }

    // Check duplicate in database
    const existing = await User.findOne({ cnicNumber: cnicNumber.trim() }).lean();
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'This CNIC is already linked to another account. One CNIC per account only.',
        code: 'CNIC_DUPLICATE'
      });
    }

    return res.status(200).json({
      success:  true,
      message:  'CNIC format is valid.',
      province: result.province,
      gender:   result.gender,
      score:    result.score,
    });
  } catch (err) {
    console.error('CNIC validate error:', err.message);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/cnic/scan — OCR a camera-captured CNIC photo (registration flow).
// Called BEFORE an account exists, so this is intentionally unauthenticated —
// same rate-limit tier as /validate to prevent abuse of the Gemini API quota.
// Accepts a base64 data URL (the camera hasn't uploaded anywhere yet).
// ══════════════════════════════════════════════════════════════════════════════
router.post('/scan', cnicRL, async (req, res) => {
  try {
    const { imageBase64, mime } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, readable: false, message: 'No image provided.' });
    }

    const result = await readCNIC(imageBase64, mime || 'image/jpeg');

    // ── Authenticity gate — reject anything that isn't a genuine CNIC being
    //    photographed directly: non-CNIC images, screen photos, printouts,
    //    screenshots, or edited/fake cards. This is an AI-based check (a strong
    //    deterrent, not a bulletproof anti-spoof system). ──
    const authScore = typeof result.authenticityScore === 'number' ? result.authenticityScore : null;
    const spoofFlags = Array.isArray(result.spoofFlags) ? result.spoofFlags : [];
    if (result.isCnic === false || (authScore !== null && authScore < 45)) {
      return res.status(200).json({
        success: true, readable: false, isCnic: false,
        authenticityScore: authScore, spoofFlags, documentSide: result.documentSide || 'other',
        message: 'This does not look like a genuine CNIC. Please scan your original card — not a screenshot, printout, or a photo of a screen.',
      });
    }

    if (!result.readable || !result.cnicNumber) {
      return res.status(200).json({
        success: true, readable: false,
        message: 'Could not read the CNIC clearly. Retake the photo or enter the number manually.',
      });
    }

    // Light format check on what Gemini extracted — if it doesn't even look
    // like a CNIC number, treat it as unreadable rather than passing through
    // something obviously wrong.
    if (!isValidCNICFormat(result.cnicNumber)) {
      return res.status(200).json({
        success: true, readable: false,
        message: 'The number read did not match CNIC format. Please enter it manually.',
      });
    }

    return res.status(200).json({
      success: true, readable: true,
      isCnic: true,
      authenticityScore: authScore,
      documentSide: result.documentSide || 'front',
      spoofFlags,
      data: {
        cnicNumber: result.cnicNumber,
        name: result.name || null,
        fatherName: result.fatherName || null,
        dateOfBirth: result.dateOfBirth || null,
        dateOfIssue: result.dateOfIssue || null,
        dateOfExpiry: result.dateOfExpiry || null,
      },
    });
  } catch (err) {
    console.error('CNIC scan error:', err.message);
    // Gemini being unavailable shouldn't block registration — surface as
    // "couldn't read it" so the user falls back to manual entry.
    return res.status(200).json({
      success: true, readable: false,
      message: 'CNIC scan is temporarily unavailable. Please enter the number manually.',
    });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/cnic/status — Get own CNIC verification status
// ══════════════════════════════════════════════════════════════════════════════
router.get('/status', protect, (req, res) => {
  const user = req.user;
  return res.status(200).json({
    success: true,
    data: {
      cnicNumber:      user.cnicNumber ? user.cnicNumber.replace(/\d(?=\d{4})/g, '*') : null, // masked
      cnicStatus:      user.getCNICStatus(),
      cnicProvince:    user.cnicProvince,
      cnicGender:      user.cnicGender,
      cnicScore:       user.cnicValidationScore,
      cnicSubmittedAt: user.cnicSubmittedAt,
      cnicVerifiedAt:  user.cnicVerifiedAt,
      rejectReason:    user.cnicRejected ? user.cnicRejectReason : null,
      cnicImageFront:  user.cnicImageFront,
      cnicImageBack:   user.cnicImageBack,
      cnicSelfie:      user.cnicSelfie,
      cnicRejectionCount: user.cnicRejectionCount || 0,
      cnicCooldownUntil:  user.cnicCooldownUntil,
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/cnic/submit — Submit CNIC + images for manual verification
// Accepts multipart: cnicFront, cnicBack, selfie (all images, optional but
// recommended). Images are streamed to Cloudinary and their URLs saved.
// ══════════════════════════════════════════════════════════════════════════════
const cnicUploadFields = upload.fields([
  { name: 'cnicFront', maxCount: 1 },
  { name: 'cnicBack',  maxCount: 1 },
  { name: 'selfie',    maxCount: 1 },
]);

router.post('/submit', protect, cnicUploadFields, async (req, res) => {
  try {
    const user = req.user;

    if (user.cnicVerified) {
      return res.status(400).json({ success: false, message: 'CNIC already verified.' });
    }
    if (!user.cnicNumber) {
      return res.status(400).json({ success: false, message: 'No CNIC on file. Please register as owner first.' });
    }

    // Cooldown after repeated rejections — slows down repeated bad-faith
    // attempts without permanently locking anyone out. Checked first so a
    // blocked user doesn't waste an upload + Gemini call before finding out.
    if (user.cnicCooldownUntil && user.cnicCooldownUntil > new Date()) {
      const hoursLeft = Math.ceil((user.cnicCooldownUntil - new Date()) / (60 * 60 * 1000));
      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. Please try again in about ${hoursLeft} hour${hoursLeft === 1 ? '' : 's'}.`,
        cooldownUntil: user.cnicCooldownUntil,
      });
    }

    // Upload any provided images to Cloudinary (folder: rentify/cnic)
    const files = req.files || {};
    const uploadOne = async (key) => {
      const f = files[key]?.[0];
      if (!f) return null;
      const result = await uploadToCloudinary(f.buffer, 'rentify/cnic', {
        // private-ish: keep originals, no public transformations
        transformation: [{ quality: 'auto' }],
      });
      return result.secure_url;
    };

    const [frontUrl, backUrl, selfieUrl] = await Promise.all([
      uploadOne('cnicFront'),
      uploadOne('cnicBack'),
      uploadOne('selfie'),
    ]);

    if (frontUrl)  user.cnicImageFront = frontUrl;
    if (backUrl)   user.cnicImageBack  = backUrl;
    if (selfieUrl) user.cnicSelfie     = selfieUrl;

    // Mark as submitted for admin review
    user.cnicSubmittedAt  = new Date();
    user.cnicRejected     = false;
    user.cnicRejectReason = null;

    // Face match — only runs when we have BOTH a CNIC front photo (which
    // carries the printed photo) and a selfie to compare. A failure here
    // (Gemini unavailable, no face detected, etc.) does NOT block
    // submission — it just means no automated score gets recorded, and the
    // admin reviews manually as before.
    const faceCnicUrl = frontUrl || user.cnicImageFront;
    const faceSelfieUrl = selfieUrl || user.cnicSelfie;
    let autoRejected = false;

    if (faceCnicUrl && faceSelfieUrl) {
      try {
        const { faceMatch } = require('../utils/geminiVision');
        const result = await faceMatch(faceCnicUrl, faceSelfieUrl);

        if (result.facesDetected) {
          user.cnicFaceMatchScore = result.matchScore ?? null;
          user.cnicFaceMatchAt    = new Date();
          user.cnicFaceMatchNote  = result.reasoning || null;

          const FACE_MATCH_REJECT_THRESHOLD = 30;
          if (typeof result.matchScore === 'number' && result.matchScore < FACE_MATCH_REJECT_THRESHOLD) {
            user.cnicRejected     = true;
            user.cnicRejectReason = 'Selfie does not appear to match the photo on your CNIC. Please retake your selfie and CNIC photo and resubmit.';
            autoRejected = true;

            user.cnicRejectionCount = (user.cnicRejectionCount || 0) + 1;
            const REJECTION_LIMIT = 5;
            const COOLDOWN_HOURS  = 24;
            if (user.cnicRejectionCount >= REJECTION_LIMIT) {
              user.cnicCooldownUntil = new Date(Date.now() + COOLDOWN_HOURS * 60 * 60 * 1000);
              user.cnicRejectReason += ` You've reached ${REJECTION_LIMIT} failed attempts — further resubmissions are paused for ${COOLDOWN_HOURS} hours.`;
            }
          }
        }
      } catch (e) {
        console.error('[cnic.submit] face match failed (non-blocking):', e.message);
      }
    }

    await user.save({ validateBeforeSave: false });

    // Notify the user immediately if the auto-reject fired, same as the
    // admin-reject path does, so they're not left waiting on a "pending"
    // status that was actually already resolved.
    if (autoRejected) {
      try {
        await Notification.notify(
          user._id, 'cnic_rejected', 'CNIC Verification Rejected',
          `Your CNIC was rejected. Reason: ${user.cnicRejectReason}`,
          { link: '/verify-cnic' }
        );
        emitToUser(user._id, 'cnic:rejected', {
          type: 'cnic_rejected', title: 'CNIC Verification Rejected',
          message: user.cnicRejectReason, link: '/verify-cnic',
        });
      } catch (e) { console.warn('[cnic.submit] auto-reject notify failed:', e.message); }
    }

    return res.status(200).json({
      success: true,
      message: autoRejected
        ? 'Submission could not be verified automatically. Please review and resubmit.'
        : 'CNIC submitted for verification. Our team will review within 24-48 hours.',
      status:  user.getCNICStatus(),
    });
  } catch (err) {
    console.error('CNIC submit error:', err.message);
    res.status(500).json({ success: false, message: 'Server error during submission.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/cnic/admin/queue — Admin: list pending CNIC verifications
// ══════════════════════════════════════════════════════════════════════════════
router.get('/admin/queue', protect, requireRole('admin'), async (req, res) => {
  try {
    const pending = await User.find({
      role: 'owner',
      cnicNumber: { $exists: true, $ne: null },
      cnicVerified: false,
      cnicRejected: false,
    }).select('name email phone cnicNumber cnicValidationScore cnicProvince cnicGender cnicSubmittedAt createdAt cnicImageFront cnicImageBack cnicSelfie cnicFaceMatchScore cnicFaceMatchAt cnicFaceMatchNote')
      .sort({ cnicSubmittedAt: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      count:   pending.length,
      data:    pending.map(u => ({
        ...u,
        cnicNumber: u.cnicNumber, // Full CNIC for admin
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/cnic/admin/verify — Admin: approve a CNIC
// ══════════════════════════════════════════════════════════════════════════════
router.post('/admin/verify', protect, requireRole('admin'), async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required.' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (!user.cnicNumber) return res.status(400).json({ success: false, message: 'User has no CNIC on file.' });

    user.cnicVerified    = true;
    user.cnicRejected    = false;
    user.cnicRejectReason = null;
    user.cnicVerifiedAt  = new Date();
    user.cnicVerifiedBy  = req.user._id.toString();
    user.ownerApproved   = true;
    user.ownerApprovedAt = new Date();
    user.cnicRejectionCount = 0;
    user.cnicCooldownUntil  = null;
    await user.save({ validateBeforeSave: false });

    // CNIC verification is worth real trust-score points — recompute now so
    // the badge/advance-% the renter sees reflects it immediately, rather
    // than staying stale until some unrelated event happens to trigger it.
    try {
      const { recalculateForOwner } = require('../services/trustScore.service');
      await recalculateForOwner(user._id);
    } catch (e) { console.error('[cnic.admin.verify] trust recalc failed:', e.message); }

    // Notify the user (bell + DB)
    try {
      await Notification.notify(
        user._id, 'cnic_verified',
        'CNIC Verified ✓',
        'Your identity has been verified. You now have full owner access.',
        { link: '/dashboard' }
      );
    } catch (e) { console.warn('[notify cnic_verified]', e.message); }

    // Real-time push
    try {
      emitToUser(user._id, 'cnic:verified', {
        type: 'cnic_verified',
        title: 'CNIC Verified ✓',
        message: 'Your identity has been verified.',
        link: '/dashboard',
      });
    } catch (e) { /* ignore */ }

    // Email (non-blocking)
    try {
      if (user.email) {
        await email.sendCnicVerifiedEmail({ to: user.email, name: user.name });
      }
    } catch (e) { console.warn('[email cnic_verified]', e.message); }

    return res.status(200).json({
      success: true,
      message: `CNIC verified for ${user.name} (${user.email}).`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/cnic/admin/reject — Admin: reject a CNIC
// ══════════════════════════════════════════════════════════════════════════════
router.post('/admin/reject', protect, requireRole('admin'), async (req, res) => {
  try {
    const { userId, reason } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required.' });
    if (!reason) return res.status(400).json({ success: false, message: 'Rejection reason required.' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    user.cnicVerified    = false;
    user.cnicRejected    = true;
    user.cnicRejectReason = reason;

    user.cnicRejectionCount = (user.cnicRejectionCount || 0) + 1;
    const REJECTION_LIMIT = 5;
    const COOLDOWN_HOURS  = 24;
    if (user.cnicRejectionCount >= REJECTION_LIMIT) {
      user.cnicCooldownUntil = new Date(Date.now() + COOLDOWN_HOURS * 60 * 60 * 1000);
    }

    await user.save({ validateBeforeSave: false });

    // Notify the user (bell + DB) so they see it even if offline
    try {
      await Notification.notify(
        user._id, 'cnic_rejected',
        'CNIC Verification Rejected',
        `Your CNIC was rejected. Reason: ${reason}. Please re-submit.`,
        { link: '/verify-cnic' }
      );
    } catch (e) { console.warn('[notify cnic_rejected]', e.message); }

    // Real-time push
    try {
      emitToUser(user._id, 'cnic:rejected', {
        type: 'cnic_rejected',
        title: 'CNIC Verification Rejected',
        message: `Reason: ${reason}`,
        link: '/verify-cnic',
      });
    } catch (e) { /* ignore */ }

    // Email (non-blocking)
    try {
      if (user.email) {
        await email.sendCnicRejectedEmail({ to: user.email, name: user.name, reason });
      }
    } catch (e) { console.warn('[email cnic_rejected]', e.message); }

    return res.status(200).json({
      success: true,
      message: `CNIC rejected for ${user.name}. Reason: ${reason}`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
