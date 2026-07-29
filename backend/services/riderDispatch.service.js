'use strict';
/**
 * Rider Dispatch Service — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Finds the nearest available rider (2dsphere geo query) and creates a
 * RiderAssignment with an encrypted QR for handover. Auto-dispatches a delivery
 * rider when a booking's payment is confirmed, and a return rider when the
 * rental period ends — preferring the SAME rider who handled delivery for
 * the return leg (falls back to nearest-available only if they're no
 * longer available).
 *
 * Rider earnings come directly from the renter's actual vehicle-based
 * delivery fee (booking.deliveryFee), split in half between the delivery leg
 * and the return leg — never a flat env-var amount disconnected from what
 * was actually charged.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const User = require('../models/User');
const RiderAssignment = require('../models/RiderAssignment');
const { Booking } = require('../models/Booking');
const { Notification } = require('../models/Notification');
const { emitToUser } = require('../utils/socket');
const { generateQR } = require('./qrCode.service');
const sms = require('./sms.service');

/**
 * Find the nearest available rider to a location.
 * @param {{ lat, lng }} ownerLocation
 * @returns {Promise<User|null>}
 */
const findNearestRider = async (ownerLocation = {}) => {
  const { lat, lng } = ownerLocation;

  // Geo query when we have coordinates + a 2dsphere index
  if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    const near = await User.findOne({
      role: 'rider',
      isAvailable: true,
      currentLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
          $maxDistance: Number(process.env.RIDER_MAX_DISTANCE_M || 50000),   // 50km
        },
      },
    });
    if (near) return near;
  }

  // Fallback: FIFO — earliest-registered available rider
  return User.findOne({ role: 'rider', isAvailable: true }).sort({ createdAt: 1 });
};

/**
 * Assign a rider to a booking for delivery or return.
 * earnings = half of booking.deliveryFee — the actual fee the renter paid
 * for door delivery, not a flat fee disconnected from it. If the booking
 * somehow has no delivery fee (e.g. self-pickup got routed here by mistake),
 * earnings is 0 rather than throwing.
 * @param {string} bookingId
 * @param {'delivery'|'return'} type
 * @returns {Promise<RiderAssignment>}
 */
const assignRider = async (bookingId, type = 'delivery') => {
  if (!['delivery', 'return'].includes(type)) throw new Error("type must be 'delivery' or 'return'.");

  const booking = await Booking.findById(bookingId).populate('listing', 'title city location');
  if (!booking) throw new Error('Booking not found.');

  // Avoid duplicate assignment of the same type — a declined assignment is
  // NOT still "in flight", so it must allow a fresh assignment to a
  // different rider, same as a cancelled one would.
  const existing = await RiderAssignment.findOne({ booking: bookingId, type, status: { $nin: ['cancelled', 'declined'] } });
  if (existing) return existing;

  // Owner/listing location if available (GeoJSON [lng, lat] or {lat,lng})
  let loc = {};
  const listingLoc = booking.listing?.location;
  if (listingLoc?.coordinates?.length === 2) {
    loc = { lng: listingLoc.coordinates[0], lat: listingLoc.coordinates[1] };
  }

  // Same-rider rule: the return leg should go to whichever rider handled
  // this booking's delivery leg, not a fresh nearest-rider lookup — a
  // booking's two legs must stay with one rider so milestone-bonus counting
  // (one completed RiderAssignment = one order) can't be gamed by splitting
  // a booking's earnings/credit across two different riders. Only falls
  // back to nearest-available if that rider is no longer available.
  let rider = null;
  if (type === 'return') {
    const deliveryLeg = await RiderAssignment.findOne({ booking: bookingId, type: 'delivery', status: { $nin: ['cancelled', 'declined'] } }).select('rider');
    if (deliveryLeg?.rider) {
      const sameRider = await User.findOne({ _id: deliveryLeg.rider, role: 'rider', isAvailable: true });
      if (sameRider) rider = sameRider;
    }
  }
  if (!rider) rider = await findNearestRider(loc);
  if (!rider) throw new Error('No available rider found.');

  const qrCode = generateQR(bookingId, { type });

  // Half the renter's actual delivery fee, rounded — delivery leg and return
  // leg each earn one half of the same fee, so a van delivery (Rs 999) pays
  // each leg ~Rs 500, not a flat unrelated amount.
  const feeShare = type === 'delivery' ? 'delivery_half' : 'return_half';
  const earnings = Math.round((Number(booking.deliveryFee) || 0) / 2);

  const assignment = await RiderAssignment.create({
    booking: bookingId,
    rider: rider._id,
    type,
    status: 'assigned',
    pickupAddress: booking.listing?.city || '',
    qrCode,
    earnings,
    feeShare,
    payoutStatus: 'pending',
    estimatedPickup: new Date(Date.now() + 2 * 60 * 60 * 1000),   // ~2h
  });

  // Link riders to their OWN assignment page. Without an explicit `link` the
  // notification UI falls back to /bookings/:id, which only the renter/owner
  // may open — riders landed on "Access denied" when tapping this.
  const riderBase = type === 'return' ? '/rider/pending-returns' : '/rider/deliveries';
  const riderLink = `${riderBase}?highlight=${assignment._id}`;
  Notification.notify(rider._id, 'system', `New ${type} assignment`,
    `You have a new ${type} assignment.`, { bookingId, assignmentId: assignment._id, link: riderLink }).catch(() => {});
  emitToUser(String(rider._id), 'rider:new_assignment', { assignmentId: assignment._id, bookingId, type });

  // SMS the renter that a rider is on the way (Pakistan reads SMS reliably)
  User.findById(booking.renter).select('phone').lean()
    .then(u => { if (u?.phone) sms.smsRiderAssigned(u, { listingTitle: booking.listing?.title }).catch(() => {}); })
    .catch(() => {});

  return assignment;
};

/**
 * Auto-assign a delivery rider when a booking's payment is confirmed.
 * Best-effort: never throws to the caller (logs instead).
 * @param {string} bookingId
 * @returns {Promise<RiderAssignment|null>}
 */
const autoAssignOnBookingConfirm = async (bookingId) => {
  try {
    return await assignRider(bookingId, 'delivery');
  } catch (e) {
    console.warn('[riderDispatch.autoAssign]', e.message);
    return null;
  }
};

/**
 * Auto-assign a return-leg rider once the rental period ends. Mirrors
 * autoAssignOnBookingConfirm — only dispatches when the booking actually
 * used door delivery (self-pickup bookings have no rider to return either).
 * @param {string} bookingId
 * @returns {Promise<RiderAssignment|null>}
 */
const autoAssignReturnOnRentalEnd = async (bookingId) => {
  try {
    const booking = await Booking.findById(bookingId).select('deliveryMethod').lean();
    if (!booking || booking.deliveryMethod !== 'delivery') return null;
    return await assignRider(bookingId, 'return');
  } catch (e) {
    console.warn('[riderDispatch.autoAssignReturn]', e.message);
    return null;
  }
};

module.exports = {
  findNearestRider, assignRider, autoAssignOnBookingConfirm, autoAssignReturnOnRentalEnd,
};
