'use strict';
/**
 * Audit Log Middleware — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Records privileged admin actions to the `auditlogs` collection for
 * accountability and forensics.
 *
 *   logAdminAction(action, targetModel)  → middleware factory; wraps a route so
 *                                           that a successful (2xx) response is
 *                                           recorded with who/what/when/where.
 *
 * The log is written AFTER the response is sent (on the 'finish' event), so it
 * never blocks or breaks the request, and only successful actions are stored.
 *
 * Schema: { adminId, action, targetModel, targetId, changes, ip, userAgent, timestamp }
 * ─────────────────────────────────────────────────────────────────────────────
 */
const AuditLog = require('../models/AuditLog');

// ── Extract the affected document id from params/body/response ────────────────
const resolveTargetId = (req) =>
  req.params?.id || req.params?.userId || req.params?.listingId
  || req.params?.bookingId || req.body?.id || null;

const getClientIp = (req) =>
  (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  || req.ip || req.socket?.remoteAddress || null;

/**
 * Middleware factory.
 * @param {string} action       short action code, e.g. 'USER_SUSPEND'
 * @param {string} targetModel  model name the action affects, e.g. 'User'
 */
const logAdminAction = (action, targetModel) => (req, res, next) => {
  // Capture request-time context (req.body can be mutated by the controller)
  const ctx = {
    adminId:     req.user?._id,
    action,
    targetModel,
    targetId:    resolveTargetId(req),
    before:      null,                       // optionally set by controller via req.auditBefore
    after:       sanitizeChanges(req.body),  // intended change payload
    ip:          getClientIp(req),
    userAgent:   req.headers['user-agent'] || null,
  };

  // Write only after a successful response, and never block the request.
  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;   // only successes
    if (!ctx.adminId) return;                                    // must be authed admin
    // Controller may attach snapshots: req.auditBefore / req.auditAfter
    if (req.auditBefore !== undefined) ctx.before = req.auditBefore;
    if (req.auditAfter  !== undefined) ctx.after  = req.auditAfter;
    AuditLog.create(ctx)
      .catch(err => console.error('[auditLog] write failed:', err.message));
  });

  next();
};

// Never log secrets even if they appear in a body
const sanitizeChanges = (body) => {
  if (!body || typeof body !== 'object') return undefined;
  const REDACT = ['password', 'newPassword', 'token', 'refreshToken', 'otp'];
  const copy = {};
  for (const [k, v] of Object.entries(body)) {
    copy[k] = REDACT.includes(k) ? '[REDACTED]' : v;
  }
  return copy;
};

module.exports = { logAdminAction };
