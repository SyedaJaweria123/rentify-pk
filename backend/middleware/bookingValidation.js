'use strict';
const mongoose = require('mongoose');

const validateCreateBooking = (req, res, next) => {
  const { listingId, startDate, endDate, deliveryMethod } = req.body;
  const errors = {};

  if (!listingId || !mongoose.Types.ObjectId.isValid(listingId)) {
    errors.listingId = 'Valid listing ID is required.';
  }

  const start = startDate ? new Date(startDate) : null;
  const end   = endDate   ? new Date(endDate)   : null;

  // Compare by calendar day (start of today), not exact time —
  // otherwise a booking for "today" is wrongly rejected as past.
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  if (!startDate || !start || isNaN(start)) {
    errors.startDate = 'Valid start date is required.';
  } else if (start < todayStart) {
    errors.startDate = 'Start date cannot be in the past.';
  }

  if (!endDate || !end || isNaN(end)) {
    errors.endDate = 'Valid end date is required.';
  } else if (start && end && end <= start) {
    errors.endDate = 'End date must be after start date.';
  }

  if (deliveryMethod && !['pickup', 'delivery'].includes(deliveryMethod)) {
    errors.deliveryMethod = "Delivery method must be 'pickup' or 'delivery'.";
  }

  if (Object.keys(errors).length > 0) {
    return res.status(422).json({ success: false, message: 'Validation failed.', errors });
  }

  next();
};

const validateReview = (req, res, next) => {
  const { bookingId, rating, comment } = req.body;
  const errors = {};

  if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
    errors.bookingId = 'Valid booking ID is required.';
  }

  const r = parseInt(rating);
  if (!rating || isNaN(r) || r < 1 || r > 5) {
    errors.rating = 'Rating must be a number between 1 and 5.';
  }

  if (!comment || comment.trim().length < 10) {
    errors.comment = 'Review comment must be at least 10 characters.';
  } else if (comment.trim().length > 1000) {
    errors.comment = 'Review comment cannot exceed 1000 characters.';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(422).json({ success: false, message: 'Validation failed.', errors });
  }

  next();
};

module.exports = { validateCreateBooking, validateReview };
