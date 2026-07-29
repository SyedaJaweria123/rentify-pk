'use strict';
/**
 * Listing Validation Middleware — RentAnything PK
 * Validates all listing fields on create/update with professional error messages.
 */
const { CATEGORIES, STATUS } = require('../models/Listing');

// ── Helpers ───────────────────────────────────────────────────────────────────
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * Validate listing body — used for both create and update.
 * Returns { valid: boolean, errors: Object }
 */
const validateListingBody = (body, isUpdate = false) => {
  const errors = {};

  // Title
  if (!isUpdate || body.title !== undefined) {
    if (!isNonEmptyString(body.title))             errors.title = 'Title is required.';
    else if (body.title.trim().length < 5)         errors.title = 'Title must be at least 5 characters.';
    else if (body.title.trim().length > 120)       errors.title = 'Title cannot exceed 120 characters.';
  }

  // Description
  if (!isUpdate || body.description !== undefined) {
    if (!isNonEmptyString(body.description))       errors.description = 'Description is required.';
    else if (body.description.trim().length < 20)  errors.description = 'Description must be at least 20 characters.';
    else if (body.description.trim().length > 2000) errors.description = 'Description cannot exceed 2000 characters.';
  }

  // Category
  if (!isUpdate || body.category !== undefined) {
    if (!isNonEmptyString(body.category))          errors.category = 'Category is required.';
    else if (!CATEGORIES.includes(body.category))  errors.category = `Invalid category. Must be one of: ${CATEGORIES.join(', ')}.`;
  }

  // Price
  if (!isUpdate || body.price !== undefined) {
    const price = parseFloat(body.price);
    if (body.price === undefined || body.price === null || body.price === '') {
      errors.price = 'Price is required.';
    } else if (isNaN(price) || price < 1) {
      errors.price = 'Price must be a number of at least Rs. 1.';
    } else if (price > 999999) {
      errors.price = 'Price cannot exceed Rs. 999,999.';
    }
  }

  // Price Unit
  const VALID_UNITS = ['per_day', 'per_week', 'per_month', 'per_hour'];
  if (body.priceUnit !== undefined && !VALID_UNITS.includes(body.priceUnit)) {
    errors.priceUnit = `Invalid price unit. Must be one of: ${VALID_UNITS.join(', ')}.`;
  }

  // Status (only on update)
  if (body.status !== undefined && !STATUS.includes(body.status)) {
    errors.status = `Invalid status. Must be one of: ${STATUS.join(', ')}.`;
  }

  // City / Area (optional but max length)
  if (body.city && body.city.trim().length > 60) {
    errors.city = 'City name cannot exceed 60 characters.';
  }
  if (body.area && body.area.trim().length > 100) {
    errors.area = 'Area cannot exceed 100 characters.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
};

// ── Express middleware: validate on create ─────────────────────────────────────
const validateCreateListing = (req, res, next) => {
  const { valid, errors } = validateListingBody(req.body, false);
  if (!valid) return res.status(422).json({ success: false, message: 'Validation failed.', errors });
  next();
};

// ── Express middleware: validate on update (partial) ──────────────────────────
const validateUpdateListing = (req, res, next) => {
  const { valid, errors } = validateListingBody(req.body, true);
  if (!valid) return res.status(422).json({ success: false, message: 'Validation failed.', errors });
  next();
};

module.exports = { validateCreateListing, validateUpdateListing, validateListingBody };
