'use strict';
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ROUNDS   = parseInt(process.env.BCRYPT_ROUNDS         || '10', 10);
const MAX_ATT  = parseInt(process.env.MAX_LOGIN_ATTEMPTS    || '5',  10);
const LOCK_MIN = parseInt(process.env.LOCK_DURATION_MINUTES || '30', 10);

const ROLE_PERMISSIONS = {
  owner:  ['list_items','edit_items','delete_items','view_bookings','manage_bookings',
            'view_earnings','verify_renters','view_analytics','manage_profile',
            'view_dashboard','withdraw_funds'],
  renter: ['browse_items','book_items','view_own_bookings','write_reviews',
            'manage_profile','view_dashboard'],
  rider:  ['view_assignments','accept_assignments','update_delivery_status',
            'scan_qr','upload_evidence','manage_profile','view_dashboard',
            'view_earnings','withdraw_funds'],
  admin:        ['*'],
  super_admin:  ['*'],
  manager:      ['*'],
  support:      ['view_dashboard','view_bookings','manage_profile'],
};

const loginEventSchema = new mongoose.Schema({
  ip: String, browser: String, os: String, device: String,
  status: { type: String, enum: ['success','failed'] },
  at: { type: Date, default: Date.now }
}, { _id: false });

const userSchema = new mongoose.Schema({
  // ── Core ─────────────────────────────────────────────────
  name:     { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:    { type: String },
  address:  { type: String, trim: true, maxlength: 300, default: null },   // owner pickup address (house, street, area, city)
  password: { type: String, default: null, select: false },
  role:     { type: String, enum: ['renter','owner','rider','admin','super_admin','manager','support'], default: 'renter', required: true },

  // ── Social OAuth ──────────────────────────────────────────
  googleId:   { type: String, sparse: true },
  facebookId: { type: String, sparse: true },
  avatar:     { type: String, default: null },
  provider:   { type: String, enum: ['local','google','facebook'], default: 'local' },

  // ── CNIC Verification (JazzCash-style) ───────────────────
  cnicNumber:       { type: String, sparse: true },
  cnicVerified:     { type: Boolean, default: false },
  cnicRejected:     { type: Boolean, default: false },
  cnicRejectReason: { type: String,  default: null },
  // How many times this account's CNIC submission has been rejected
  // (either auto-rejected by face-match or rejected by an admin). Used to
  // apply a short cooldown after repeated failures — slows down repeated
  // bad-faith attempts without permanently locking out someone who
  // genuinely keeps taking blurry photos.
  cnicRejectionCount: { type: Number, default: 0, min: 0 },
  cnicCooldownUntil:  { type: Date,   default: null },
  cnicImageFront:   { type: String,  default: null }, // uploaded image URL
  cnicImageBack:    { type: String,  default: null },
  cnicSelfie:       { type: String,  default: null }, // selfie image URL
  // Face-match result from comparing the CNIC photo against the selfie —
  // recorded automatically on every /cnic/submit, regardless of whether it
  // ends up triggering an auto-reject. null until a match has been run.
  cnicFaceMatchScore: { type: Number, default: null, min: 0, max: 100 },
  cnicFaceMatchAt:    { type: Date,   default: null },
  cnicFaceMatchNote:  { type: String, default: null }, // short AI reasoning, for admin review
  cnicSubmittedAt:  { type: Date,    default: null },
  cnicVerifiedAt:   { type: Date,    default: null },
  cnicVerifiedBy:   { type: String,  default: null }, // admin ID
  // Validation score from our engine (0-100)
  cnicValidationScore: { type: Number, default: 0 },
  cnicProvince:        { type: String, default: null },
  cnicGender:          { type: String, default: null },
  cnicConsent:         { type: Boolean, default: false }, // user agreed to CNIC processing
  cnicConsentAt:       { type: Date,    default: null },

  // ── Owner Approval ────────────────────────────────────────
  ownerApproved:   { type: Boolean, default: false },
  ownerApprovedAt: { type: Date,    default: null },

  // ── Rider (delivery agent) ────────────────────────────────
  isAvailable:    { type: Boolean, default: false },   // accepting deliveries right now?
  currentLocation: {
    type:        { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] },  // [lng, lat] (GeoJSON order)
  },
  riderRating:     { type: Number, default: 0, min: 0, max: 5 },
  totalDeliveries: { type: Number, default: 0, min: 0 },
  vehicleType:     { type: String, enum: ['bike','car','van','bicycle','foot'], default: 'bike' },

  // ── Referral Program ───────────────────────────────────────
  // Every user gets a unique shareable code (generated on first use, not at
  // signup, to avoid burning index space for users who never check the
  // referral page). referredBy is set once, at signup, from whoever's code
  // was used — never changes after that.
  referralCode:    { type: String, default: null, unique: true, sparse: true },
  referredBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  referralRewardEarned: { type: Number, default: 0, min: 0 }, // total Rs credited to this user from referrals they made

  // ── Device Biometric Login (WebAuthn) ──────────────────────
  // A user can register multiple devices (phone fingerprint, laptop face
  // unlock, etc.) — each gets its own credential entry here. This is a
  // convenience login method layered on top of the existing password login,
  // not a replacement: it proves "this is the same device/browser that
  // registered", not identity in the CNIC-verification sense.
  webauthnCredentials: {
    type: [{
      credentialId:  { type: String, required: true }, // base64url, unique per credential
      publicKey:     { type: String, required: true }, // base64url
      counter:       { type: Number, default: 0 },      // replay-attack protection
      deviceLabel:   { type: String, default: 'My device' }, // e.g. "iPhone — Safari", user-editable
      transports:    { type: [String], default: [] },   // e.g. ['internal', 'hybrid']
      addedAt:       { type: Date, default: Date.now },
      lastUsedAt:    { type: Date, default: null },
    }],
    default: [],
  },

  // ── Account Status ────────────────────────────────────────
  isActive:        { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },
  isSuspended:     { type: Boolean, default: false },
  suspendReason:   { type: String,  default: null },

  // ── Security ──────────────────────────────────────────────
  isLocked:       { type: Boolean, default: false },
  lockUntil:      { type: Date,    default: null },
  failedAttempts: { type: Number,  default: 0 },
  lastLoginAt:    { type: Date,    default: null },
  loginHistory:   { type: [loginEventSchema], default: [] },

  // ── Email Verification ────────────────────────────────────
  emailToken:        { type: String, default: null, select: false },
  emailTokenExpires: { type: Date,   default: null },

  // ── OTP Reset ─────────────────────────────────────────────
  resetOTP:         { type: String,  default: null, select: false },
  resetOTPExpires:  { type: Date,    default: null },
  resetOTPVerified: { type: Boolean, default: false },
  resetOTPAttempts: { type: Number,  default: 0 },

  // ── JWT ───────────────────────────────────────────────────
  refreshToken: { type: String, default: null, select: false },

  walletBalance: { type: Number, default: 0 },

  // 25002500 FCM Push Token (device token for push notifications) 250025002500250025002500250025002500250025002500250025002500250025002500250025002500
  fcmToken: { type: String, default: null, select: false },

  // ── Owner trust score (0–100) + badge tier (computed from real activity) ──────
  trustScore:          { type: Number, default: 0, min: 0, max: 100 },
  trustBadge:          { type: String, enum: ['none', 'Bronze', 'Silver', 'Gold'], default: 'none' },
  trustScoreUpdatedAt: { type: Date,   default: null },
}, { timestamps: true });

// ── Indexes ───────────────────────────────────────────────────────────────────
userSchema.index({ email: 1 });
userSchema.index({ googleId:   1 }, { sparse: true });
userSchema.index({ facebookId: 1 }, { sparse: true });
userSchema.index({ cnicNumber: 1 }, { sparse: true, unique: true });
userSchema.index({ phone: 1 }, {
  unique: true,
  partialFilterExpression: { phone: { $type: 'string' } }
});
// Admin queue index — pending CNIC verifications
userSchema.index({ cnicVerified: 1, cnicRejected: 1, role: 1 });
userSchema.index({ currentLocation: '2dsphere' });   // geo queries: nearest available riders
userSchema.index({ role: 1, isAvailable: 1 });        // quick "available riders" lookup
userSchema.index({ 'webauthnCredentials.credentialId': 1 }, { unique: true, sparse: true }); // fast login lookup by credential

// ── Pre-save: hash password ───────────────────────────────────────────────────
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, ROUNDS);
  next();
});

// ── Methods ───────────────────────────────────────────────────────────────────
userSchema.methods.comparePassword = function(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.isAccountLocked = function() {
  if (!this.isLocked) return false;
  if (this.lockUntil && this.lockUntil <= Date.now()) {
    this.isLocked = false; this.failedAttempts = 0; this.lockUntil = null;
    this.save({ validateBeforeSave: false }).catch(() => {});
    return false;
  }
  return true;
};

userSchema.methods.recordFailedLogin = async function(info = {}) {
  this.failedAttempts = (this.failedAttempts || 0) + 1;
  this.loginHistory.unshift({ ...info, status: 'failed' });
  if (this.loginHistory.length > 10) this.loginHistory = this.loginHistory.slice(0, 10);
  if (this.failedAttempts >= MAX_ATT) {
    this.isLocked = true;
    this.lockUntil = new Date(Date.now() + LOCK_MIN * 60 * 1000);
  }
  await this.save({ validateBeforeSave: false });
};

userSchema.methods.recordSuccessLogin = async function(info = {}) {
  this.failedAttempts = 0; this.isLocked = false; this.lockUntil = null;
  this.lastLoginAt = new Date();
  this.loginHistory.unshift({ ...info, status: 'success' });
  if (this.loginHistory.length > 10) this.loginHistory = this.loginHistory.slice(0, 10);
  await this.save({ validateBeforeSave: false });
};

userSchema.methods.hasPermission = function(permission) {
  const perms = ROLE_PERMISSIONS[this.role] || [];
  if (perms.includes('*')) return true;       // wildcard → admin/super_admin/manager
  return perms.includes(permission);
};

userSchema.methods.getPermissions = function() {
  return ROLE_PERMISSIONS[this.role] || [];
};

userSchema.methods.getCNICStatus = function() {
  if (!this.cnicNumber)    return { status: 'not_provided', label: 'Not Provided',   color: 'gray'   };
  if (this.cnicVerified)   return { status: 'verified',     label: 'Verified',        color: 'green'  };
  if (this.cnicRejected)   return { status: 'rejected',     label: 'Rejected',        color: 'red',   reason: this.cnicRejectReason };
  return                          { status: 'pending',      label: 'Pending Review',  color: 'yellow' };
};

userSchema.methods.toPublicJSON = function() {
  return {
    id:              this._id,
    name:            this.name,
    email:           this.email,
    phone:           this.phone || null,
    address:         this.address || null,
    role:            this.role,
    avatar:          this.avatar,
    provider:        this.provider,
    isEmailVerified: this.isEmailVerified,
    isActive:        this.isActive,
    isSuspended:     this.isSuspended,
    // CNIC info
    cnicVerified:         this.cnicVerified,
    cnicStatus:           this.getCNICStatus(),
    cnicProvince:         this.cnicProvince,
    cnicGender:           this.cnicGender,
    cnicValidationScore:  this.cnicValidationScore,
    // Owner
    ownerApproved:   this.role === 'owner' ? this.ownerApproved : undefined,
    trustScore:      this.role === 'owner' ? (this.trustScore || 0) : undefined,
    trustBadge:      this.role === 'owner' ? (this.trustBadge || 'none') : undefined,
    // Rider
    isAvailable:     this.role === 'rider' ? this.isAvailable : undefined,
    currentLocation: this.role === 'rider' ? this.currentLocation : undefined,
    riderRating:     this.role === 'rider' ? this.riderRating : undefined,
    totalDeliveries: this.role === 'rider' ? this.totalDeliveries : undefined,
    vehicleType:     this.role === 'rider' ? this.vehicleType : undefined,
    permissions:     this.getPermissions(),
    walletBalance:   this.walletBalance,
    lastLoginAt:     this.lastLoginAt,
    createdAt:       this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
