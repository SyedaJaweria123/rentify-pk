'use strict';
/**
 * AuditLog Model — Rentify PK
 * Immutable record of privileged admin actions for accountability & forensics.
 * Captures before/after snapshots of the affected document.
 *
 * Schema: { adminId, action, targetModel, targetId, before, after, ip, userAgent } + timestamps
 * Indexes: adminId, action, (adminId + createdAt)
 */
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    adminId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action:      { type: String, required: true, index: true },                 // e.g. 'USER_SUSPEND'
    targetModel: { type: String, default: null },                               // e.g. 'User', 'Listing'
    targetId:    { type: mongoose.Schema.Types.ObjectId, default: null },        // affected document id
    before:      { type: mongoose.Schema.Types.Mixed, default: null },          // snapshot pre-change
    after:       { type: mongoose.Schema.Types.Mixed, default: null },          // snapshot post-change
    ip:          { type: String, default: null },
    userAgent:   { type: String, default: null },
  },
  { timestamps: true, versionKey: false }
);

auditLogSchema.index({ adminId: 1, createdAt: -1 });

module.exports = mongoose.models.AuditLog
  || mongoose.model('AuditLog', auditLogSchema);
