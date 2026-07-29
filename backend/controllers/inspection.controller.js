'use strict';
/**
 * Inspection Controller — Rentify PK
 * Delivery (rider) + return (renter) condition reports with Gemini Vision
 * analysis and delivery↔return comparison for objective damage assessment.
 */
const InspectionReport = require('../models/InspectionReport');
const { Booking } = require('../models/Booking');
const { Notification } = require('../models/Notification');
const { emitToUser } = require('../utils/socket');
const { analyzePhotos, comparePhotos } = require('../utils/geminiVision');

const eq = (a, b) => String(a) === String(b);

// ── Internal: run single-set AI analysis and persist to a report ──────────────
async function runAIAnalysisInternal(reportId) {
  const report = await InspectionReport.findById(reportId);
  if (!report) return null;
  const urls = (report.photos || []).map(p => p.url).filter(Boolean);
  if (!urls.length) return report;

  try {
    const { analysis, raw } = await analyzePhotos(urls);
    const a = analysis || {};
    report.aiAnalysis = {
      conditionScore:  Number(a.conditionScore)  || null,
      damageScore:     Number(a.damageScore)     || null,
      confidenceScore: Number(a.confidenceScore) || null,
      detectedIssues:  Array.isArray(a.detectedIssues) ? a.detectedIssues : [],
      recommendations: Array.isArray(a.recommendations) ? a.recommendations : [],
      comparedWith:    report.aiAnalysis?.comparedWith || null,
      rawResponse:     raw || null,
    };
    if (a.overallCondition) report.overallCondition = a.overallCondition;
    await report.save();
  } catch (e) {
    console.error('[inspection.runAIAnalysisInternal]', e.message);
  }
  return report;
}

// Four handover points, one per leg of the item's journey:
//   pickup          owner  → rider    (rider collects from owner)
//   delivery        rider  → renter   (rider hands over to renter)
//   return_pickup   renter → rider    (rider collects back from renter)
//   return_delivery rider  → owner    (rider returns to owner)
// Every handover notifies BOTH the owner and the renter — each one needs to
// know the item's recorded condition at that moment, not just whoever happened
// to be standing there. The link points at that leg's comparison so they can
// see the result immediately rather than hunting for it later.
const LEG_META = {
  pickup: {
    label: 'Pickup',
    ownerMsg:  'The rider has collected your item. Its condition was photographed and recorded at pickup.',
    renterMsg: 'Your rental item has been collected from the owner and its condition recorded.',
  },
  delivery: {
    label: 'Delivery',
    ownerMsg:  'Your item was delivered to the renter. Its condition on arrival has been recorded and compared against pickup.',
    renterMsg: 'Your rental has arrived. Its condition was photographed at handover — check it now if anything looks wrong.',
  },
  return_pickup: {
    label: 'Return pickup',
    ownerMsg:  'The rider has collected your item from the renter. Its condition after the rental has been recorded.',
    renterMsg: 'The rider has collected the item. Its condition was recorded at handover.',
  },
  return: {
    label: 'Return',
    ownerMsg:  'A return condition report was submitted for your item.',
    renterMsg: 'Your return condition report was submitted.',
  },
  return_delivery: {
    label: 'Return delivery',
    ownerMsg:  'Your item has been returned. Its final condition has been recorded and compared against the return pickup.',
    renterMsg: 'The item has been returned to the owner and its condition recorded.',
  },
};

// Which report each leg is compared against, and who is answerable for any
// new damage found across that gap.
// Two-point inspection: the renter's return photos are compared against the
// delivery photos, and any new damage is the renter's responsibility. The rider
// is not part of inspection, so there are no pickup/return_delivery comparisons.
const COMPARE_AGAINST = {
  return: { base: 'delivery', responsible: 'renter' },  // damage during the rental
};

// ── Shared: auto-create an inspection report from rider-captured evidence ─────
// Used by rider.controller.js so the pickup/delivery photos a rider is
// already required to take (RiderAssignment.pickupEvidence/deliveryEvidence)
// also feed the same AI condition analysis + delivery↔return comparison that
// manually-submitted inspections use — instead of being two disconnected
// photo systems. Idempotent: if a report of this type already exists for the
// booking (e.g. the owner/renter manually submitted one first), this is a
// no-op rather than throwing, since submitDeliveryInspection/
// submitReturnInspection already enforce one-report-per-type via their own
// 409 guard and we don't want a rider's automatic capture to ever block or
// race with that.
async function createInspectionFromRiderEvidence(bookingId, type, evidencePhotos, conductedBy) {
  if (!Array.isArray(evidencePhotos) || evidencePhotos.length < 1) return null;

  const existing = await InspectionReport.findOne({ booking: bookingId, type });
  if (existing) return existing;   // don't duplicate or overwrite a manual submission

  const photos = evidencePhotos.map(p => ({ url: p.url, publicId: p.publicId, angle: 'detail' }));

  const report = await InspectionReport.create({
    booking: bookingId, type, conductedBy,
    photos, videoUrl: null, notes: 'Auto-captured from rider handover evidence.',
    submittedAt: new Date(),
  });

  const pairing = COMPARE_AGAINST[type];
  if (!pairing) {
    // Baseline leg (delivery in the 2-point flow) — nothing to compare against
    // yet, but analyze the set so its damageScore exists for the return
    // comparison's fallback check. One call, no comparison.
    runAIAnalysisInternal(report._id).catch(() => {});
  } else {
    // Closing leg (return): analyze this set, then compare against the delivery
    // baseline so the damage-claim flow has a result as soon as this resolves.
    await runAIAnalysisInternal(report._id);
    try { await doComparison(bookingId, pairing.base, type, pairing.responsible); } catch (_) {}
  }

  return report;
}
exports.createInspectionFromRiderEvidence = createInspectionFromRiderEvidence;

// ── POST /api/inspections/delivery  (rider, before delivery) ──────────────────
// ── Generic submit, shared by all four handover points ────────────────────────
// Each leg gets its own report so damage can be traced to whoever was holding
// the item, rather than lumping transit and rental damage together.
const submitInspection = async (req, res, type) => {
  try {
    const bookingId = req.params.bookingId || req.body.bookingId;
    const { photos, videoUrl, notes } = req.body;
    const meta = LEG_META[type];
    if (!meta) return res.status(400).json({ success: false, message: 'Unknown inspection type.' });

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
    if (!Array.isArray(photos) || photos.length < 1) {
      return res.status(422).json({ success: false, message: 'At least one photo is required.' });
    }
    if (await InspectionReport.findOne({ booking: bookingId, type })) {
      return res.status(409).json({ success: false, message: `${meta.label} inspection already exists.` });
    }

    const report = await InspectionReport.create({
      booking: bookingId, type, conductedBy: req.user._id,
      photos, videoUrl: videoUrl || null, notes: notes || '', submittedAt: new Date(),
    });

    const pairing = COMPARE_AGAINST[type];
    let comparison = null;

    if (pairing) {
      // This leg closes a gap — analyse it and compare against the previous
      // report so any new damage is attributed to the right party.
      await runAIAnalysisInternal(report._id);
      try { comparison = await doComparison(bookingId, pairing.base, type, pairing.responsible); } catch (_) {}
      Notification.notifyAdmins('system', `${meta.label} inspection submitted`,
        'An inspection was submitted and analyzed.', { bookingId }).catch(() => {});
      emitToUser(String(booking.owner), 'inspection:update', { bookingId, type });
    } else {
      // Opening leg (pickup) — nothing to compare against yet, and its photos
      // feed the next leg's comparison directly, so no separate analysis call.
    }

    const recipients = [
      { id: booking.owner,  body: meta.ownerMsg },
      { id: booking.renter, body: meta.renterMsg },
    ];
    for (const r of recipients) {
      if (!r.id) continue;
      Notification.notify(r.id, 'system', `${meta.label} inspection done`, r.body,
        { bookingId, leg: type, link: `/inspection/leg/${type}/${bookingId}` }).catch(() => {});
    }

    return res.status(201).json({
      success: true, message: `${meta.label} inspection submitted.`,
      data: { report: await InspectionReport.findById(report._id), comparison },
    });
  } catch (err) {
    console.error(`[inspection.submit:${type}]`, err.message);
    return res.status(500).json({ success: false, message: 'Failed to submit inspection.' });
  }
};

exports.submitPickupInspection         = (req, res) => submitInspection(req, res, 'pickup');
exports.submitDeliveryInspection       = (req, res) => submitInspection(req, res, 'delivery');
exports.submitReturnPickupInspection   = (req, res) => submitInspection(req, res, 'return_pickup');
exports.submitReturnInspection         = (req, res) => submitInspection(req, res, 'return');
exports.submitReturnDeliveryInspection = (req, res) => submitInspection(req, res, 'return_delivery');

// ── POST /api/inspections/:inspectionId/analyze  (manual re-run) ──────────────
exports.runAIAnalysis = async (req, res) => {
  try {
    const report = await InspectionReport.findById(req.params.inspectionId);
    if (!report) return res.status(404).json({ success: false, message: 'Inspection not found.' });
    const updated = await runAIAnalysisInternal(report._id);
    if (!updated?.aiAnalysis?.rawResponse) {
      return res.status(502).json({ success: false, message: 'AI analysis could not be completed.' });
    }
    return res.json({ success: true, message: 'AI analysis complete.', data: updated });
  } catch (err) {
    console.error('[inspection.runAIAnalysis]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to run AI analysis.' });
  }
};

// ── Internal: compare any two legs of the item's journey ──────────────────────
// Defaults to the original delivery↔return pair so existing callers are
// unaffected. `responsible` records who was holding the item across the gap.
async function doComparison(bookingId, baseType = 'delivery', laterType = 'return', responsible = 'renter') {
  const [delivery, ret] = await Promise.all([
    InspectionReport.findOne({ booking: bookingId, type: baseType }),
    InspectionReport.findOne({ booking: bookingId, type: laterType }),
  ]);
  if (!delivery || !ret) throw new Error(`Both ${baseType} and ${laterType} inspections are required.`);

  const dUrls = (delivery.photos || []).map(p => p.url).filter(Boolean);
  const rUrls = (ret.photos || []).map(p => p.url).filter(Boolean);

  // Human-readable leg names so the model's summary names the right handovers.
  const LABELS = {
    pickup: 'pickup from the owner',
    delivery: 'delivery to the renter',
    return_pickup: 'collection from the renter',
    return: 'return',
    return_delivery: 'return to the owner',
  };
  const { analysis, raw } = await comparePhotos(
    dUrls, rUrls, LABELS[baseType] || baseType, LABELS[laterType] || laterType,
  );
  // If the model returned nothing usable (bad JSON, or a call that resolved
  // without candidates), do NOT fall through to hasDamage:false — that silently
  // clears the owner even when there's real damage. Treat it as a failure so
  // the caller leaves the result uncomputed and it can be retried.
  if (!analysis || typeof analysis.hasDamage === 'undefined') {
    throw new Error('AI comparison returned no usable result');
  }
  const a = analysis || {};

  // Link the return report to the delivery report
  ret.aiAnalysis = ret.aiAnalysis || {};
  ret.aiAnalysis.comparedWith = delivery._id;
  if (Array.isArray(a.newIssues) && a.newIssues.length) {
    ret.aiAnalysis.recommendations = ret.aiAnalysis.recommendations || [];
    ret.aiAnalysis.recommendations.unshift(`Comparison: ${a.summary || a.newIssues.length + ' new issue(s) found'}`);
  }

  // If truncation dropped the summary but issues survived, synthesise one so
  // the UI and notification aren't blank.
  let summary = a.summary || '';
  if (!summary && Array.isArray(a.newIssues) && a.newIssues.length) {
    const parts = a.newIssues.slice(0, 3).map(i => i.description || i.type).filter(Boolean);
    summary = `New damage detected: ${parts.join('; ')}.`;
  }

  const result = {
    hasDamage: !!a.hasDamage,
    damageDelta: Number(a.damageDelta) || 0,
    newIssues: Array.isArray(a.newIssues) ? a.newIssues : [],
    summary,
    recommendedDeduction: Number(a.recommendedDeduction) || 0,
    raw,
  };

  // ── Deterministic safety net ────────────────────────────────────────────────
  // Gemini's comparison is non-deterministic and occasionally returns
  // hasDamage=false even when there is obvious new damage (e.g. it once scored a
  // clear ink scribble as 0). Each report also has its own single-set
  // `damageScore` (0-100) from analyzePhotos — a clear jump between the two is
  // objective evidence a weak comparison run missed.
  //
  // Both scores must genuinely exist. Treating a missing score as 0 (which the
  // old `Number(x) || 0` did) invented a jump whenever the earlier report's AI
  // analysis hadn't finished or had failed, flagging damage that wasn't there.
  const dRaw = delivery.aiAnalysis?.damageScore;
  const rRaw = ret.aiAnalysis?.damageScore;
  const bothScored = Number.isFinite(Number(dRaw)) && Number.isFinite(Number(rRaw));
  const dScore = Number(dRaw) || 0;
  const rScore = Number(rRaw) || 0;
  const scoreJump = rScore - dScore;
  const SCORE_JUMP_THRESHOLD = 15;   // later report this much worse = new damage

  if (bothScored && !result.hasDamage && scoreJump >= SCORE_JUMP_THRESHOLD) {
    result.hasDamage = true;
    result.damageDelta = Math.max(result.damageDelta, scoreJump);
    result.recommendedDeduction = Math.max(result.recommendedDeduction, Math.min(scoreJump, 100));
    if (!result.newIssues.length) {
      result.newIssues = [{
        type: 'Condition decline',
        severity: scoreJump >= 40 ? 'high' : scoreJump >= 25 ? 'medium' : 'low',
        description: `Item condition scored notably worse at the later handover (damage ${dScore} → ${rScore}).`,
        location: 'overall',
      }];
    }
    if (!result.summary) {
      result.summary = `The item's condition score worsened from ${dScore} to ${rScore} across this handover, indicating new damage.`;
    }
  }

  // Persist the result on the return report so the "View AI Comparison" button
  // reads a fixed, consistent result instead of re-running non-deterministic
  // Gemini on every click. We store the clean fields only (not the heavy raw
  // Gemini payload).
  ret.comparisonResult = {
    hasDamage: result.hasDamage,
    damageDelta: result.damageDelta,
    newIssues: result.newIssues,
    summary: result.summary,
    recommendedDeduction: result.recommendedDeduction,
    computedAt: new Date(),
    comparedPair: `${baseType}→${laterType}`,
    responsibleParty: result.hasDamage ? responsible : null,
  };

  // ── Notify the owner when the AI comparison finds NEW damage ─────────────────
  // Guard on a persisted flag so the owner gets exactly one alert per booking,
  // no matter how often the comparison is re-run or the report re-opened.
  // The flag is set only AFTER the notification succeeds — setting it first
  // meant a failed send silently burned the one chance to alert the owner.
  if (result.hasDamage && !ret.ownerDamageNotifiedAt) {
    try {
      const booking = await Booking.findById(bookingId).select('owner renter listing').populate('listing', 'title');
      if (booking?.owner) {
        const item = booking.listing?.title ? `"${booking.listing.title}"` : 'your item';
        const deduction = result.recommendedDeduction > 0 ? ` Recommended deduction: Rs ${result.recommendedDeduction}.` : '';
        const issueCount = result.newIssues.length;
        // Name the leg and the party who held the item across it, so the owner
        // knows whether to claim against the renter or the rider.
        const legLabel = responsible === 'rider' ? 'in transit' : 'during the rental';
        const blame = responsible === 'rider'
          ? ' This occurred while the rider had the item.'
          : ' This occurred while the renter had the item.';
        const body = result.summary
          ? result.summary.slice(0, 420) + blame
          : `New damage was detected on ${item} ${legLabel}${issueCount ? ` (${issueCount} new issue${issueCount > 1 ? 's' : ''})` : ''}.${deduction}${blame}`;

        // Both sides need to know: the owner so they can claim, the renter so
        // they aren't blindsided by a deduction they never heard about.
        const legLink = `/inspection/leg/${laterType}/${bookingId}`;

        await Notification.notify(
          booking.owner, 'dispute_opened', 'Damage detected on your item', body,
          { bookingId, listingId: booking.listing?._id || null, responsibleParty: responsible, leg: laterType, link: legLink }
        );

        if (booking.renter) {
          const renterBody = responsible === 'renter'
            ? `New damage was found on ${item} during your rental.${deduction} Open the report if you disagree.`
            : `New damage was found on ${item} in transit — this was recorded against the rider, not you.`;
          Notification.notify(
            booking.renter, 'system', 'Damage found on rental item', renterBody,
            { bookingId, responsibleParty: responsible, leg: laterType, link: legLink }
          ).catch(() => {});
        }

        emitToUser(String(booking.owner), 'inspection:damage', {
          bookingId,
          damageDelta: result.damageDelta,
          recommendedDeduction: result.recommendedDeduction,
          newIssues: issueCount,
          responsibleParty: responsible,
        });

        // Only now is the alert genuinely delivered — safe to stop retrying.
        ret.ownerDamageNotifiedAt = new Date();
      }
    } catch (e) {
      console.error('[inspection.doComparison notifyOwner]', e.message);
    }
  }

  await ret.save();

  return result;
}

// ── GET /api/inspections/:bookingId/compare ───────────────────────────────────
// Cache-first: the AI comparison is run ONCE (when the return inspection is
// submitted / rider evidence arrives) and its result is persisted on the return
// report. This endpoint returns that stored result so the "View AI Comparison"
// button shows the SAME numbers every time. Gemini Vision is non-deterministic,
// so re-running it per click produced wildly different results (90% one click,
// 0% the next) — we never re-run on a plain view. A fresh run only happens if
// no cached result exists yet (?refresh=1 forces one for a manual re-check).
exports.compareInspections = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const force = req.query.refresh === '1' || req.query.refresh === 'true';

    if (!force) {
      const ret = await InspectionReport.findOne({ booking: bookingId, type: 'return' })
        .select('comparisonResult').lean();
      const cached = ret?.comparisonResult;
      if (cached && cached.computedAt) {
        return res.json({
          success: true, cached: true,
          data: {
            hasDamage: !!cached.hasDamage,
            damageDelta: cached.damageDelta || 0,
            newIssues: Array.isArray(cached.newIssues) ? cached.newIssues : [],
            summary: cached.summary || '',
            recommendedDeduction: cached.recommendedDeduction || 0,
          },
        });
      }
    }

    // No cached result yet (or a forced refresh) — run once and it gets stored.
    const comparison = await doComparison(bookingId);
    const { raw, ...clean } = comparison;
    return res.json({ success: true, cached: false, data: clean });
  } catch (err) {
    console.error('[inspection.compareInspections]', err.message);
    return res.status(400).json({ success: false, message: err.message || 'Comparison failed.' });
  }
};

// ── GET /api/inspections/my  (all my proofs across every booking) ────────────
// Different from getReport (single booking+type) — this is the "Inspections
// & Proofs" hub page: every delivery/return photo report across every
// booking this user is part of, as either owner or renter. Real data only —
// built straight off Booking + InspectionReport, no separate cache/summary
// table to go stale.
// ── GET /api/inspections/:bookingId/all-comparisons ───────────────────────────
// Every leg comparison for a booking, in journey order. Each entry reads from
// the cached comparisonResult stored when that leg was submitted, so this is a
// plain DB read — Gemini is never re-run here.
exports.getAllComparisons = async (req, res) => {
  try {
    const { bookingId } = req.params;

    // Two-point inspection: one comparison, renter's return vs the delivery
    // condition. Any new damage is the renter's responsibility.
    const LEGS = [
      { type: 'return', label: 'Delivery → Return', sub: 'Condition across the rental', base: 'delivery', responsible: 'renter' },
    ];

    const reports = await InspectionReport.find({ booking: bookingId })
      .select('type comparisonResult photos submittedAt').lean();
    const byType = Object.fromEntries(reports.map(r => [r.type, r]));

    const legs = [];
    for (const leg of LEGS) {
      const report = byType[leg.type];
      const c = report?.comparisonResult;
      const hasBoth = !!byType[leg.base] && !!report;

      legs.push({
        type: leg.type,
        label: leg.label,
        sub: leg.sub,
        responsibleParty: leg.responsible,
        // Thumbnails for the before/after strip — capped so the payload stays
        // small; the full sets live on the per-leg page.
        basePhotos:  (byType[leg.base]?.photos || []).slice(0, 3).map(p => p.url),
        laterPhotos: (report?.photos || []).slice(0, 3).map(p => p.url),
        baseLabel:   LEGS.find(l => l.type === leg.base)?.label || leg.base,
        // 'done' = compared, 'pending' = photos not captured yet
        status: c?.computedAt ? 'done' : (hasBoth ? 'pending' : 'awaiting'),
        hasDamage: c?.hasDamage ?? null,
        damageDelta: c?.damageDelta || 0,
        recommendedDeduction: c?.recommendedDeduction || 0,
        summary: c?.summary || '',
        newIssues: Array.isArray(c?.newIssues) ? c.newIssues : [],
        computedAt: c?.computedAt || null,
      });
    }

    const damaged = legs.filter(l => l.status === 'done' && l.hasDamage);
    return res.json({
      success: true,
      data: {
        legs,
        totalDeduction: damaged.reduce((s, l) => s + (l.recommendedDeduction || 0), 0),
        anyDamage: damaged.length > 0,
        // Who to pursue, if anyone — riders and renters are separate claims.
        blamedParties: [...new Set(damaged.map(l => l.responsibleParty))],
      },
    });
  } catch (err) {
    console.error('[inspection.getAllComparisons]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load comparisons.' });
  }
};

// ── GET /api/inspections/leg-result/:type/:bookingId ──────────────────────────
// One leg's comparison, for the page a user lands on straight after that
// handover. Reads the cached result — Gemini is never re-run here.
exports.getLegResult = async (req, res) => {
  try {
    const { bookingId, type } = req.params;
    const pairing = COMPARE_AGAINST[type];
    const meta = LEG_META[type];
    if (!meta) return res.status(400).json({ success: false, message: 'Unknown inspection leg.' });

    const report = await InspectionReport.findOne({ booking: bookingId, type })
      .select('type photos submittedAt comparisonResult aiAnalysis').lean();
    if (!report) {
      return res.status(404).json({ success: false, message: `No ${meta.label.toLowerCase()} inspection yet.` });
    }

    const base = pairing
      ? await InspectionReport.findOne({ booking: bookingId, type: pairing.base })
          .select('type photos submittedAt').lean()
      : null;

    const c = report.comparisonResult;

    return res.json({
      success: true,
      data: {
        leg: type,
        label: meta.label,
        photos: report.photos || [],
        submittedAt: report.submittedAt,
        basePhotos: base?.photos || [],
        baseLabel: pairing ? LEG_META[pairing.base]?.label || pairing.base : null,
        responsibleParty: pairing?.responsible || null,
        // Opening leg has nothing to compare against — it's a baseline only.
        isBaseline: !pairing,
        compared: !!c?.computedAt,
        hasDamage: c?.hasDamage ?? null,
        damageDelta: c?.damageDelta || 0,
        recommendedDeduction: c?.recommendedDeduction || 0,
        summary: c?.summary || '',
        newIssues: Array.isArray(c?.newIssues) ? c.newIssues : [],
      },
    });
  } catch (err) {
    console.error('[inspection.getLegResult]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load inspection.' });
  }
};

exports.getMyInspections = async (req, res) => {
  try {
    const { page = 1, limit = 12 } = req.query;
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, parseInt(limit) || 12);
    const skip     = (pageNum - 1) * limitNum;
    const uid = req.user._id;

    const myBookings = await Booking.find({ $or: [{ renter: uid }, { owner: uid }] })
      .select('_id renter owner listing')
      .populate('listing', 'title images')
      .lean();

    if (!myBookings.length) {
      return res.json({ success: true, data: { reports: [], pagination: { total: 0, page: pageNum, limit: limitNum, totalPages: 0 } } });
    }

    const bookingMap = new Map(myBookings.map(b => [String(b._id), b]));
    const bookingIds = myBookings.map(b => b._id);

    const [reports, total] = await Promise.all([
      InspectionReport.find({ booking: { $in: bookingIds } })
        .populate('conductedBy', 'name avatar')
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      InspectionReport.countDocuments({ booking: { $in: bookingIds } }),
    ]);

    // Attach the listing + this-user's-role for each report from the booking map
    // (avoids an extra populate('booking') round trip since we already have it).
    const enriched = reports.map(r => {
      const b = bookingMap.get(String(r.booking));
      return {
        ...r,
        booking: b ? { _id: b._id, listing: b.listing } : null,
        myRole: b ? (eq(b.owner, uid) ? 'owner' : 'renter') : null,
      };
    });

    return res.json({
      success: true,
      data: { reports: enriched, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) } },
    });
  } catch (err) {
    console.error('[inspection.getMyInspections]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch your inspections.' });
  }
};

// ── GET /api/inspections/:bookingId/:type ─────────────────────────────────────
exports.getReport = async (req, res) => {
  try {
    const { bookingId, type } = req.params;
    const report = await InspectionReport.findOne({ booking: bookingId, type });
    if (!report) return res.status(404).json({ success: false, message: 'Inspection not found.' });
    return res.json({ success: true, data: report });
  } catch (err) {
    console.error('[inspection.getReport]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch report.' });
  }
};

// ── GET /api/inspections/:bookingId/comparison  (stored, no re-run) ───────────
exports.getComparisonReport = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const [delivery, ret] = await Promise.all([
      InspectionReport.findOne({ booking: bookingId, type: 'delivery' }),
      InspectionReport.findOne({ booking: bookingId, type: 'return' }),
    ]);
    if (!delivery && !ret) return res.status(404).json({ success: false, message: 'No inspections found.' });

    const dDmg = delivery?.aiAnalysis?.damageScore || 0;
    const rDmg = ret?.aiAnalysis?.damageScore || 0;
    return res.json({
      success: true,
      data: {
        delivery, return: ret,
        comparison: { deliveryDamageScore: dDmg, returnDamageScore: rDmg, damageDelta: rDmg - dDmg, newDamageDetected: rDmg - dDmg > 0 },
      },
    });
  } catch (err) {
    console.error('[inspection.getComparisonReport]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to build comparison.' });
  }
};
