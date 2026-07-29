'use strict';
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { isBlacklisted } = require('./tokenBlacklist');

// ── Core protect middleware ───────────────────────────────────────────────────
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Access denied. Please login.', code: 'NO_TOKEN' });
    }

    const token = authHeader.slice(7);
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Session expired. Please login again.', code: 'TOKEN_EXPIRED' });
      }
      return res.status(401).json({ success: false, message: 'Invalid token. Please login again.', code: 'INVALID_TOKEN' });
    }

    // Reject revoked (logged-out) tokens
    if (decoded.jti && await isBlacklisted(decoded.jti)) {
      return res.status(401).json({ success: false, message: 'Session has been revoked. Please login again.', code: 'TOKEN_REVOKED' });
    }
    req.tokenJti = decoded.jti;          // for downstream checkBlacklist / logout
    req.tokenExp = decoded.exp;          // seconds since epoch

    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ success: false, message: 'Account not found.', code: 'USER_NOT_FOUND' });

    if (!user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Email verification required. Please verify your email.',
        code: 'EMAIL_NOT_VERIFIED',
        email: user.email
      });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account deactivated. Contact support.', code: 'ACCOUNT_INACTIVE' });
    }

    if (user.isSuspended) {
      return res.status(403).json({
        success: false,
        message: `Account suspended. Reason: ${user.suspendReason || 'Policy violation'}`,
        code: 'ACCOUNT_SUSPENDED'
      });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    return res.status(500).json({ success: false, message: 'Authentication error.' });
  }
};

// ── Owner only ────────────────────────────────────────────────────────────────
const ownerOnly = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Login required.', code: 'NO_TOKEN' });
  if (req.user.role !== 'owner') {
    return res.status(403).json({
      success: false,
      message: 'Owner account required. Please register as an Owner.',
      code: 'OWNER_REQUIRED'
    });
  }
  if (!req.user.cnicVerified) {
    return res.status(403).json({
      success: false,
      message: 'CNIC verification required for owner features.',
      code: 'CNIC_NOT_VERIFIED'
    });
  }
  next();
};

// ── Rider only (role must be exactly 'rider') ─────────────────────────────────
const riderOnly = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Login required.', code: 'NO_TOKEN' });
  if (req.user.role !== 'rider') {
    return res.status(403).json({ success: false, message: 'Rider access only.' });
  }
  next();
};

// ── Admin only (role must be 'admin' or 'super_admin') ────────────────────────
const adminOnly = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Login required.', code: 'NO_TOKEN' });
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ success: false, message: 'Admin access only.' });
  }
  next();
};

// ── Role check middleware factory ─────────────────────────────────────────────
// A user whose role grants the '*' wildcard permission (e.g. admin/super_admin)
// always passes, regardless of the explicitly required roles.
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Login required.' });

  // Wildcard bypass: super-roles can do anything
  const hasWildcard = typeof req.user.hasPermission === 'function' && req.user.hasPermission('*');
  if (hasWildcard || req.user.role === 'admin' || req.user.role === 'super_admin') {
    return next();
  }

  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `This feature requires ${roles.join(' or ')} role.`,
      code: 'INSUFFICIENT_ROLE',
      yourRole: req.user.role,
      requiredRoles: roles
    });
  }
  next();
};

// ── Permission check middleware factory ──────────────────────────────────────
const requirePermission = (permission) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Login required.' });
  if (!req.user.hasPermission(permission)) {
    return res.status(403).json({
      success: false,
      message: `Permission denied: ${permission}`,
      code: 'PERMISSION_DENIED',
      required: permission
    });
  }
  next();
};

// ── Optional auth ─────────────────────────────────────────────────────────────
const optionalAuth = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (user?.isActive && user?.isEmailVerified) req.user = user;
    }
  } catch (_) {}
  next();
};

// ── Verify email is confirmed ────────────────────────────────────────────────
const requireVerifiedEmail = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Login required.' });
  if (!req.user.isEmailVerified) {
    return res.status(403).json({
      success: false,
      message: 'Email not verified.',
      code: 'EMAIL_NOT_VERIFIED'
    });
  }
  next();
};

// ── Verify refresh token from HTTP-only cookie ────────────────────────────────
const verifyRefreshToken = (token) => {
  return jwt.verify(
    token,
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
  );
};

// ── Sign a short-lived access token (15 min) with a unique jti for revocation ─
const signAccessToken = (id) =>
  jwt.sign({ id, jti: crypto.randomUUID() }, process.env.JWT_SECRET, { expiresIn: '15m' });

// ── Sign a long-lived refresh token (30 days) with a unique jti ──────────────
const signRefreshToken = (id) =>
  jwt.sign(
    { id, jti: crypto.randomUUID() },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

// ── Cookie options ────────────────────────────────────────────────────────────
const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
  path: '/api/auth',
};

module.exports = {
  protect,
  ownerOnly,
  riderOnly,
  adminOnly,
  requireRole,
  requirePermission,
  optionalAuth,
  requireVerifiedEmail,
  verifyRefreshToken,
  signAccessToken,
  signRefreshToken,
  refreshCookieOptions,
};
