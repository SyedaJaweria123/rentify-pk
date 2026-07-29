'use strict';
/**
 * Cart Controller — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 *   GET    /api/cart                     → list cart items with live pricing
 *   POST   /api/cart                     → add/update a cart line
 *   PATCH  /api/cart/:itemId             → update dates/delivery on a line
 *   DELETE /api/cart/:itemId             → remove one line
 *   DELETE /api/cart                     → clear the whole cart
 *   POST   /api/cart/checkout            → create real bookings for selected lines
 *
 * Pricing is never stored on the cart — it's computed live here using the
 * exact same calcPrice() + Trust-Tiered Payment logic booking.controller.js
 * uses, so a cart preview never drifts from what checkout will actually
 * charge. Checkout itself re-validates availability and re-runs that same
 * logic per line — the cart is a staging area, not a price lock.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const mongoose = require('mongoose');
const CartItem = require('../models/CartItem');
const { Listing } = require('../models/Listing');
const { Booking } = require('../models/Booking');
const User = require('../models/User');
const { getAdvancePercentForBadge } = require('../services/trustScore.service');
const { getAllowedVehicles } = require('../utils/vehicleEligibility');

const SERVICE_FEE_RATE = 0.05; // fallback; real rate comes from Settings via getFeeRate()

const VEHICLE_FEES = () => ({
  bike: Number(process.env.DELIVERY_FEE_BIKE || 250),
  car:  Number(process.env.DELIVERY_FEE_CAR  || 500),
  van:  Number(process.env.DELIVERY_FEE_VAN  || 999),
});

const getFeeRate = async () => {
  try {
    const Settings = require('../models/Settings');
    const s = await Settings.getSingleton();
    const pct = typeof s.serviceFeePercent === 'number' ? s.serviceFeePercent : 5;
    return pct / 100;
  } catch {
    return SERVICE_FEE_RATE;
  }
};

/** Same day/unit pricing math as booking.controller.js's calcPrice(). */
const calcPrice = (pricePerUnit, priceUnit, startDate, endDate, feeRate, deliveryFee = 0) => {
  const ms   = endDate - startDate;
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  let units;
  switch (priceUnit) {
    case 'per_hour':  units = Math.ceil(ms / (1000 * 60 * 60)); break;
    case 'per_week':  units = Math.ceil(days / 7); break;
    case 'per_month': units = Math.ceil(days / 30); break;
    default:          units = days;
  }
  const subtotal    = pricePerUnit * units;
  const serviceFee  = Math.round(subtotal * feeRate * 100) / 100;
  const delivery    = Number(deliveryFee) || 0;
  const totalAmount = subtotal + serviceFee + delivery;
  return { days, units, subtotal, serviceFee, deliveryFee: delivery, totalAmount };
};

/** Build the full live price breakdown for one cart line (preview only). */
async function priceLine(item, feeRate) {
  const listing = item.listing; // already populated
  if (!listing) return null;

  const deliveryFee = item.deliveryMethod === 'delivery'
    ? VEHICLE_FEES()[item.vehicleType] || 0
    : 0;

  const { days, subtotal, serviceFee, totalAmount: rentalPortion } = calcPrice(
    listing.price, listing.priceUnit, item.startDate, item.endDate, feeRate, deliveryFee
  );

  const depositAmount = Number(listing.securityDeposit) || 0;
  const totalAmount = rentalPortion + depositAmount;

  const owner = listing.createdBy;
  const badge = (owner && typeof owner === 'object' ? owner.trustBadge : null) || 'none';
  const advancePercent = getAdvancePercentForBadge(badge);
  const advanceRental = Math.round(rentalPortion * advancePercent / 100);
  const advanceAmount = advanceRental + depositAmount;
  const remainingAmount = Math.max(0, rentalPortion - advanceRental);

  return {
    days, subtotal, serviceFee, deliveryFee, depositAmount,
    totalAmount, advancePercent, advanceAmount, remainingAmount,
  };
}

// ── Availability check (mirrors isListingAvailable in booking.controller.js) ──
async function isListingAvailable(listingId, startDate, endDate) {
  const conflict = await Booking.findOne({
    listing:   listingId,
    status:    { $in: ['pending', 'confirmed', 'active'] },
    startDate: { $lt: endDate },
    endDate:   { $gt: startDate },
  });
  return !conflict;
}

// ══════════════════════════════════════════════════════════════════════════════
// LIST  GET /api/cart
// ══════════════════════════════════════════════════════════════════════════════
exports.getCart = async (req, res) => {
  try {
    const items = await CartItem.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate({
        path: 'listing',
        select: 'title price priceUnit securityDeposit images city area status createdBy isDeleted',
        populate: { path: 'createdBy', select: 'name avatar trustBadge trustScore cnicVerified' },
      })
      .lean();

    const feeRate = await getFeeRate();

    // Listings that were deleted/deactivated since being added still show up
    // (so the renter sees what happened) but are flagged unavailable and
    // excluded from pricing totals + checkout eligibility.
    const enriched = [];
    let totals = { subtotal: 0, serviceFee: 0, deliveryFee: 0, deposit: 0, total: 0, advance: 0, remaining: 0 };
    let validCount = 0;

    for (const item of items) {
      const listingGone = !item.listing || item.listing.isDeleted || item.listing.status !== 'active';
      const pricing = listingGone ? null : await priceLine(item, feeRate);

      if (pricing) {
        totals.subtotal    += pricing.subtotal;
        totals.serviceFee  += pricing.serviceFee;
        totals.deliveryFee += pricing.deliveryFee;
        totals.deposit     += pricing.depositAmount;
        totals.total       += pricing.totalAmount;
        totals.advance     += pricing.advanceAmount;
        totals.remaining   += pricing.remainingAmount;
        validCount++;
      }

      enriched.push({
        id: item._id,
        listing: listingGone ? (item.listing || null) : item.listing,
        startDate: item.startDate,
        endDate: item.endDate,
        deliveryMethod: item.deliveryMethod,
        vehicleType: item.vehicleType,
        deliveryAddress: item.deliveryAddress,
        deliveryPhone: item.deliveryPhone,
        message: item.message,
        unavailable: listingGone,
        pricing,
      });
    }

    return res.json({
      success: true,
      data: {
        items: enriched,
        count: items.length,
        validCount,
        totals,
      },
    });
  } catch (err) {
    console.error('[cart.getCart]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load cart.' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// ADD / UPDATE  POST /api/cart
// ══════════════════════════════════════════════════════════════════════════════
exports.addToCart = async (req, res) => {
  try {
    const {
      listingId, startDate, endDate, deliveryMethod,
      vehicleType, deliveryAddress, deliveryPhone, message,
    } = req.body;

    if (!listingId || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'listingId, startDate, endDate are required.' });
    }
    if (!mongoose.Types.ObjectId.isValid(listingId)) {
      return res.status(400).json({ success: false, message: 'Invalid listing ID.' });
    }

    const listing = await Listing.findOne({ _id: listingId, isDeleted: false, status: 'active' });
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found or not available.' });
    }
    if (String(listing.createdBy) === String(req.user._id)) {
      return res.status(400).json({ success: false, message: 'You cannot add your own listing to the cart.' });
    }

    const start = new Date(startDate); start.setUTCHours(0, 0, 0, 0);
    const end   = new Date(endDate);   end.setUTCHours(0, 0, 0, 0);
    if (isNaN(start) || isNaN(end)) {
      return res.status(400).json({ success: false, message: 'Invalid date format.' });
    }
    if (start >= end) {
      return res.status(400).json({ success: false, message: 'endDate must be after startDate.' });
    }
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
    if (start < todayStart) {
      return res.status(400).json({ success: false, message: 'startDate cannot be in the past.' });
    }

    const method = deliveryMethod === 'delivery' ? 'delivery' : 'pickup';
    const allowedVehicles = getAllowedVehicles(listing.category);
    if (method === 'delivery') {
      if (!deliveryAddress || deliveryAddress.trim().length < 10) {
        return res.status(422).json({ success: false, message: 'A full delivery address is required for door delivery.' });
      }
      if (!/^03\d{9}$/.test(String(deliveryPhone || '').trim())) {
        return res.status(422).json({ success: false, message: 'A valid phone (03XXXXXXXXX) is required for door delivery.' });
      }
      if (!allowedVehicles.includes(vehicleType)) {
        return res.status(422).json({
          success: false,
          message: `${listing.category} items can only be delivered by: ${allowedVehicles.join(', ')}.`,
          allowedVehicles,
        });
      }
    }

    // Upsert: adding the same listing again just updates this line's dates/
    // delivery config rather than creating a duplicate cart entry.
    const item = await CartItem.findOneAndUpdate(
      { user: req.user._id, listing: listingId },
      {
        user: req.user._id,
        listing: listingId,
        startDate: start,
        endDate: end,
        deliveryMethod: method,
        vehicleType: method === 'delivery' ? vehicleType : null,
        deliveryAddress: method === 'delivery' ? deliveryAddress.trim() : null,
        deliveryPhone: method === 'delivery' ? deliveryPhone.trim() : null,
        message: message?.trim() || null,
      },
      { upsert: true, new: true }
    );

    return res.status(201).json({ success: true, message: 'Added to cart.', data: { item } });
  } catch (err) {
    console.error('[cart.addToCart]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to add to cart.' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// UPDATE ONE LINE  PATCH /api/cart/:itemId
// ══════════════════════════════════════════════════════════════════════════════
exports.updateCartItem = async (req, res) => {
  try {
    const item = await CartItem.findOne({ _id: req.params.itemId, user: req.user._id });
    if (!item) return res.status(404).json({ success: false, message: 'Cart item not found.' });

    const { startDate, endDate, deliveryMethod, vehicleType, deliveryAddress, deliveryPhone, message } = req.body;

    if (startDate) {
      const start = new Date(startDate); start.setUTCHours(0, 0, 0, 0);
      if (isNaN(start)) return res.status(400).json({ success: false, message: 'Invalid startDate.' });
      item.startDate = start;
    }
    if (endDate) {
      const end = new Date(endDate); end.setUTCHours(0, 0, 0, 0);
      if (isNaN(end)) return res.status(400).json({ success: false, message: 'Invalid endDate.' });
      item.endDate = end;
    }
    if (item.startDate >= item.endDate) {
      return res.status(400).json({ success: false, message: 'endDate must be after startDate.' });
    }

    if (deliveryMethod) {
      const method = deliveryMethod === 'delivery' ? 'delivery' : 'pickup';
      item.deliveryMethod = method;
      if (method === 'delivery') {
        const listing = await Listing.findById(item.listing).select('category').lean();
        const allowedVehicles = getAllowedVehicles(listing?.category);
        const requestedVehicle = vehicleType || item.vehicleType;
        if (!allowedVehicles.includes(requestedVehicle)) {
          return res.status(422).json({
            success: false,
            message: `${listing?.category || 'This item'} can only be delivered by: ${allowedVehicles.join(', ')}.`,
            allowedVehicles,
          });
        }
        item.vehicleType = requestedVehicle;
      } else {
        item.vehicleType = null;
        item.deliveryAddress = null;
        item.deliveryPhone = null;
      }
    }

    // Address / phone are saved OUTSIDE the deliveryMethod block on purpose.
    // The UI patches them on blur with just { deliveryAddress } or
    // { deliveryPhone } and no deliveryMethod, so keeping them nested meant
    // the whole block was skipped and the address was never persisted —
    // checkout then always failed with "Please add a full delivery address".
    // Only applied while the line is a delivery line; switching to pickup
    // above already clears both fields.
    if (item.deliveryMethod === 'delivery') {
      if (deliveryAddress !== undefined) {
        if (!deliveryAddress || deliveryAddress.trim().length < 10) {
          return res.status(422).json({ success: false, message: 'Please enter a full delivery address (at least 10 characters).' });
        }
        item.deliveryAddress = deliveryAddress.trim();
      }
      if (deliveryPhone !== undefined) {
        if (!/^03\d{9}$/.test(String(deliveryPhone || '').trim())) {
          return res.status(422).json({ success: false, message: 'Please enter a valid phone (03XXXXXXXXX).' });
        }
        item.deliveryPhone = deliveryPhone.trim();
      }
    }
    if (message !== undefined) item.message = message?.trim() || null;

    await item.save();
    return res.json({ success: true, message: 'Cart item updated.', data: { item } });
  } catch (err) {
    console.error('[cart.updateCartItem]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update cart item.' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// REMOVE ONE LINE  DELETE /api/cart/:itemId
// ══════════════════════════════════════════════════════════════════════════════
exports.removeFromCart = async (req, res) => {
  try {
    const result = await CartItem.deleteOne({ _id: req.params.itemId, user: req.user._id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Cart item not found.' });
    }
    return res.json({ success: true, message: 'Removed from cart.' });
  } catch (err) {
    console.error('[cart.removeFromCart]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to remove cart item.' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// CLEAR CART  DELETE /api/cart
// ══════════════════════════════════════════════════════════════════════════════
exports.clearCart = async (req, res) => {
  try {
    await CartItem.deleteMany({ user: req.user._id });
    return res.json({ success: true, message: 'Cart cleared.' });
  } catch (err) {
    console.error('[cart.clearCart]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to clear cart.' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// CHECKOUT  POST /api/cart/checkout
// Body: { itemIds?: string[] }  — omit to checkout the entire cart.
// Creates a real Booking per cart line (same path as booking.controller.js's
// createBooking), re-validating availability and re-deriving pricing/advance
// at this moment rather than trusting anything cached in the cart. Lines
// that fail (sold out, deleted, etc.) are reported individually — one bad
// line never blocks the others from succeeding.
// ══════════════════════════════════════════════════════════════════════════════
exports.checkout = async (req, res) => {
  try {
    const { itemIds } = req.body || {};
    const filter = { user: req.user._id };
    if (Array.isArray(itemIds) && itemIds.length > 0) {
      filter._id = { $in: itemIds.filter(id => mongoose.Types.ObjectId.isValid(id)) };
    }

    const items = await CartItem.find(filter).populate('listing');
    if (items.length === 0) {
      return res.status(400).json({ success: false, message: 'No cart items to checkout.' });
    }

    const feeRate = await getFeeRate();
    const created = [];
    const failed = [];

    for (const item of items) {
      try {
        const listing = item.listing;
        if (!listing || listing.isDeleted || listing.status !== 'active') {
          failed.push({ itemId: item._id, reason: 'This listing is no longer available.' });
          continue;
        }
        if (String(listing.createdBy) === String(req.user._id)) {
          failed.push({ itemId: item._id, reason: 'You cannot book your own listing.' });
          continue;
        }

        const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
        if (item.startDate < todayStart) {
          failed.push({ itemId: item._id, reason: 'These dates are in the past — update them and try again.' });
          continue;
        }

        const available = await isListingAvailable(listing._id, item.startDate, item.endDate);
        if (!available) {
          failed.push({ itemId: item._id, reason: 'These dates are no longer available for this listing.' });
          continue;
        }

        // Re-check vehicle eligibility — the listing's category could have
        // changed after this item was added to the cart.
        if (item.deliveryMethod === 'delivery') {
          if (!item.deliveryAddress || item.deliveryAddress.trim().length < 10) {
            failed.push({ itemId: item._id, reason: 'Please add a full delivery address to this item before checking out.' });
            continue;
          }
          if (!/^03\d{9}$/.test(String(item.deliveryPhone || '').trim())) {
            failed.push({ itemId: item._id, reason: 'Please add a valid contact number to this item before checking out.' });
            continue;
          }

          const allowedVehicles = getAllowedVehicles(listing.category);
          if (!allowedVehicles.includes(item.vehicleType)) {
            failed.push({ itemId: item._id, reason: `${listing.category} can only be delivered by: ${allowedVehicles.join(', ')}. Please update this item.` });
            continue;
          }
        }

        const deliveryFee = item.deliveryMethod === 'delivery'
          ? VEHICLE_FEES()[item.vehicleType] || 0
          : 0;
        const { days, subtotal, serviceFee, totalAmount: rentalPortion } = calcPrice(
          listing.price, listing.priceUnit, item.startDate, item.endDate, feeRate, deliveryFee
        );
        const depositAmount = Number(listing.securityDeposit) || 0;
        const totalAmount = rentalPortion + depositAmount;

        const ownerUser = await User.findById(listing.createdBy).select('trustBadge').lean();
        const advancePercent = getAdvancePercentForBadge(ownerUser?.trustBadge || 'none');
        const advanceRental = Math.round(rentalPortion * advancePercent / 100);
        const advanceAmount = advanceRental + depositAmount;
        const remainingAmount = Math.max(0, rentalPortion - advanceRental);

        const deliveryDeadline = item.deliveryMethod === 'delivery'
          ? new Date(Date.now() + Number(process.env.DELIVERY_GRACE_HOURS || 4) * 60 * 60 * 1000)
          : null;

        const generateTrackingNumber = () => {
          const date  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
          const random = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
          return `RNT-${date}-${random}`;
        };

        const booking = await Booking.create({
          listing: listing._id,
          renter: req.user._id,
          owner: listing.createdBy,
          startDate: item.startDate,
          endDate: item.endDate,
          totalDays: days,
          pricePerUnit: listing.price,
          priceUnit: listing.priceUnit,
          subtotal, serviceFee, deliveryFee, totalAmount, depositAmount,
          advancePercent, advanceAmount, remainingAmount, deliveryDeadline,
          message: item.message || null,
          deliveryMethod: item.deliveryMethod,
          deliveryAddress: item.deliveryAddress,
          deliveryPhone: item.deliveryPhone,
          vehicleType: item.deliveryMethod === 'delivery' ? item.vehicleType : null,
          trackingNumber: generateTrackingNumber(),
        });

        // Notify the owner — same as a normal single booking request.
        try {
          const { Notification } = require('../models/Notification');
          await Notification.notify(
            listing.createdBy, 'booking_request', 'New Booking Request',
            `${req.user.name} has requested to rent "${listing.title}" from ${item.startDate.toDateString()} to ${item.endDate.toDateString()}.`,
            { bookingId: booking._id, listingId: listing._id, userId: req.user._id, link: `/bookings/${booking._id}` }
          );
        } catch (e) { console.error('[cart.checkout] owner notify failed:', e.message); }

        created.push(booking.toPublicJSON());
        await CartItem.deleteOne({ _id: item._id }); // remove from cart once successfully booked
      } catch (e) {
        console.error('[cart.checkout] line failed:', e.message);
        failed.push({ itemId: item._id, reason: 'Could not create this booking. Please try again.' });
      }
    }

    return res.status(created.length > 0 ? 201 : 409).json({
      success: created.length > 0,
      message: created.length > 0
        ? `${created.length} booking request${created.length !== 1 ? 's' : ''} sent, awaiting owner confirmation.${failed.length ? ` ${failed.length} item(s) could not be booked.` : ''}`
        : 'No items could be booked.',
      data: { created, failed },
    });
  } catch (err) {
    console.error('[cart.checkout]', err.message);
    return res.status(500).json({ success: false, message: 'Checkout failed. Please try again.' });
  }
};
