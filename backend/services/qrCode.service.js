'use strict';
/**
 * QR Code Service — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Encrypts a booking reference into a tamper-proof QR payload (AES-256-CBC) and
 * renders it as a scannable PNG. Used for rider handover verification.
 *
 * Env: QR_SECRET
 * ─────────────────────────────────────────────────────────────────────────────
 */
const QRCode = require('qrcode');
const { encryptQR, decryptQR } = require('../utils/qrCrypto');

/**
 * Generate the encrypted QR payload string for a booking.
 * @param {string} bookingId
 * @param {object} [extra]  optional extra fields (e.g. { assignmentId, type })
 * @returns {string} encrypted "ivHex:cipherHex"
 */
const generateQR = (bookingId, extra = {}) => {
  if (!bookingId) throw new Error('bookingId is required.');
  return encryptQR({ bookingId: String(bookingId), ts: Date.now(), ...extra });
};

/**
 * Verify + decrypt a QR payload back to the bookingId.
 * @param {string} encryptedCode
 * @returns {{ bookingId, ...rest }}
 * @throws if tampered/invalid
 */
const verifyQR = (encryptedCode) => {
  const payload = decryptQR(encryptedCode);   // throws on tamper
  if (!payload?.bookingId) throw new Error('QR payload missing bookingId.');
  return payload;
};

/**
 * Render the encrypted QR payload as a base64 PNG data URL.
 * @param {string} bookingId
 * @param {object} [extra]
 * @returns {Promise<{ payload: string, dataUrl: string }>}
 */
const generateQRImage = async (bookingId, extra = {}) => {
  const payload = generateQR(bookingId, extra);
  const dataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
    color: { dark: '#143524', light: '#FFFFFF' },   // brand deep-green
  });
  return { payload, dataUrl };
};

module.exports = { generateQR, verifyQR, generateQRImage };
