'use strict';
const express  = require('express');
const router   = express.Router();
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const passport = require('passport');
const rateLimit = require('express-rate-limit');
const User     = require('../models/User');
const { Notification } = require('../models/Notification');
const { protect, ownerOnly, requireRole } = require('../middleware/auth');
const { addToBlacklist } = require('../middleware/tokenBlacklist');
const { validateCNIC: validateCNICFull, isValidCNICFormat } = require('../utils/cnic');
const {
  sendVerificationEmail, sendOTPEmail,
  sendWelcomeEmail, sendLockEmail, sendLoginNotificationEmail
} = require('../utils/email');

const FRONTEND = () => process.env.FRONTEND_URL || 'http://localhost:4200';

// Upload a base64/data-URL image to Cloudinary; returns secure_url or null.
const uploadCNICImage = async (dataUrl, label) => {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  try {
    const cloud = require('cloudinary').v2;
    const res = await cloud.uploader.upload(dataUrl, {
      folder: 'rentify/cnic',
      public_id: `${label}_${Date.now()}`,
      resource_type: 'image',
    });
    return res.secure_url;
  } catch (e) {
    console.error(`[cnic upload ${label}]`, e.message);
    return null;
  }
};
const signAccess  = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
const signRefresh = (id) => jwt.sign({ id }, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, { expiresIn: '30d' });
const genOTP   = () => Math.floor(100000 + Math.random() * 900000).toString();
const genToken = () => crypto.randomBytes(32).toString('hex');

const getDevice = (req) => {
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  return {
    ip: req.ip || 'Unknown',
    browser: ua.includes('chrome')?'Chrome':ua.includes('firefox')?'Firefox':ua.includes('safari')?'Safari':'Browser',
    os: ua.includes('windows')?'Windows':ua.includes('mac')?'macOS':ua.includes('android')?'Android':ua.includes('iphone')?'iOS':'Unknown',
    device: (ua.includes('mobile')||ua.includes('android')||ua.includes('iphone'))?'Mobile':'Desktop',
  };
};

const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

// ── Cloudflare Turnstile Verification ───────────────────
const verifyTurnstile = async (token, ip) => {
  // Skip verification in development mode
  if (process.env.NODE_ENV === 'development') return true;
  // Skip if Turnstile secret not configured
  if (!process.env.TURNSTILE_SECRET_KEY || process.env.TURNSTILE_SECRET_KEY === 'YOUR_TURNSTILE_SECRET') return true;
  try {
    const formData = new URLSearchParams();
    formData.append('secret',   process.env.TURNSTILE_SECRET_KEY);
    formData.append('response', token);
    formData.append('remoteip', ip || '');
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    return data.success === true;
  } catch(e) {
    console.error('Turnstile verify error:', e.message);
    return true; // fail open — don't block real users on network error
  }
};
const isValidPhone = (v) => /^03[0-9]{9}$/.test(v);
const isValidCNIC  = (v) => /^[0-9]{5}-[0-9]{7}-[0-9]$/.test(v);

const validateCNIC = (cnic) => {
  const c = cnic.replace(/-/g,'');
  if(c.length!==13) return {valid:false,reason:'CNIC must be 13 digits'};
  if(![1,2,3,4,5,6].includes(parseInt(c[0]))) return {valid:false,reason:'Invalid province code (must be 1-6)'};
  if(![1,2].includes(parseInt(c[12]))) return {valid:false,reason:'Invalid gender digit (must be 1=Male or 2=Female)'};
  if(/^(.)\1+$/.test(c)) return {valid:false,reason:'Fake CNIC detected — all same digits'};
  return {valid:true};
};

const issueTokens = async (user) => {
  const accessToken  = signAccess(user._id);
  const refreshToken = signRefresh(user._id);
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });
  return { accessToken, refreshToken };
};

// Rate limiters — relaxed in development
const isDev = process.env.NODE_ENV === 'development';
const loginRL    = rateLimit({ windowMs:15*60*1000, max: isDev ? 1000 : 10,  message:{success:false,message:'Too many attempts. Wait 15 minutes.'} });
const registerRL = rateLimit({ windowMs:60*60*1000, max: isDev ? 1000 : 10,  message:{success:false,message:'Too many registrations. Wait 1 hour.'} });
const otpRL      = rateLimit({ windowMs:60*60*1000, max: isDev ? 1000 : 5,   message:{success:false,message:'Too many OTP requests. Wait 1 hour.'} });
const resendRL   = rateLimit({ windowMs:10*60*1000, max: isDev ? 1000 : 3,   message:{success:false,message:'Too many resend requests. Wait 10 minutes.'} });

// ══════════════════════════════════════════════════════════════════════════════
// REGISTER RENTER
// ══════════════════════════════════════════════════════════════════════════════
router.post('/register/renter', registerRL, async (req, res) => {
  try {
    const { name, email, phone, password, confirmPassword, turnstileToken, referralCode } = req.body;

    // Verify Turnstile
    const humanVerified = await verifyTurnstile(turnstileToken, req.ip);
    if (!humanVerified) {
      return res.status(400).json({ success:false, message:'Human verification failed. Please try again.', code:'CAPTCHA_FAILED' });
    }

    const errors = [];

    if (!name||name.trim().length<2)     errors.push({field:'name',    message:'Name must be at least 2 characters'});
    if (!email||!isValidEmail(email))    errors.push({field:'email',   message:'Enter a valid email address'});
    if (!password||password.length<6)   errors.push({field:'password', message:'Password must be at least 6 characters'});
    if (password!==confirmPassword)      errors.push({field:'confirmPassword', message:'Passwords do not match'});
    if (phone && !isValidPhone(phone))   errors.push({field:'phone',   message:'Enter valid Pakistani number (03XXXXXXXXX)'});

    if (errors.length) return res.status(400).json({success:false, message:'Validation failed', errors});

    const emailLc = email.toLowerCase().trim();
    const emailEx = await User.findOne({email:emailLc}).lean();
    if (emailEx) return res.status(409).json({success:false, errors:[{field:'email',message:'Email already registered. Please login.'}]});
    if (phone) {
      const phoneEx = await User.findOne({phone}).lean();
      if (phoneEx) return res.status(409).json({success:false, errors:[{field:'phone',message:'Phone number already registered.'}]});
    }

    // Use 6-digit OTP instead of long token for better UX
    const token = genOTP();
    const userData = {
      name: name.trim(), email: emailLc, password, role:'renter',
      emailToken: token,
      emailTokenExpires: new Date(Date.now() + 5*60*1000), // 5 minute expiry
    };
    if (phone?.trim()) userData.phone = phone.trim();

    // Optional referral — referredBy is set once at signup and never changes.
    // An invalid/unknown code is silently ignored rather than blocking signup.
    if (referralCode) {
      try {
        const { findReferrerByCode } = require('../services/referral.service');
        const referrer = await findReferrerByCode(referralCode);
        if (referrer) userData.referredBy = referrer._id;
      } catch (e) { console.error('[register/renter] referral lookup failed:', e.message); }
    }

    const user = await User.create(userData);

    // Notify admins of new user
    try {
      await Notification.notifyAdmins('system', 'New User Registered',
        `${user.name} signed up as a renter.`, { userId: user._id });
    } catch (e) { console.error('admin notify failed:', e.message); }

    let emailSent = false;
    try { await sendVerificationEmail({to:emailLc, name:user.name, token}); emailSent=true; }
    catch(e) {
      console.error('Verification email failed:', e.message);
      if (process.env.NODE_ENV==='development') console.log('Dev URL:', `${FRONTEND()}/auth/verify-email?token=${token}`);
    }

    const resp = {success:true, message: emailSent
      ? `Account created! Verification link sent to ${emailLc}. Check spam too.`
      : 'Account created! Email could not be sent — contact support.'};
    if (process.env.NODE_ENV==='development' && !emailSent) resp.devToken = token;
    return res.status(201).json(resp);
  } catch(err) {
    console.error('Register renter error:', err);
    if (err.code===11000) {
      const field = Object.keys(err.keyValue||{})[0]||'field';
      return res.status(409).json({success:false, errors:[{field, message:`This ${field} is already registered.`}]});
    }
    res.status(500).json({success:false, message:'Server error.'});
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// REGISTER OWNER
// ══════════════════════════════════════════════════════════════════════════════
router.post('/register/owner', registerRL, async (req, res) => {
  try {
    const { name, email, phone, password, confirmPassword, cnicNumber, turnstileToken, referralCode,
            cnicImageFront, cnicImageBack, cnicSelfie } = req.body;

    // Verify Turnstile
    const humanVerified = await verifyTurnstile(turnstileToken, req.ip);
    if (!humanVerified) {
      return res.status(400).json({ success:false, message:'Human verification failed. Please try again.', code:'CAPTCHA_FAILED' });
    }

    const errors = [];

    if (!name||name.trim().length<2)     errors.push({field:'name',    message:'Name must be at least 2 characters'});
    if (!email||!isValidEmail(email))    errors.push({field:'email',   message:'Enter a valid email address'});
    if (!phone||!isValidPhone(phone))    errors.push({field:'phone',   message:'Phone number is required for owners (03XXXXXXXXX)'});
    if (!password||password.length<8)   errors.push({field:'password', message:'Owner password must be at least 8 characters'});
    if (password!==confirmPassword)      errors.push({field:'confirmPassword', message:'Passwords do not match'});

    if (!cnicNumber) {
      errors.push({field:'cnicNumber', message:'CNIC is mandatory for owner accounts'});
    } else {
      // Full JazzCash-style validation with province, district, gender checks
      const cnicResult = validateCNICFull(cnicNumber);
      if (!cnicResult.valid) {
        cnicResult.errors.forEach(err => errors.push({field:'cnicNumber', message:err}));
      }
    }

    if (errors.length) return res.status(400).json({success:false, message:'Validation failed', errors});

    const emailLc = email.toLowerCase().trim();
    const [emailEx, phoneEx, cnicEx] = await Promise.all([
      User.findOne({email:emailLc}).lean(),
      User.findOne({phone}).lean(),
      User.findOne({cnicNumber}).lean(),
    ]);

    if (emailEx) return res.status(409).json({success:false, errors:[{field:'email',   message:'Email already registered.'}]});
    if (phoneEx) return res.status(409).json({success:false, errors:[{field:'phone',   message:'Phone already registered.'}]});
    if (cnicEx)  return res.status(409).json({success:false, errors:[{field:'cnicNumber',message:'CNIC already linked to another account. One CNIC per account only.'}]});

    // 6-digit OTP for email verification
    const token = genOTP();

    let referredBy = null;
    if (referralCode) {
      try {
        const { findReferrerByCode } = require('../services/referral.service');
        const referrer = await findReferrerByCode(referralCode);
        if (referrer) referredBy = referrer._id;
      } catch (e) { console.error('[register/owner] referral lookup failed:', e.message); }
    }

    // Upload CNIC photos to Cloudinary if the owner captured them via the
    // camera scanner — optional, since manual CNIC-number entry without a
    // photo is still allowed for owners (unlike riders, where it's mandatory).
    const [frontUrl, backUrl, selfieUrl] = await Promise.all([
      uploadCNICImage(cnicImageFront, 'owner_front'),
      uploadCNICImage(cnicImageBack,  'owner_back'),
      uploadCNICImage(cnicSelfie,     'owner_selfie'),
    ]);

    // Face match — same auto-reject-below-30% rule as the post-signup
    // /cnic/submit flow, run here too since registration is now the primary
    // place owners provide a selfie. A failure here doesn't block signup —
    // it just means no automated score, falling back to manual admin review.
    let faceMatchFields = {};
    let autoRejected = false;
    let autoRejectReason = null;
    if (frontUrl && selfieUrl) {
      try {
        const { faceMatch } = require('../utils/geminiVision');
        const result = await faceMatch(frontUrl, selfieUrl);
        if (result.facesDetected) {
          faceMatchFields = {
            cnicFaceMatchScore: result.matchScore ?? null,
            cnicFaceMatchAt: new Date(),
            cnicFaceMatchNote: result.reasoning || null,
          };
          const FACE_MATCH_REJECT_THRESHOLD = 30;
          if (typeof result.matchScore === 'number' && result.matchScore < FACE_MATCH_REJECT_THRESHOLD) {
            autoRejected = true;
            autoRejectReason = 'Selfie does not appear to match the photo on your CNIC. Please re-register with a clearer selfie and CNIC photo, or contact support.';
          }
        }
      } catch (e) { console.error('[register/owner] face match failed (non-blocking):', e.message); }
    }

    const user = await User.create({
      name: name.trim(), email: emailLc, phone, password,
      role:'owner', cnicNumber,
      emailToken: token,
      emailTokenExpires: new Date(Date.now() + 5*60*1000), // 5 minute expiry
      isActive: false,
      cnicSubmittedAt: new Date(),
      cnicValidationScore: validateCNICFull(cnicNumber).score || 0,
      cnicProvince: validateCNICFull(cnicNumber).province || null,
      cnicGender: validateCNICFull(cnicNumber).gender || null,
      cnicImageFront: frontUrl,
      cnicImageBack: backUrl,
      cnicSelfie: selfieUrl,
      cnicRejected: autoRejected,
      cnicRejectReason: autoRejectReason,
      referredBy,
      ...faceMatchFields,
    });

    // Notify admins: new owner + CNIC pending review
    try {
      await Notification.notifyAdmins('system', 'New Owner — CNIC Review',
        `${user.name} registered as an owner. CNIC verification pending.`, { userId: user._id });
    } catch (e) { console.error('admin notify failed:', e.message); }

    let emailSent = false;
    try { await sendVerificationEmail({to:emailLc, name:user.name, token}); emailSent=true; }
    catch(e) {
      console.error('Owner verification email failed:', e.message);
      if (process.env.NODE_ENV==='development') console.log('Dev URL:', `${FRONTEND()}/auth/verify-email?token=${token}`);
    }

    const resp = {success:true, message: emailSent
      ? `Owner account created! Verify your email at ${emailLc} to activate.`
      : 'Owner account created! Email could not be sent — contact support.'};
    // Additive fields for the premium verification UI — existing consumers
    // that only read {success, message} are unaffected.
    resp.verification = {
      faceMatchScore: faceMatchFields.cnicFaceMatchScore ?? null,
      autoRejected,
      autoRejectReason,
      cnicValidationScore: validateCNICFull(cnicNumber).score || 0,
    };
    if (process.env.NODE_ENV==='development' && !emailSent) resp.devToken = token;
    return res.status(201).json(resp);
  } catch(err) {
    console.error('Register owner error:', err);
    if (err.code===11000) {
      const field = Object.keys(err.keyValue||{})[0]||'field';
      return res.status(409).json({success:false, errors:[{field, message:`This ${field} is already registered.`}]});
    }
    res.status(500).json({success:false, message:'Server error.'});
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// REGISTER RIDER
// ══════════════════════════════════════════════════════════════════════════════
router.post('/register/rider', registerRL, async (req, res) => {
  try {
    const { name, email, phone, password, confirmPassword, cnicNumber, vehicleType, turnstileToken,
            cnicConsent, cnicImageFront, cnicImageBack, cnicSelfie, referralCode } = req.body;

    const humanVerified = await verifyTurnstile(turnstileToken, req.ip);
    if (!humanVerified) {
      return res.status(400).json({ success:false, message:'Human verification failed. Please try again.', code:'CAPTCHA_FAILED' });
    }

    const allowedVehicles = ['bike','car','van'];
    const errors = [];
    if (!name || name.trim().length < 2)   errors.push({ field:'name',     message:'Name must be at least 2 characters' });
    if (!email || !isValidEmail(email))    errors.push({ field:'email',    message:'Enter a valid email address' });
    if (!phone || !isValidPhone(phone))    errors.push({ field:'phone',    message:'Phone number is required for riders (03XXXXXXXXX)' });
    if (!password || password.length < 8)  errors.push({ field:'password', message:'Rider password must be at least 8 characters' });
    if (password !== confirmPassword)       errors.push({ field:'confirmPassword', message:'Passwords do not match' });
    if (!vehicleType || !allowedVehicles.includes(vehicleType)) errors.push({ field:'vehicleType', message:'Choose a vehicle: bike, car, or van.' });
    if (!cnicConsent) errors.push({ field:'cnicConsent', message:'You must agree to CNIC verification to continue.' });

    // CNIC mandatory + full validation (same as owner — riders handle goods + cash)
    if (!cnicNumber) {
      errors.push({ field:'cnicNumber', message:'CNIC is mandatory for rider accounts' });
    } else {
      const cnicResult = validateCNICFull(cnicNumber);
      if (!cnicResult.valid) cnicResult.errors.forEach(err => errors.push({ field:'cnicNumber', message:err }));
    }

    if (errors.length) return res.status(400).json({ success:false, message:'Validation failed', errors });

    const emailLc = email.toLowerCase().trim();
    const [emailEx, phoneEx, cnicEx] = await Promise.all([
      User.findOne({ email:emailLc }).lean(),
      User.findOne({ phone }).lean(),
      User.findOne({ cnicNumber }).lean(),
    ]);
    if (emailEx) return res.status(409).json({ success:false, errors:[{ field:'email',      message:'Email already registered. Please login.' }] });
    if (phoneEx) return res.status(409).json({ success:false, errors:[{ field:'phone',      message:'Phone already registered.' }] });
    if (cnicEx)  return res.status(409).json({ success:false, errors:[{ field:'cnicNumber', message:'CNIC already linked to another account. One CNIC per account only.' }] });

    const cnicFull = validateCNICFull(cnicNumber);
    // Upload CNIC photos to Cloudinary (if provided by the scanner)
    const [frontUrl, backUrl, selfieUrl] = await Promise.all([
      uploadCNICImage(cnicImageFront, 'rider_front'),
      uploadCNICImage(cnicImageBack,  'rider_back'),
      uploadCNICImage(cnicSelfie,     'rider_selfie'),
    ]);
    const token = genOTP();

    let referredBy = null;
    if (referralCode) {
      try {
        const { findReferrerByCode } = require('../services/referral.service');
        const referrer = await findReferrerByCode(referralCode);
        if (referrer) referredBy = referrer._id;
      } catch (e) { console.error('[register/rider] referral lookup failed:', e.message); }
    }

    // Face match — riders handle goods + cash directly with strangers, so
    // this matters just as much as for owners. Same auto-reject rule.
    let faceMatchFields = {};
    let autoRejected = false;
    let autoRejectReason = null;
    if (frontUrl && selfieUrl) {
      try {
        const { faceMatch } = require('../utils/geminiVision');
        const result = await faceMatch(frontUrl, selfieUrl);
        if (result.facesDetected) {
          faceMatchFields = {
            cnicFaceMatchScore: result.matchScore ?? null,
            cnicFaceMatchAt: new Date(),
            cnicFaceMatchNote: result.reasoning || null,
          };
          const FACE_MATCH_REJECT_THRESHOLD = 30;
          if (typeof result.matchScore === 'number' && result.matchScore < FACE_MATCH_REJECT_THRESHOLD) {
            autoRejected = true;
            autoRejectReason = 'Selfie does not appear to match the photo on your CNIC. Please re-register with a clearer selfie and CNIC photo, or contact support.';
          }
        }
      } catch (e) { console.error('[register/rider] face match failed (non-blocking):', e.message); }
    }

    const user = await User.create({
      name: name.trim(), email: emailLc, phone, password,
      role: 'rider', cnicNumber, vehicleType,
      isAvailable: false, totalDeliveries: 0,
      emailToken: token,
      emailTokenExpires: new Date(Date.now() + 5*60*1000),
      isActive: false,                       // admin verifies CNIC before activation
      cnicSubmittedAt: new Date(),
      cnicValidationScore: cnicFull.score || 0,
      cnicProvince: cnicFull.province || null,
      cnicGender: cnicFull.gender || null,
      cnicImageFront: frontUrl,
      cnicImageBack: backUrl,
      cnicSelfie: selfieUrl,
      cnicConsent: true,
      cnicConsentAt: new Date(),
      cnicRejected: autoRejected,
      cnicRejectReason: autoRejectReason,
      referredBy,
      ...faceMatchFields,
    });

    try {
      await Notification.notifyAdmins('system', 'New Rider — CNIC Review',
        `${user.name} registered as a rider (${vehicleType}). CNIC verification pending.`, { userId: user._id });
    } catch (e) { console.error('admin notify failed:', e.message); }

    let emailSent = false;
    try { await sendVerificationEmail({ to:emailLc, name:user.name, token }); emailSent = true; }
    catch(e) {
      console.error('Verification email failed:', e.message);
      if (process.env.NODE_ENV === 'development') console.log('Dev URL:', `${FRONTEND()}/auth/verify-email?token=${token}`);
    }

    const resp = { success:true, message: emailSent
      ? `Rider account created! Verify your email (${emailLc}), then an admin will review your CNIC.`
      : 'Rider account created! Email could not be sent — contact support.' };
    resp.verification = {
      faceMatchScore: faceMatchFields.cnicFaceMatchScore ?? null,
      autoRejected,
      autoRejectReason,
      cnicValidationScore: cnicFull.score || 0,
    };
    if (process.env.NODE_ENV === 'development' && !emailSent) resp.devToken = token;
    return res.status(201).json(resp);
  } catch(err) {
    console.error('Register rider error:', err);
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue||{})[0] || 'field';
      return res.status(409).json({ success:false, errors:[{ field, message:`This ${field} is already registered.` }] });
    }
    res.status(500).json({ success:false, message:'Server error.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// CHECK EMAIL EXISTS (for real-time validation)
// ══════════════════════════════════════════════════════════════════════════════
router.post('/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !isValidEmail(email)) return res.status(400).json({ exists: false });
    const user = await User.findOne({ email: email.toLowerCase() }).lean().select('_id');
    return res.status(200).json({ exists: !!user });
  } catch(err) {
    return res.status(200).json({ exists: false });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// VERIFY EMAIL
// ══════════════════════════════════════════════════════════════════════════════
router.get('/verify-email', async (req, res) => {
  try {
    const {token} = req.query;
    if (!token) return res.status(400).json({success:false, message:'Token missing.', code:'INVALID_TOKEN'});

    const user = await User.findOne({emailToken:token, emailTokenExpires:{$gt:new Date()}}).select('+emailToken');
    if (!user) {
      const expired = await User.findOne({emailToken:token});
      if (expired) return res.status(400).json({success:false, message:'Link expired. Request a new one.', code:'LINK_EXPIRED'});
      return res.status(400).json({success:false, message:'Invalid or already used link.', code:'LINK_INVALID'});
    }

    if (user.isEmailVerified) return res.status(200).json({success:true, message:'Already verified! Please login.', alreadyVerified:true});

    user.isEmailVerified = true;
    user.isActive        = true;
    user.emailToken        = null;
    user.emailTokenExpires = null;
    await user.save({validateBeforeSave:false});

    // Issue tokens for auto-login after verification
    const {accessToken, refreshToken} = await issueTokens(user);

    sendWelcomeEmail({to:user.email, name:user.name, role:user.role}).catch(()=>{});
    return res.status(200).json({
      success: true,
      message: 'Email verified! Logging you in...',
      autoLogin: true,
      data: {
        user: user.toPublicJSON(),
        accessToken,
        refreshToken
      }
    });
  } catch(err) { res.status(500).json({success:false, message:'Server error.'}); }
});

// ══════════════════════════════════════════════════════════════════════════════
// RESEND VERIFICATION
// ══════════════════════════════════════════════════════════════════════════════
router.post('/resend-verification', resendRL, async (req, res) => {
  try {
    const {email} = req.body;
    if (!email||!isValidEmail(email)) return res.status(400).json({success:false, message:'Valid email required.'});
    const user = await User.findOne({email:email.toLowerCase()}).select('+emailToken');
    if (!user||user.isEmailVerified) return res.status(200).json({success:true, message:'If email exists and unverified, link sent.'});
    // New 6-digit OTP with 5 minute expiry
    const token = genOTP();
    user.emailToken = token;
    user.emailTokenExpires = new Date(Date.now() + 5*60*1000);
    user.resetOTPAttempts = 0; // Reset attempt counter
    await user.save({validateBeforeSave:false});
    try {
      await sendVerificationEmail({to:user.email, name:user.name, token});
      return res.status(200).json({success:true, message:'Verification email sent! Check inbox and spam.'});
    } catch(e) {
      const r = {success:false, message:'Could not send email.'};
      if (process.env.NODE_ENV==='development') r.devToken = token;
      return res.status(500).json(r);
    }
  } catch(err) { res.status(500).json({success:false, message:'Server error.'}); }
});

// ══════════════════════════════════════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════════════════════════════════════
router.post('/login', loginRL, async (req, res) => {
  try {
    const {email, password} = req.body;
    if (!email||!password) return res.status(400).json({success:false, message:'Email and password required.'});
    if (!isValidEmail(email)) return res.status(400).json({success:false, message:'Enter a valid email.'});

    const device = getDevice(req);
    const user = await User.findOne({email:email.toLowerCase()}).select('+password +refreshToken +failedAttempts +isLocked +lockUntil');

    if (!user) return res.status(401).json({success:false, message:'Incorrect email or password.'});

    if (user.provider !== 'local') {
      const providerName = user.provider.charAt(0).toUpperCase() + user.provider.slice(1);
      return res.status(401).json({
        success:false,
        message:`This account uses ${providerName} login. Click "Continue with ${providerName}".`,
        code:`USE_${user.provider.toUpperCase()}`
      });
    }

    if (user.isAccountLocked()) {
      const mins = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({success:false, message:`Account locked. Try again in ${mins} minutes.`, code:'ACCOUNT_LOCKED', lockUntil:user.lockUntil});
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await user.recordFailedLogin(device);
      if (user.isLocked) {
        sendLockEmail({to:user.email, name:user.name, lockUntil:user.lockUntil}).catch(()=>{});
        return res.status(423).json({success:false, message:'5 failed attempts — account locked 30 minutes.', code:'ACCOUNT_LOCKED'});
      }
      const left = Math.max(0, 5 - user.failedAttempts);
      return res.status(401).json({success:false, message:`Incorrect password. ${left} attempt${left===1?'':'s'} remaining.`, attemptsLeft:left});
    }

    if (!user.isEmailVerified) {
      return res.status(403).json({
        success:false,
        message:'Email not verified. Please check your inbox and verify before logging in.',
        code:'EMAIL_NOT_VERIFIED',
        email: user.email
      });
    }

    if (!user.isActive) return res.status(403).json({success:false, message:'Account deactivated.', code:'ACCOUNT_INACTIVE'});
    if (user.isSuspended) return res.status(403).json({success:false, message:`Account suspended: ${user.suspendReason||'Policy violation'}`, code:'ACCOUNT_SUSPENDED'});

    await user.recordSuccessLogin(device);
    const {accessToken, refreshToken} = await issueTokens(user);

    // Send login notification email (non-blocking)
    const loginTime = new Date().toLocaleString('en-PK', {
      dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Karachi'
    });
    sendLoginNotificationEmail({
      to: user.email,
      name: user.name,
      device,
      time: loginTime,
      ip: req.ip || 'Unknown',
    }).catch(e => console.warn('Login notification email failed:', e.message));

    return res.status(200).json({
      success:true,
      message:`Welcome back, ${user.name}!`,
      data:{user:user.toPublicJSON(), accessToken, refreshToken}
    });
  } catch(err) {
    console.error('Login error:', err);
    res.status(500).json({success:false, message:'Server error.'});
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// OAUTH STATUS — returns which providers are configured
// ══════════════════════════════════════════════════════════════════════════════
router.get('/oauth-status', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      google:   !!(process.env.GOOGLE_CLIENT_ID   && process.env.GOOGLE_CLIENT_ID   !== 'YOUR_GOOGLE_CLIENT_ID'),
      facebook: !!(process.env.FACEBOOK_APP_ID    && process.env.FACEBOOK_APP_ID    !== 'YOUR_FACEBOOK_APP_ID'),
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GOOGLE OAuth — redirect errors to /auth/login
// ══════════════════════════════════════════════════════════════════════════════
router.get('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID==='YOUR_GOOGLE_CLIENT_ID') {
    return res.redirect(`${FRONTEND()}/auth/login?error=google_not_configured`);
  }
  passport.authenticate('google', {scope:['profile','email'], prompt:'select_account'})(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID==='YOUR_GOOGLE_CLIENT_ID') {
    return res.redirect(`${FRONTEND()}/auth/login?error=google_not_configured`);
  }
  passport.authenticate('google', {failureRedirect:`${FRONTEND()}/auth/login?error=google_failed`, session:true})(req, res, async (err) => {
    if (err) { console.error('Google callback error:', err.message); return res.redirect(`${FRONTEND()}/auth/login?error=google_failed`); }
    try {
      if (!req.user) return res.redirect(`${FRONTEND()}/auth/login?error=google_failed`);
      const {accessToken, refreshToken} = await issueTokens(req.user);
      res.redirect(`${FRONTEND()}/auth/social-callback?token=${accessToken}&refresh=${refreshToken}`);
    } catch(e) { res.redirect(`${FRONTEND()}/auth/login?error=server_error`); }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FACEBOOK OAuth — redirect errors to /auth/login
// ══════════════════════════════════════════════════════════════════════════════
router.get('/facebook', (req, res, next) => {
  if (!process.env.FACEBOOK_APP_ID || process.env.FACEBOOK_APP_ID==='YOUR_FACEBOOK_APP_ID') {
    return res.redirect(`${FRONTEND()}/auth/login?error=facebook_not_configured`);
  }
  passport.authenticate('facebook', {scope:['email']})(req, res, next);
});

router.get('/facebook/callback', (req, res, next) => {
  passport.authenticate('facebook', {failureRedirect:`${FRONTEND()}/auth/login?error=facebook_failed`, session:true})(req, res, async (err) => {
    if (err) return res.redirect(`${FRONTEND()}/auth/login?error=facebook_failed`);
    try {
      if (!req.user) return res.redirect(`${FRONTEND()}/auth/login?error=facebook_failed`);
      const {accessToken, refreshToken} = await issueTokens(req.user);
      res.redirect(`${FRONTEND()}/auth/social-callback?token=${accessToken}&refresh=${refreshToken}`);
    } catch(e) { res.redirect(`${FRONTEND()}/auth/login?error=server_error`); }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FORGOT / OTP / RESET
// ══════════════════════════════════════════════════════════════════════════════
router.post('/forgot-password', otpRL, async (req, res) => {
  try {
    const {email} = req.body;
    if (!email||!isValidEmail(email)) return res.status(400).json({success:false, message:'Enter a valid email.'});
    const user = await User.findOne({email:email.toLowerCase()}).select('+resetOTP +resetOTPExpires +resetOTPAttempts');
    if (!user) return res.status(200).json({success:true, message:'If registered, OTP has been sent.'});
    if (user.provider!=='local') return res.status(400).json({success:false, message:`This account uses ${user.provider} login — no password to reset.`});

    if (user.resetOTPExpires) {
      const sentAt = new Date(user.resetOTPExpires.getTime()-10*60*1000);
      if ((Date.now()-sentAt.getTime())<60000) return res.status(429).json({success:false, message:'Wait 60 seconds before requesting another OTP.'});
    }

    const otp = genOTP();
    user.resetOTP=otp; user.resetOTPExpires=new Date(Date.now()+10*60*1000);
    user.resetOTPVerified=false; user.resetOTPAttempts=0;
    await user.save({validateBeforeSave:false});

    try {
      await sendOTPEmail({to:user.email, name:user.name, otp});
      const r={success:true, message:`OTP sent to ${user.email}. Valid 10 minutes.`};
      if (process.env.NODE_ENV==='development') r.devOTP=otp;
      return res.status(200).json(r);
    } catch(emailErr) {
      user.resetOTP=null; user.resetOTPExpires=null;
      await user.save({validateBeforeSave:false});
      const r={success:false, message:'Could not send OTP.'};
      if (process.env.NODE_ENV==='development') {r.devOTP=otp; r.devError=emailErr.message;}
      return res.status(500).json(r);
    }
  } catch(err) { res.status(500).json({success:false, message:'Server error.'}); }
});

router.post('/verify-otp', async (req, res) => {
  try {
    const {email, otp} = req.body;
    if (!email||!otp) return res.status(400).json({success:false, message:'Email and OTP required.'});
    if (!/^\d{6}$/.test(otp)) return res.status(400).json({success:false, message:'OTP must be 6 digits.'});

    const user = await User.findOne({email:email.toLowerCase()}).select('+resetOTP +resetOTPExpires +resetOTPAttempts +resetOTPVerified');
    if (!user?.resetOTP) return res.status(400).json({success:false, message:'No OTP found. Request a new one.'});
    if (user.resetOTPExpires<new Date()) {
      user.resetOTP=null; user.resetOTPAttempts=0;
      await user.save({validateBeforeSave:false});
      return res.status(400).json({success:false, message:'OTP expired.', code:'OTP_EXPIRED'});
    }
    if (user.resetOTPAttempts>=5) {
      user.resetOTP=null; user.resetOTPAttempts=0;
      await user.save({validateBeforeSave:false});
      return res.status(400).json({success:false, message:'Too many attempts. Request new OTP.', code:'OTP_MAX_ATTEMPTS'});
    }
    if (user.resetOTP!==otp) {
      user.resetOTPAttempts+=1;
      await user.save({validateBeforeSave:false});
      const left=Math.max(0,5-user.resetOTPAttempts);
      return res.status(400).json({success:false, message:`Wrong OTP. ${left} attempts remaining.`, attemptsLeft:left});
    }
    user.resetOTPVerified=true; user.resetOTPAttempts=0;
    user.resetOTPExpires=new Date(Date.now()+5*60*1000);
    await user.save({validateBeforeSave:false});
    return res.status(200).json({success:true, message:'OTP verified! Set new password within 5 minutes.'});
  } catch(err) { res.status(500).json({success:false, message:'Server error.'}); }
});

router.post('/reset-password', async (req, res) => {
  try {
    const {email, password, confirmPassword} = req.body;
    if (!email) return res.status(400).json({success:false, message:'Email required.'});
    if (!password||password.length<6) return res.status(400).json({success:false, errors:[{field:'password',message:'Min 6 characters'}]});
    if (password!==confirmPassword) return res.status(400).json({success:false, errors:[{field:'confirmPassword',message:'Passwords do not match'}]});
    const user = await User.findOne({email:email.toLowerCase()}).select('+resetOTP +resetOTPExpires +resetOTPVerified +password');
    if (!user?.resetOTPVerified) return res.status(400).json({success:false, message:'Please verify OTP first.'});
    if (user.resetOTPExpires<new Date()) {
      user.resetOTPVerified=false; user.resetOTP=null;
      await user.save({validateBeforeSave:false});
      return res.status(400).json({success:false, message:'Session expired. Start over.', code:'SESSION_EXPIRED'});
    }
    user.password=password; user.resetOTP=null; user.resetOTPExpires=null;
    user.resetOTPVerified=false; user.resetOTPAttempts=0; user.refreshToken=null;
    await user.save();
    return res.status(200).json({success:true, message:'Password changed! Please login with your new password.'});
  } catch(err) { res.status(500).json({success:false, message:'Server error.'}); }
});

// ══════════════════════════════════════════════════════════════════════════════
// TOKEN / SESSION
// ══════════════════════════════════════════════════════════════════════════════
router.post('/refresh', async (req, res) => {
  try {
    const {refreshToken} = req.body;
    if (!refreshToken) return res.status(401).json({success:false, message:'Refresh token missing.'});
    let decoded;
    try { decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET||process.env.JWT_SECRET); }
    catch { return res.status(401).json({success:false, message:'Session expired. Please login again.'}); }
    const user = await User.findById(decoded.id).select('+refreshToken');
    if (!user||user.refreshToken!==refreshToken) return res.status(401).json({success:false, message:'Invalid session.'});
    const {accessToken:newAccess, refreshToken:newRefresh} = await issueTokens(user);
    res.status(200).json({success:true, data:{accessToken:newAccess, refreshToken:newRefresh}});
  } catch { res.status(401).json({success:false, message:'Session error.'}); }
});

router.post('/logout', protect, async (req, res) => {
  try {
    // Revoke the current access token so it can't be reused until it expires
    if (req.tokenJti) {
      await addToBlacklist(req.tokenJti, req.tokenExp ? req.tokenExp * 1000 : undefined).catch(() => {});
    }
    req.user.refreshToken=null;
    await req.user.save({validateBeforeSave:false});
    res.clearCookie('refreshToken', { path: '/api/auth' });
    res.status(200).json({success:true, message:'Logged out successfully.'});
  } catch { res.status(500).json({success:false, message:'Server error.'}); }
});

router.get('/me', protect, (req, res) => {
  res.status(200).json({success:true, data:{user:req.user.toPublicJSON()}});
});

router.get('/login-history', protect, (req, res) => {
  res.status(200).json({success:true, data:{history:req.user.loginHistory||[]}});
});

// ══════════════════════════════════════════════════════════════════════════════
// OWNER UPGRADE
// ══════════════════════════════════════════════════════════════════════════════
router.post('/upgrade-to-owner', protect, async (req, res) => {
  try {
    if (req.user.role==='owner') return res.status(400).json({success:false, message:'Already an owner account.'});
    const {phone, cnicNumber} = req.body;
    const errors = [];
    if (!phone||!isValidPhone(phone))   errors.push({field:'phone',     message:'Pakistani phone required (03XXXXXXXXX)'});
    if (!cnicNumber||!isValidCNIC(cnicNumber)) errors.push({field:'cnicNumber',message:'Valid CNIC required (42101-1234567-1)'});
    else {
      const check = validateCNIC(cnicNumber);
      if (!check.valid) errors.push({field:'cnicNumber',message:check.reason});
    }
    if (errors.length) return res.status(400).json({success:false, message:'Validation failed', errors});
    const cnicEx = await User.findOne({cnicNumber}).lean();
    if (cnicEx) return res.status(409).json({success:false, errors:[{field:'cnicNumber',message:'CNIC already linked to another account.'}]});
    req.user.role='owner'; req.user.phone=phone; req.user.cnicNumber=cnicNumber;
    await req.user.save({validateBeforeSave:false});
    return res.status(200).json({success:true, message:'Account upgraded to Owner! You can now list items.', data:{user:req.user.toPublicJSON()}});
  } catch(err) {
    if (err.code===11000) return res.status(409).json({success:false, message:'Phone or CNIC already registered.'});
    res.status(500).json({success:false, message:'Server error.'});
  }
});

// ── Become a Rider ───────────────────────────────────────────────────────────
router.post('/upgrade-to-rider', protect, async (req, res) => {
  try {
    if (req.user.role === 'rider') return res.status(400).json({ success:false, message:'Already a rider account.' });
    if (['admin','super_admin','manager'].includes(req.user.role)) {
      return res.status(400).json({ success:false, message:'Admin accounts cannot become riders.' });
    }
    const { phone, cnicNumber, vehicleType } = req.body;
    const allowedVehicles = ['bike','car','van'];
    const errors = [];
    if (!phone || !isValidPhone(phone))            errors.push({ field:'phone',       message:'Pakistani phone required (03XXXXXXXXX)' });
    if (!cnicNumber || !isValidCNIC(cnicNumber))   errors.push({ field:'cnicNumber',  message:'Valid CNIC required (42101-1234567-1)' });
    else { const check = validateCNIC(cnicNumber); if (!check.valid) errors.push({ field:'cnicNumber', message:check.reason }); }
    if (!vehicleType || !allowedVehicles.includes(vehicleType)) errors.push({ field:'vehicleType', message:'Choose a vehicle: bike, car, or van.' });
    if (errors.length) return res.status(400).json({ success:false, message:'Validation failed', errors });

    const cnicEx = await User.findOne({ cnicNumber, _id: { $ne: req.user._id } }).lean();
    if (cnicEx) return res.status(409).json({ success:false, errors:[{ field:'cnicNumber', message:'CNIC already linked to another account.' }] });

    req.user.role = 'rider';
    req.user.phone = phone;
    req.user.cnicNumber = cnicNumber;
    req.user.vehicleType = vehicleType;
    req.user.isAvailable = false;
    req.user.totalDeliveries = req.user.totalDeliveries || 0;
    await req.user.save({ validateBeforeSave:false });
    return res.status(200).json({ success:true, message:'You are now a Rider! Go to your Rider Dashboard to start.', data:{ user:req.user.toPublicJSON() } });
  } catch(err) {
    if (err.code === 11000) return res.status(409).json({ success:false, message:'Phone or CNIC already registered.' });
    res.status(500).json({ success:false, message:'Server error.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// VALIDATE CNIC
// ══════════════════════════════════════════════════════════════════════════════
router.post('/validate-cnic', async (req, res) => {
  const {cnicNumber} = req.body;
  if (!cnicNumber||!isValidCNIC(cnicNumber)) return res.status(400).json({success:false, message:'Invalid CNIC format (42101-1234567-1)'});
  const check = validateCNIC(cnicNumber);
  if (!check.valid) return res.status(400).json({success:false, message:check.reason});
  const exists = await User.findOne({cnicNumber}).lean();
  if (exists) return res.status(409).json({success:false, message:'CNIC already linked to another account.'});
  res.status(200).json({success:true, message:'CNIC is valid and available.'});
});

// ══════════════════════════════════════════════════════════════════════════════
// GOOGLE ONE TAP
// ══════════════════════════════════════════════════════════════════════════════
router.post('/google-onetap', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({success:false, message:'Credential missing.'});
    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    let user = await User.findOne({ email: payload.email.toLowerCase() });
    if (!user) {
      user = await User.create({
        name: payload.name, email: payload.email.toLowerCase(),
        provider: 'google', googleId: payload.sub,
        isEmailVerified: true, isActive: true, role: 'renter',
        password: crypto.randomBytes(32).toString('hex'),
      });
    }
    const {accessToken, refreshToken} = await issueTokens(user);
    return res.status(200).json({success:true, data:{user:user.toPublicJSON(), accessToken, refreshToken}});
  } catch(err) {
    console.error('One Tap error:', err.message);
    res.status(401).json({success:false, message:'Google One Tap failed.'});
  }
});


// ══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/verify-registration-otp
// Verifies the OTP sent after registration (replaces email link flow)
// ══════════════════════════════════════════════════════════════════════════════
router.post('/verify-registration-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success:false, message:'Email and OTP required.' });
    if (!/^\d{6}$/.test(otp)) return res.status(400).json({ success:false, message:'OTP must be 6 digits.' });

    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+emailToken +emailTokenExpires');

    if (!user) return res.status(404).json({ success:false, message:'Account not found.' });
    if (user.isEmailVerified) return res.status(200).json({ success:true, message:'Email already verified! Please login.' });

    // emailToken is used as OTP for registration
    if (!user.emailToken) return res.status(400).json({ success:false, message:'No verification code found. Please resend.', code:'OTP_INVALID' });

    // Expired?
    if (!user.emailTokenExpires || user.emailTokenExpires < new Date()) {
      return res.status(400).json({ success:false, message:'Code expired. Please resend.', code:'OTP_EXPIRED' });
    }

    // Wrong OTP?
    if (user.emailToken !== otp) {
      // Track attempts using resetOTPAttempts field
      user.resetOTPAttempts = (user.resetOTPAttempts || 0) + 1;
      await user.save({ validateBeforeSave: false });
      if (user.resetOTPAttempts >= 5) {
        user.emailToken = null; user.emailTokenExpires = null; user.resetOTPAttempts = 0;
        await user.save({ validateBeforeSave: false });
        return res.status(400).json({ success:false, message:'Too many wrong attempts. Please resend a new code.', code:'OTP_MAXED' });
      }
      const left = Math.max(0, 5 - user.resetOTPAttempts);
      return res.status(400).json({ success:false, message:`Wrong code. ${left} attempt${left===1?'':'s'} remaining.`, code:'OTP_INVALID', attemptsLeft: left });
    }

    // Correct — verify email
    user.isEmailVerified = true;
    user.isActive = true;
    user.emailToken = null;
    user.emailTokenExpires = null;
    user.resetOTPAttempts = 0;
    await user.save({ validateBeforeSave: false });

    sendWelcomeEmail({ to: user.email, name: user.name, role: user.role }).catch(() => {});

    return res.status(200).json({ success:true, message:'Email verified successfully! You can now login.' });
  } catch(err) {
    console.error('Verify registration OTP error:', err);
    res.status(500).json({ success:false, message:'Server error.' });
  }
});


// POST /api/auth/check-email — realtime duplicate email check
router.post('/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !isValidEmail(email)) return res.status(400).json({ exists: false });
    const user = await User.findOne({ email: email.toLowerCase() }).lean();
    return res.status(200).json({ exists: !!user });
  } catch { res.status(200).json({ exists: false }); }
});


// ── Profile Routes ────────────────────────────────────────────────────────────
const multer  = require('multer');
const cloudinary = require('cloudinary').v2;

// Multer memory storage for avatar
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'), false);
  },
}).single('avatar');

// GET /api/auth/me
router.get('/me', protect, (req, res) => {
  res.status(200).json({ success: true, data: { user: req.user.toPublicJSON() } });
});

// GET /api/auth/login-history
router.get('/login-history', protect, (req, res) => {
  res.status(200).json({ success: true, data: { history: req.user.loginHistory || [] } });
});

// PUT /api/auth/profile — update name, phone & address
router.put('/profile', protect, async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    if (!name || name.trim().length < 2)
      return res.status(400).json({ success: false, message: 'Name must be at least 2 characters' });

    const updateFields = {
      name: name.trim(),
      ...(phone !== undefined && { phone: phone || null }),
      ...(address !== undefined && { address: address ? address.trim() : null }),
    };

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateFields,
      { new: true, runValidators: true }
    ).select('-password -refreshToken');

    res.json({ success: true, message: 'Profile updated', data: { user: user.toPublicJSON() } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/auth/profile/password — change password
router.put('/profile/password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ success: false, message: 'Both passwords required' });
    if (newPassword.length < 8)
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });

    const user = await User.findById(req.user._id).select('+password');
    const valid = await user.comparePassword(currentPassword);
    if (!valid)
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });

    user.password = newPassword;
    user.refreshToken = null; // Invalidate all sessions
    await user.save();

    res.json({ success: true, message: 'Password changed successfully. Please log in again.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/auth/profile/avatar — upload avatar to Cloudinary
router.put('/profile/avatar', protect, (req, res) => {
  avatarUpload(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    if (!req.file) return res.status(400).json({ success: false, message: 'No image provided' });

    try {
      const user = await User.findById(req.user._id);

      // Delete old avatar from Cloudinary if exists
      if (user.avatarPublicId) {
        await cloudinary.uploader.destroy(user.avatarPublicId).catch(() => {});
      }

      // Upload new avatar
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'rentify/avatars',
            transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
          },
          (error, result) => error ? reject(error) : resolve(result)
        );
        stream.end(req.file.buffer);
      });

      user.avatar = result.secure_url;
      user.avatarPublicId = result.public_id;
      await user.save({ validateBeforeSave: false });

      res.json({ success: true, message: 'Avatar updated', data: { avatar: user.avatar } });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SPEC-NAMED ALIASES
// These mirror the canonical routes above under the names some clients expect,
// so both URL styles work without breaking the existing frontend.
//   POST /register          → same as /register/renter
//   POST /refresh-token     → same as /refresh
//   GET  /verify-email/:token → same as /verify-email?token=
//   GET  /profile           → same as /me
// ══════════════════════════════════════════════════════════════════════════════

// POST /register  → default to renter registration
router.post('/register', registerRL, (req, res, next) => {
  req.url = '/register/renter';
  router.handle(req, res, next);
});

// POST /refresh-token  → alias of /refresh
router.post('/refresh-token', (req, res, next) => {
  req.url = '/refresh';
  router.handle(req, res, next);
});

// GET /verify-email/:token  → alias of /verify-email?token=
router.get('/verify-email/:token', (req, res, next) => {
  req.query.token = req.params.token;
  req.url = '/verify-email';
  router.handle(req, res, next);
});

// GET /profile  → alias of /me
router.get('/profile', protect, (req, res) => {
  res.status(200).json({ success: true, data: { user: req.user.toPublicJSON() } });
});

// GET /api/auth/referral — this user's shareable referral code + real stats.
// Generates the code on first request rather than at signup, since most
// users never visit a referral page and we don't want to pre-burn a unique
// code+index slot for every signup regardless of whether they'll use it.
router.get('/referral', protect, async (req, res) => {
  try {
    const { ensureReferralCode } = require('../services/referral.service');
    const code = await ensureReferralCode(req.user._id);

    const { Transaction } = require('../models/Transaction');
    const [referredCount, rewardAgg] = await Promise.all([
      User.countDocuments({ referredBy: req.user._id }),
      Transaction.aggregate([
        { $match: { user: req.user._id, type: 'referral_bonus', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    return res.json({
      success: true,
      data: {
        referralCode: code,
        referredCount,
        totalRewardEarned: rewardAgg[0]?.total || 0,
      },
    });
  } catch (err) {
    console.error('[auth.referral]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load referral info.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// DEVICE BIOMETRIC LOGIN (WebAuthn) — fingerprint / Face ID / Windows Hello
// A convenience layer over password login, registered while already signed
// in, then usable instead of typing a password on that same device.
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/auth/webauthn/devices — list this user's registered devices
router.get('/webauthn/devices', protect, (req, res) => {
  const devices = (req.user.webauthnCredentials || []).map(c => ({
    credentialId: c.credentialId,
    deviceLabel: c.deviceLabel,
    addedAt: c.addedAt,
    lastUsedAt: c.lastUsedAt,
  }));
  return res.json({ success: true, data: devices });
});

// DELETE /api/auth/webauthn/devices/:credentialId — remove a registered device
router.delete('/webauthn/devices/:credentialId', protect, async (req, res) => {
  try {
    const before = req.user.webauthnCredentials.length;
    req.user.webauthnCredentials = req.user.webauthnCredentials.filter(
      c => c.credentialId !== req.params.credentialId
    );
    if (req.user.webauthnCredentials.length === before) {
      return res.status(404).json({ success: false, message: 'Device not found.' });
    }
    await req.user.save({ validateBeforeSave: false });
    return res.json({ success: true, message: 'Device removed.' });
  } catch (err) {
    console.error('[webauthn.removeDevice]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to remove device.' });
  }
});

// POST /api/auth/webauthn/register-options — step 1 of adding a new device
// (must already be logged in via password — this is how a device gets
// linked to an account in the first place).
router.post('/webauthn/register-options', protect, async (req, res) => {
  try {
    const { getRegistrationOptions } = require('../services/webauthn.service');
    const options = await getRegistrationOptions(req.user);
    return res.json({ success: true, data: options });
  } catch (err) {
    console.error('[webauthn.registerOptions]', err.message);
    return res.status(500).json({ success: false, message: 'Could not start device registration.' });
  }
});

// POST /api/auth/webauthn/register-verify — step 2 of adding a new device
router.post('/webauthn/register-verify', protect, async (req, res) => {
  try {
    const { verifyRegistration } = require('../services/webauthn.service');
    const { response, deviceLabel } = req.body;
    const credential = await verifyRegistration(req.user, response);

    req.user.webauthnCredentials.push({
      ...credential,
      deviceLabel: deviceLabel?.trim().slice(0, 60) || 'My device',
    });
    await req.user.save({ validateBeforeSave: false });

    return res.json({ success: true, message: 'Biometric login enabled for this device.' });
  } catch (err) {
    console.error('[webauthn.registerVerify]', err.message);
    return res.status(400).json({ success: false, message: err.message || 'Could not verify this device.' });
  }
});

// POST /api/auth/webauthn/login-options — step 1 of logging in with biometrics.
// Scoped by email since there's no session yet — the user picks "use
// biometrics" after typing/autofilling their email, same UX pattern as most
// banking apps ("enter email, then Face ID instead of password").
router.post('/webauthn/login-options', loginRL, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email required.' });

    const user = await User.findOne({ email: email.toLowerCase() }).select('+webauthnCredentials');
    // Deliberately vague error either way — don't reveal whether the email
    // exists or just lacks a registered device, same anti-enumeration
    // posture as the rest of the auth system.
    if (!user || !user.webauthnCredentials?.length) {
      return res.status(400).json({ success: false, message: 'Biometric login is not set up for this account.' });
    }

    const { getLoginOptions } = require('../services/webauthn.service');
    const options = await getLoginOptions(user);
    return res.json({ success: true, data: options });
  } catch (err) {
    console.error('[webauthn.loginOptions]', err.message);
    return res.status(500).json({ success: false, message: 'Could not start biometric login.' });
  }
});

// POST /api/auth/webauthn/login-verify — step 2 of logging in with biometrics.
// On success, issues the same JWT pair a password login would.
router.post('/webauthn/login-verify', loginRL, async (req, res) => {
  try {
    const { email, response } = req.body;
    if (!email || !response) return res.status(400).json({ success: false, message: 'Email and response required.' });

    const user = await User.findOne({ email: email.toLowerCase() }).select('+webauthnCredentials +isLocked +lockUntil');
    if (!user) return res.status(401).json({ success: false, message: 'Biometric login failed.' });

    if (user.isAccountLocked()) {
      const mins = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({ success: false, message: `Account locked. Try again in ${mins} minutes.`, code: 'ACCOUNT_LOCKED' });
    }
    if (!user.isActive)  return res.status(403).json({ success: false, message: 'Account deactivated.', code: 'ACCOUNT_INACTIVE' });
    if (user.isSuspended) return res.status(403).json({ success: false, message: `Account suspended: ${user.suspendReason || 'Policy violation'}`, code: 'ACCOUNT_SUSPENDED' });

    const { verifyLogin } = require('../services/webauthn.service');
    const { credentialId, newCounter } = await verifyLogin(user, response);

    // Update counter + lastUsedAt on the matched credential (replay-attack
    // protection — see verifyAuthenticationResponse's docs).
    const cred = user.webauthnCredentials.find(c => c.credentialId === credentialId);
    if (cred) { cred.counter = newCounter; cred.lastUsedAt = new Date(); }
    await user.save({ validateBeforeSave: false });

    const device = getDevice(req);
    await user.recordSuccessLogin(device);
    const { accessToken, refreshToken } = await issueTokens(user);

    return res.status(200).json({
      success: true,
      message: `Welcome back, ${user.name}!`,
      data: { user: user.toPublicJSON(), accessToken, refreshToken },
    });
  } catch (err) {
    console.error('[webauthn.loginVerify]', err.message);
    return res.status(401).json({ success: false, message: err.message || 'Biometric login failed.' });
  }
});


// GET /api/auth/public-profile/:userId — public owner profile card.
// No auth required (renters browsing can view an owner's profile without
// logging in) but optionalAuth still attaches req.user if a token is present,
// in case future personalization (e.g. "message" button state) needs it.
router.get('/public-profile/:userId', require('../middleware/auth').optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!require('mongoose').Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID.' });
    }

    const owner = await User.findOne({ _id: userId, role: { $in: ['owner', 'renter'] } })
      .select('name avatar role cnicVerified trustScore trustBadge createdAt address');
    if (!owner) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const { Listing } = require('../models/Listing');
    const { Booking } = require('../models/Booking');
    const Review = require('../models/Review');
    const { getOwnerResponseRate } = require('../services/responseRate.service');

    const [activeListingsCount, completedBookingsCount, reviewStats, responseRateData] = await Promise.all([
      Listing.countDocuments({ createdBy: userId, isDeleted: false, status: 'active' }),
      Booking.countDocuments({ owner: userId, status: 'completed' }),
      Review.getUserStats(userId, 'renter_to_owner'),
      owner.role === 'owner' ? getOwnerResponseRate(userId) : Promise.resolve(null),
    ]);

    return res.json({
      success: true,
      data: {
        user: {
          id: owner._id,
          name: owner.name,
          avatar: owner.avatar,
          role: owner.role,
          cnicVerified: owner.cnicVerified,
          trustScore: owner.role === 'owner' ? (owner.trustScore || 0) : undefined,
          trustBadge: owner.role === 'owner' ? (owner.trustBadge || 'none') : undefined,
          memberSince: owner.createdAt,
          address: owner.address || null,
        },
        stats: {
          activeListings: activeListingsCount,
          completedRentals: completedBookingsCount,
          avgRating: reviewStats.avgRating,
          reviewCount: reviewStats.totalCount,
          // null for renters (the concept doesn't apply) rather than a fake 0
          responseRate: responseRateData ? responseRateData.responseRate : null,
        },
      },
    });
  } catch (err) {
    console.error('[auth.publicProfile]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load profile.' });
  }
});

// PUT /api/auth/fcm-token — save device FCM push token
router.put('/fcm-token', protect, async (req, res) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(400).json({ success: false, message: 'fcmToken required' });
    await User.findByIdAndUpdate(req.user._id, { fcmToken });
    res.json({ success: true, message: 'FCM token saved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/auth/fcm-token — remove FCM token on logout
router.delete('/fcm-token', protect, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { fcmToken: null });
    res.json({ success: true, message: 'FCM token removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;