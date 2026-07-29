'use strict';
const mongoose = require('mongoose');

// ── Conversation (thread between renter and owner per booking) ────────────────
const conversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  booking:      { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
  listing:      { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', default: null },

  lastMessage:     { type: String, default: null },
  lastMessageAt:   { type: Date, default: null },
  lastMessageBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // Unread count per participant
  unreadCounts: {
    type: Map,
    of: Number,
    default: {},
  },

  isArchived: { type: Boolean, default: false },
}, { timestamps: true });

conversationSchema.index({ participants: 1, updatedAt: -1 });
conversationSchema.index({ booking: 1 });

// ── Message ────────────────────────────────────────────────────────────────────
const messageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  content: {
    type: String, trim: true,
    maxlength: [2000, 'Message cannot exceed 2000 characters.'],
  },

  type: {
    type: String,
    enum: ['text', 'image', 'video', 'audio', 'location', 'system'],
    default: 'text',
  },

  // For image messages
  imageUrl:   { type: String, default: null },
  imagePublicId: { type: String, default: null },

  // For video messages
  videoUrl:       { type: String, default: null },
  videoPublicId:  { type: String, default: null },
  videoThumbUrl:  { type: String, default: null },
  videoDuration:  { type: Number, default: null },   // seconds

  // For voice/audio messages
  audioUrl:      { type: String, default: null },
  audioPublicId: { type: String, default: null },
  audioDuration: { type: Number, default: null },   // seconds

  // For location messages
  locationLat:   { type: Number, default: null },
  locationLng:   { type: Number, default: null },
  locationLabel: { type: String, default: null },   // optional human-readable address

  // Reply-to (quote a previous message, like WhatsApp)
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },

  isRead:     { type: Boolean, default: false },
  readAt:     { type: Date, default: null },

  // "Delete for everyone" — message is gone for ALL participants.
  isDeleted:  { type: Boolean, default: false },
  deletedAt:  { type: Date, default: null },

  // "Delete for me" — message stays intact for others, just hidden for
  // whichever user IDs are in this list. Checked per-request in getMessages.
  deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

}, { timestamps: true });

messageSchema.index({ conversation: 1, createdAt: 1 });
messageSchema.index({ sender: 1, createdAt: -1 });

module.exports = {
  Conversation: mongoose.model('Conversation', conversationSchema),
  Message:      mongoose.model('Message', messageSchema),
};
