'use strict';
/**
 * Ownership Middleware — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Resource-level authorization guards. Each loads the target document, attaches
 * it to req (so the controller needn't re-fetch), and confirms the caller is a
 * legitimate party before allowing the request through.
 *
 *   verifyListingOwner       → listing.createdBy === req.user._id
 *   verifyBookingParty       → booking.renter or booking.owner === req.user._id
 *   verifyMessageParticipant → conversation.participants includes req.user._id
 *
 * All comparisons use String(...) to safely compare ObjectIds vs strings.
 * Admins/super_admins bypass ownership checks.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const { Listing }      = require('../models/Listing');
const { Booking }      = require('../models/Booking');
const { Conversation } = require('../models/Message');

const eq   = (a, b) => String(a) === String(b);
const isAdmin = (user) => ['admin', 'super_admin'].includes(user?.role);

// ── Listing owner ─────────────────────────────────────────────────────────────
const verifyListingOwner = async (req, res, next) => {
  try {
    const id = req.params.id || req.params.listingId;
    const listing = await Listing.findById(id);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found.' });

    if (!isAdmin(req.user) && !eq(listing.createdBy, req.user._id)) {
      return res.status(403).json({ success: false, message: 'You do not own this listing.', code: 'NOT_LISTING_OWNER' });
    }
    req.listing = listing;
    next();
  } catch (err) {
    console.error('[verifyListingOwner]', err.message);
    return res.status(500).json({ success: false, message: 'Authorization check failed.' });
  }
};

// ── Booking party (renter OR owner) ───────────────────────────────────────────
const verifyBookingParty = async (req, res, next) => {
  try {
    const id = req.params.id || req.params.bookingId;
    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    const isParty = eq(booking.renter, req.user._id) || eq(booking.owner, req.user._id);
    if (!isAdmin(req.user) && !isParty) {
      return res.status(403).json({ success: false, message: 'You are not a party to this booking.', code: 'NOT_BOOKING_PARTY' });
    }
    req.booking = booking;
    next();
  } catch (err) {
    console.error('[verifyBookingParty]', err.message);
    return res.status(500).json({ success: false, message: 'Authorization check failed.' });
  }
};

// ── Message/conversation participant ──────────────────────────────────────────
const verifyMessageParticipant = async (req, res, next) => {
  try {
    const id = req.params.id || req.params.conversationId;
    const conversation = await Conversation.findById(id);
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found.' });

    const isMember = (conversation.participants || []).some(p => eq(p, req.user._id));
    if (!isAdmin(req.user) && !isMember) {
      return res.status(403).json({ success: false, message: 'You are not part of this conversation.', code: 'NOT_PARTICIPANT' });
    }
    req.conversation = conversation;
    next();
  } catch (err) {
    console.error('[verifyMessageParticipant]', err.message);
    return res.status(500).json({ success: false, message: 'Authorization check failed.' });
  }
};

module.exports = { verifyListingOwner, verifyBookingParty, verifyMessageParticipant };
