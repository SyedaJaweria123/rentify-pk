'use strict';
/**
 * Notification Service — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified service for SMS (Twilio) + Push (FCM) notifications.
 * Every rider delivery event triggers BOTH channels automatically.
 *
 * SMS:  sendSMS() from sms.service.js (Twilio, already configured)
 * FCM:  Firebase Admin SDK — sends push to user's device if fcmToken saved
 *
 * ETA:  Google Maps Distance Matrix API (real driving time)
 *       Called from rider updateLocation — if ETA ≤ 10 min, SMS+Push sent once.
 *
 * Events handled:
 *   notifyRiderAssigned(booking)        — rider assigned to booking
 *   notifyRiderAtPickup(booking)        — rider reached owner location
 *   notifyItemPickedUp(booking)         — item picked up, in delivery
 *   notifyItemDelivered(booking)        — item delivered to renter
 *   notifyETA10Min(booking, etaMinutes) — rider ~10 min away (auto, from location)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { sendSMS } = require('./sms.service');
const { sendRiderAssignedEmail, sendItemPickedUpEmail, sendItemDeliveredEmail } = require('../utils/email');

// ── FCM Setup (Firebase Admin SDK) ───────────────────────────────────────────
let fcmAdmin = null;

(function initFCM() {
  const projectId   = process.env.FCM_PROJECT_ID;
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  const privateKey  = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    console.info('ℹ️  FCM: not configured (FCM_PROJECT_ID/FCM_CLIENT_EMAIL/FCM_PRIVATE_KEY missing) — push disabled.');
    return;
  }
  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
    }
    fcmAdmin = admin;
    console.log('✅ FCM: Firebase Admin configured.');
  } catch (err) {
    console.warn('⚠️  FCM init failed:', err.message);
  }
})();

// ── Send Push Notification (FCM) ─────────────────────────────────────────────
async function sendPush(fcmToken, title, body, data = {}) {
  if (!fcmAdmin || !fcmToken) return false;
  try {
    await fcmAdmin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: { ...data },
      android: { priority: 'high', notification: { sound: 'default', channelId: 'rentify_delivery' } },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    });
    return true;
  } catch (err) {
    console.error('[FCM] push failed:', err.message);
    return false;
  }
}

// ── Send both SMS + Push to a user ───────────────────────────────────────────
async function notifyUser(user, smsText, pushTitle, pushBody, pushData = {}) {
  const results = await Promise.allSettled([
    sendSMS(user?.phone, smsText),
    sendPush(user?.fcmToken, pushTitle, pushBody, pushData),
  ]);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT HELPERS
// Each function accepts a fully-populated booking object:
//   booking.renter  { name, phone, fcmToken }
//   booking.owner   { name, phone, fcmToken }
//   booking.listing { title }
// ─────────────────────────────────────────────────────────────────────────────

const item = (booking) => booking?.listing?.title || 'your item';

// 1. Rider assigned to booking — tracking number email mein bhejo
async function notifyRiderAssigned(booking) {
  const itemName      = item(booking);
  const trackingNum   = booking.trackingNumber || null;

  await Promise.allSettled([
    // → Renter: SMS + Push + Email (tracking number ke saath)
    notifyUser(
      booking.renter,
      `Rentify: Rider assign ho gaya "${itemName}" ki delivery ke liye. Tracking: ${trackingNum || 'N/A'} - Rentify PK`,
      'Rider Assign Ho Gaya!',
      `"${itemName}" ki delivery ke liye rider aa raha hai. Tracking: ${trackingNum || ''}`,
      { event: 'rider_assigned', bookingId: String(booking._id), trackingNumber: trackingNum }
    ),
    sendRiderAssignedEmail({
      to            : booking.renter?.email,
      name          : booking.renter?.name,
      listingTitle  : itemName,
      isOwner       : false,
      trackingNumber: trackingNum,
    }).catch(() => {}),
    // → Owner: SMS + Push + Email (tracking number ke saath)
    notifyUser(
      booking.owner,
      `Rentify: Rider "${itemName}" collect karne aa raha hai. Tracking: ${trackingNum || 'N/A'} - Rentify PK`,
      'Rider Aa Raha Hai',
      `"${itemName}" collect karne ke liye rider aapki taraf aa raha hai.`,
      { event: 'rider_assigned', bookingId: String(booking._id) }
    ),
    sendRiderAssignedEmail({
      to            : booking.owner?.email,
      name          : booking.owner?.name,
      listingTitle  : itemName,
      isOwner       : true,
      trackingNumber: trackingNum,
    }).catch(() => {}),
  ]);
}

// 2. Rider reached owner location (pickup point)
async function notifyRiderAtPickup(booking) {
  const itemName = item(booking);
  await Promise.allSettled([
    notifyUser(
      booking.owner,
      `Rentify: Rider aapke paas pohonch gaya "${itemName}" collect karne. Darwaza khol dein. - Rentify PK`,
      'Rider Pahonch Gaya!',
      `Rider aapke darwaze par hai — "${itemName}" de dein.`,
      { event: 'rider_at_pickup', bookingId: String(booking._id) }
    ),
    notifyUser(
      booking.renter,
      `Rentify: Rider owner se "${itemName}" le raha hai. Delivery jald hogi. - Rentify PK`,
      'Item Pickup Ho Raha Hai',
      `Rider owner se "${itemName}" collect kar raha hai.`,
      { event: 'rider_at_pickup', bookingId: String(booking._id) }
    ),
  ]);
}

// 3. Item picked up — now in delivery
async function notifyItemPickedUp(booking) {
  const itemName = item(booking);
  await Promise.allSettled([
    notifyUser(
      booking.renter,
      `Rentify: "${itemName}" pick up ho gaya! Rider delivery ke liye nikal gaya. Jald pohonchega. - Rentify PK`,
      'Item Raste Mein Hai!',
      `"${itemName}" pick up ho gaya — rider aapki taraf aa raha hai.`,
      { event: 'item_picked_up', bookingId: String(booking._id) }
    ),
    sendItemPickedUpEmail({ to: booking.renter?.email, name: booking.renter?.name, listingTitle: itemName, isOwner: false }).catch(() => {}),
    notifyUser(
      booking.owner,
      `Rentify: Rider ne "${itemName}" pick up kar liya. Delivery shuru. - Rentify PK`,
      'Pickup Complete',
      `"${itemName}" rider ke paas hai — delivery shuru ho gayi.`,
      { event: 'item_picked_up', bookingId: String(booking._id) }
    ),
    sendItemPickedUpEmail({ to: booking.owner?.email, name: booking.owner?.name, listingTitle: itemName, isOwner: true }).catch(() => {}),
  ]);
}

// 4. Rider ~10 min away from renter (auto-triggered from ETA calculation)
async function notifyETA10Min(booking, etaMinutes) {
  const itemName = item(booking);
  const etaText  = etaMinutes <= 5 ? '5 minute' : '10 minute';
  await notifyUser(
    booking.renter,
    `Rentify: Rider "${itemName}" le kar ${etaText} mein pohonchne wala hai! Tayyar rahein. - Rentify PK`,
    `Rider ${etaText} Mein Aayega!`,
    `"${itemName}" aapke darwaze par ${etaText} mein hoga.`,
    { event: 'eta_10_min', bookingId: String(booking._id), etaMinutes: String(etaMinutes) }
  );
}

// 5. Item delivered
async function notifyItemDelivered(booking) {
  const itemName = item(booking);
  await Promise.allSettled([
    notifyUser(
      booking.renter,
      `Rentify: "${itemName}" deliver ho gaya! Enjoy karein. Wapsi se pehle hamare saath zaroor rating dein. - Rentify PK`,
      'Delivery Complete!',
      `"${itemName}" pohonch gaya — enjoy karein!`,
      { event: 'item_delivered', bookingId: String(booking._id) }
    ),
    sendItemDeliveredEmail({ to: booking.renter?.email, name: booking.renter?.name, listingTitle: itemName, isOwner: false, bookingId: booking._id }).catch(() => {}),
    notifyUser(
      booking.owner,
      `Rentify: "${itemName}" successfully deliver ho gaya. Shukriya! - Rentify PK`,
      'Delivery Complete',
      `"${itemName}" renter tak pohonch gaya.`,
      { event: 'item_delivered', bookingId: String(booking._id) }
    ),
    sendItemDeliveredEmail({ to: booking.owner?.email, name: booking.owner?.name, listingTitle: itemName, isOwner: true, bookingId: booking._id }).catch(() => {}),
  ]);
}

// ── ETA Calculator (Google Maps Distance Matrix) ──────────────────────────────
// Returns driving minutes between two coords, or null if API not configured.
async function getETAMinutes(originLat, originLng, destLat, destLng) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json`
      + `?origins=${originLat},${originLng}`
      + `&destinations=${destLat},${destLng}`
      + `&mode=driving&key=${key}`;
    const res  = await fetch(url);
    const data = await res.json();
    const sec  = data?.rows?.[0]?.elements?.[0]?.duration?.value;
    return sec ? Math.round(sec / 60) : null;
  } catch (err) {
    console.error('[ETA] Google Maps error:', err.message);
    return null;
  }
}

module.exports = {
  notifyRiderAssigned,
  notifyRiderAtPickup,
  notifyItemPickedUp,
  notifyETA10Min,
  notifyItemDelivered,
  getETAMinutes,
  sendPush,
};
