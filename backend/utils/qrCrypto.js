'use strict';
/**
 * QR Crypto — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * AES-256-CBC encryption for handover QR codes. The QR encodes the booking +
 * assignment so a rider's scan can be verified server-side (anti-fraud).
 *
 * Env: QR_SECRET  (any string; we derive a 32-byte key from it via SHA-256)
 * ─────────────────────────────────────────────────────────────────────────────
 */
const crypto = require('crypto');

const ALGO = 'aes-256-cbc';
const keyFromSecret = () => {
  const secret = process.env.QR_SECRET || process.env.JWT_SECRET || 'rentify-default-qr-secret';
  return crypto.createHash('sha256').update(String(secret)).digest();   // 32 bytes
};

/**
 * Encrypt a payload object → compact string "ivHex:cipherHex".
 * @param {object} payload  e.g. { bookingId, assignmentId, type }
 */
const encryptQR = (payload) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, keyFromSecret(), iv);
  const json = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
};

/**
 * Decrypt a QR string back to its payload object. Throws on tamper/invalid.
 * @param {string} token  "ivHex:cipherHex"
 * @returns {object}
 */
const decryptQR = (token) => {
  if (!token || typeof token !== 'string' || !token.includes(':')) {
    throw new Error('Invalid QR format.');
  }
  const [ivHex, dataHex] = token.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGO, keyFromSecret(), iv);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
};

module.exports = { encryptQR, decryptQR };
