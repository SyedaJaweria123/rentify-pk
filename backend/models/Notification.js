'use strict';
const mongoose = require('mongoose');

const NOTIFICATION_TYPES = [
  'booking_request',
  'booking_confirmed',
  'booking_rejected',
  'booking_cancelled',
  'booking_completed',
  'booking_started',
  'review_received',
  'payment_received',
  'payment_sent',
  'withdrawal_processed',
  'cnic_verified',
  'cnic_rejected',
  'new_message',
  'listing_approved',
  'account_suspended',
  'dispute_opened',
  'dispute_resolved',
  'system',
];

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:      { type: String, enum: NOTIFICATION_TYPES, required: true },
  title:     { type: String, required: true, maxlength: 100 },
  body:      { type: String, required: true, maxlength: 500 },
  isRead:    { type: Boolean, default: false },
  readAt:    { type: Date, default: null },

  // Optional metadata link
  meta: {
    bookingId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Booking',  default: null },
    listingId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Listing',  default: null },
    reviewId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Review',   default: null },
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User',     default: null },
    link:       { type: String, default: null },
  },
}, { timestamps: true });

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // TTL 90d

// ── Static: create notification ───────────────────────────────────────────────
notificationSchema.statics.notify = async function (recipientId, type, title, body, meta = {}) {
  return this.create({ recipient: recipientId, type, title, body, meta });
};

// ── Static: notify ALL admins (admin / super_admin / manager) ─────────────────
// Used for platform-wide events the admin team should see (new booking, new user,
// CNIC submitted, etc.). Sends one notification per admin user.
notificationSchema.statics.notifyAdmins = async function (type, title, body, meta = {}) {
  const User = require('./User');
  const admins = await User.find({ role: { $in: ['admin', 'super_admin', 'manager'] } }).select('_id').lean();
  if (!admins.length) return;
  const docs = admins.map(a => ({ recipient: a._id, type, title, body, meta }));
  return this.insertMany(docs);
};

// ── Static: bulk mark read ────────────────────────────────────────────────────
notificationSchema.statics.markAllRead = async function (recipientId) {
  return this.updateMany(
    { recipient: recipientId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
};

module.exports = {
  Notification: mongoose.model('Notification', notificationSchema),
  NOTIFICATION_TYPES,
};
