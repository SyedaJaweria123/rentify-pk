'use strict';
/**
 * InspectionReport Model — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Photo/video condition report captured at delivery and return, with optional
 * AI analysis (condition/damage scoring + detected issues). Comparing the
 * delivery vs return reports is how damage is objectively assessed.
 *
 * Indexes: booking, type
 * ─────────────────────────────────────────────────────────────────────────────
 */
const mongoose = require('mongoose');

// Four handover points, one per leg of the item's journey:
//   pickup          owner  → rider    (rider collects from owner)
//   delivery        rider  → renter   (rider hands over to renter)
//   return_pickup   renter → rider    (rider collects back from renter)
//   return_delivery rider  → owner    (rider returns to owner)
// Comparing adjacent pairs isolates WHO was holding the item when damage
// appeared, instead of the old delivery↔return gap that blamed the renter for
// anything that happened in transit.
// 'delivery' and 'return' keep their original meaning so existing reports and
// the current renter/rider flows continue to work unchanged.
const INSPECTION_TYPES   = ['pickup', 'delivery', 'return_pickup', 'return', 'return_delivery'];
const PHOTO_ANGLES       = ['front', 'back', 'left', 'right', 'top', 'detail'];
const ISSUE_SEVERITY     = ['low', 'medium', 'high'];
const OVERALL_CONDITION  = ['excellent', 'good', 'fair', 'poor', 'damaged'];

const photoSchema = new mongoose.Schema(
  {
    url:      { type: String, required: true },
    publicId: { type: String, required: true },
    angle:    { type: String, enum: PHOTO_ANGLES, default: 'detail' },
  },
  { _id: false }
);

const detectedIssueSchema = new mongoose.Schema(
  {
    type:        { type: String, trim: true },          // e.g. 'scratch', 'dent', 'stain'
    severity:    { type: String, enum: ISSUE_SEVERITY, default: 'low' },
    description: { type: String, trim: true, default: '' },
    location:    { type: String, trim: true, default: '' },  // e.g. 'rear-left panel'
  },
  { _id: false }
);

const aiAnalysisSchema = new mongoose.Schema(
  {
    conditionScore:  { type: Number, min: 0, max: 100, default: null },
    damageScore:     { type: Number, min: 0, max: 100, default: null },
    confidenceScore: { type: Number, min: 0, max: 100, default: null },
    detectedIssues:  { type: [detectedIssueSchema], default: [] },
    recommendations: { type: [String], default: [] },
    comparedWith:    { type: mongoose.Schema.Types.ObjectId, ref: 'InspectionReport', default: null },
    rawResponse:     { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const inspectionReportSchema = new mongoose.Schema(
  {
    booking:     { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    type:        { type: String, enum: INSPECTION_TYPES, required: true, index: true },
    conductedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },  // rider or renter

    photos:   { type: [photoSchema], default: [] },
    videoUrl: { type: String, default: null },

    aiAnalysis: { type: aiAnalysisSchema, default: () => ({}) },

    // FIX (29 Jun): `null` must be explicitly listed in the enum array —
    // Mongoose validates the default value against enum too, and a bare
    // `default: null` without `null` in the enum list fails validation on
    // every report created without an explicit overallCondition (which is
    // every report at creation time — it's filled in later by AI analysis).
    overallCondition: { type: String, enum: [...OVERALL_CONDITION, null], default: null },
    notes:            { type: String, trim: true, maxlength: 2000, default: '' },
    submittedAt:      { type: Date, default: Date.now },

    // Set once the owner has been sent the "Damage detected" notification for
    // this booking's comparison, so re-opening the compare page (which re-runs
    // doComparison) never re-notifies. Only ever set on the later report.
    ownerDamageNotifiedAt: { type: Date, default: null },

    // Cached AI comparison result, persisted the first time it runs. The
    // "View AI Comparison" button reads this instead of re-running Gemini on
    // every click — Gemini is non-deterministic, so re-running gave wildly
    // different results (85% damage one click, 0% the next).
    comparisonResult: {
      hasDamage:            { type: Boolean, default: null },
      damageDelta:          { type: Number,  default: 0 },
      newIssues:            { type: Array,   default: [] },
      summary:              { type: String,  default: '' },
      recommendedDeduction: { type: Number,  default: 0 },
      computedAt:           { type: Date,    default: null },
      // Which two reports were compared, e.g. 'delivery→return_pickup'.
      comparedPair:         { type: String,  default: '' },
      // Who held the item during the compared leg: renter | rider | null
      responsibleParty:     { type: String,  default: null },
    },
  },
  { timestamps: true }
);

// One report per (booking, type) — a booking has one delivery + one return report
inspectionReportSchema.index({ booking: 1, type: 1 }, { unique: true });

module.exports = mongoose.models.InspectionReport
  || mongoose.model('InspectionReport', inspectionReportSchema);
module.exports.INSPECTION_TYPES  = INSPECTION_TYPES;
module.exports.PHOTO_ANGLES      = PHOTO_ANGLES;
module.exports.ISSUE_SEVERITY    = ISSUE_SEVERITY;
module.exports.OVERALL_CONDITION = OVERALL_CONDITION;
