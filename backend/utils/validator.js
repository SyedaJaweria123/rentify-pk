'use strict';
/**
 * Validator Utilities — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure, dependency-light helpers for input validation & sanitisation.
 * Each returns a primitive (string/boolean) or a { valid, message } object so
 * callers can compose their own error responses.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const mongoose = require('mongoose');

/**
 * Trim, strip HTML tags, collapse whitespace and truncate.
 * @param {string} str
 * @param {number} [maxLen=Infinity]
 * @returns {string}
 */
const sanitizeString = (str, maxLen = Infinity) => {
  if (str === null || str === undefined) return '';
  let s = String(str);
  s = s.replace(/<[^>]*>/g, '');          // strip HTML tags
  s = s.replace(/\s+/g, ' ').trim();      // collapse whitespace
  if (Number.isFinite(maxLen) && s.length > maxLen) s = s.slice(0, maxLen).trim();
  return s;
};

/** Valid Mongoose ObjectId? */
const validateObjectId = (id) =>
  !!id && mongoose.Types.ObjectId.isValid(String(id))
  && String(new mongoose.Types.ObjectId(String(id))) === String(id);

/**
 * Pakistani phone number.
 * Accepts: +923001234567 | 923001234567 | 03001234567
 * Mobile prefixes are 03xx (network code 0).
 */
const validatePakistaniPhone = (phone) => {
  if (!phone) return false;
  const p = String(phone).replace(/[\s-]/g, '');
  return /^(\+92|0092|92|0)?3\d{9}$/.test(p);
};

/**
 * Pakistan CNIC — 13 digits, with or without dashes.
 * Format: 12345-1234567-1
 */
const validateCNIC = (cnic) => {
  if (!cnic) return false;
  const digits = String(cnic).replace(/[\s-]/g, '');
  if (!/^\d{13}$/.test(digits)) return false;
  // Basic structural sanity: province digit 1–7
  const province = Number(digits[0]);
  return province >= 1 && province <= 7;
};

/** RFC-ish email check (practical, not the full 400-char RFC monster). */
const validateEmail = (email) => {
  if (!email) return false;
  const e = String(email).trim();
  if (e.length > 254) return false;
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(e);
};

/**
 * Password strength: min 8 chars, at least one upper, lower, number, special.
 * @returns {{ valid: boolean, message: string }}
 */
const validatePassword = (pass) => {
  if (!pass || typeof pass !== 'string') return { valid: false, message: 'Password is required.' };
  if (pass.length < 8) return { valid: false, message: 'Password must be at least 8 characters.' };
  if (!/[A-Z]/.test(pass)) return { valid: false, message: 'Password must contain an uppercase letter.' };
  if (!/[a-z]/.test(pass)) return { valid: false, message: 'Password must contain a lowercase letter.' };
  if (!/\d/.test(pass))   return { valid: false, message: 'Password must contain a number.' };
  if (!/[^A-Za-z0-9]/.test(pass)) return { valid: false, message: 'Password must contain a special character.' };
  return { valid: true, message: 'Strong password.' };
};

/**
 * Validate a [start, end] booking range.
 * Both must parse, end must be strictly after start, and start must not be in
 * the past (compared at day granularity).
 * @returns {{ valid: boolean, message: string }}
 */
const validateDateRange = (start, end) => {
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) {
    return { valid: false, message: 'Invalid start or end date.' };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sDay = new Date(s); sDay.setHours(0, 0, 0, 0);
  if (sDay < today) return { valid: false, message: 'Start date cannot be in the past.' };
  if (e <= s)       return { valid: false, message: 'End date must be after start date.' };
  return { valid: true, message: 'Valid date range.' };
};

module.exports = {
  sanitizeString,
  validateObjectId,
  validatePakistaniPhone,
  validateCNIC,
  validateEmail,
  validatePassword,
  validateDateRange,
};
