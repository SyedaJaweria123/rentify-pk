'use strict';
/**
 * SMS Service — Rentify PK (Twilio, graceful fallback)
 * ─────────────────────────────────────────────────────────────────────────────
 * Sends transactional SMS alerts (booking confirmed, rider assigned, payment
 * released). Pakistan reads SMS far more reliably than email, so important
 * events get a text in addition to the in-app notification.
 *
 *   sendSMS(toPhone, message)          → low-level send (returns boolean)
 *   smsBookingConfirmed(user, booking) → templated helpers
 *   smsRiderAssigned(user, booking)
 *   smsPaymentReleased(user, amount)
 *
 * Config (.env):
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 *
 * Graceful: if Twilio is not configured or a send fails, we log and return
 * false — the app NEVER crashes and the in-app notification still happens.
 * ─────────────────────────────────────────────────────────────────────────────
 */

let twilioClient = null;
let configured = false;
let warnedOnce = false;

(function initTwilio() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) {
    // Not configured — SMS silently disabled (fine for development).
    return;
  }
  try {
    const twilio = require('twilio');
    twilioClient = twilio(sid, token);
    configured = true;
    if (process.env.NODE_ENV === 'development') console.log('✅ SMS: Twilio configured.');
  } catch (err) {
    console.warn(`⚠️  SMS: Twilio init failed (${err.message}) — SMS disabled.`);
    twilioClient = null;
    configured = false;
  }
})();

/**
 * Normalize a Pakistani phone number to E.164 (+92...).
 *   03001234567  → +923001234567
 *   3001234567   → +923001234567
 *   +923001234567→ +923001234567
 * Returns null if it can't be normalized.
 */
function toE164(phone) {
  if (!phone) return null;
  let p = String(phone).replace(/[\s-]/g, '');
  if (p.startsWith('+92')) return p;
  if (p.startsWith('92'))  return '+' + p;
  if (p.startsWith('03'))  return '+92' + p.slice(1);   // 0300... → +92300...
  if (p.startsWith('3') && p.length === 10) return '+92' + p;
  return null;
}

/**
 * Send an SMS. Returns true on success, false otherwise (never throws).
 */
async function sendSMS(toPhone, message) {
  const to = toE164(toPhone);
  if (!to) return false;                 // invalid/missing number — skip silently

  if (!configured || !twilioClient) {
    if (!warnedOnce && process.env.NODE_ENV !== 'test') {
      console.warn('ℹ️  SMS: Twilio not configured — skipping SMS (set TWILIO_* in .env to enable).');
      warnedOnce = true;
    }
    return false;
  }

  try {
    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
    return true;
  } catch (err) {
    console.error(`[SMS] send failed to ${to}: ${err.message}`);
    return false;
  }
}

// ── Templated helpers (fire-and-forget; safe to call without awaiting) ────────

async function smsBookingConfirmed(user, booking) {
  const item = booking?.listingTitle || 'your rental';
  return sendSMS(user?.phone,
    `Rentify: Your booking for "${item}" is CONFIRMED. Please complete payment to proceed. - Rentify PK`);
}

async function smsRiderAssigned(user, booking) {
  const item = booking?.listingTitle || 'your item';
  return sendSMS(user?.phone,
    `Rentify: A rider has been assigned for "${item}". They will contact you for pickup/delivery soon. - Rentify PK`);
}

async function smsPaymentReleased(user, amount) {
  return sendSMS(user?.phone,
    `Rentify: Rs ${amount} from your completed rental has been released to your wallet. - Rentify PK`);
}

async function smsPaymentVerified(user, booking) {
  const item = booking?.listingTitle || 'your rental';
  return sendSMS(user?.phone,
    `Rentify: Your payment for "${item}" is verified and your booking is secured. - Rentify PK`);
}

module.exports = {
  sendSMS,
  smsBookingConfirmed,
  smsRiderAssigned,
  smsPaymentReleased,
  smsPaymentVerified,
  toE164,
  isConfigured: () => configured,
};
