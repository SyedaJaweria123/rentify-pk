'use strict';
/**
 * CallLog Model — Rentify PK
 * Records every video/voice call attempt between two users (chat or
 * rider-delivery calls) for history, support/dispute review, and analytics.
 *
 * Schema: { caller, receiver, conversation, callType, status, roomId,
 *           startedAt, endedAt, durationSeconds } + timestamps
 * Indexes: caller, receiver, conversation, (caller + createdAt)
 */
const mongoose = require('mongoose');

const callLogSchema = new mongoose.Schema(
  {
    caller:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Linked conversation, when the call originated from chat (not rider-delivery)
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', default: null, index: true },

    callType: { type: String, enum: ['video', 'voice'], required: true },

    // 'ringing'   → invite sent, no answer yet
    // 'completed' → accepted and later ended normally
    // 'missed'    → ringing too long / receiver never responded
    // 'declined'  → receiver explicitly declined
    status: {
      type: String,
      enum: ['ringing', 'completed', 'missed', 'declined'],
      default: 'ringing',
      index: true,
    },

    roomId: { type: String, required: true },

    startedAt:       { type: Date, default: Date.now }, // invite sent time
    answeredAt:       { type: Date, default: null },      // when receiver accepted
    endedAt:          { type: Date, default: null },
    durationSeconds:  { type: Number, default: 0 },       // computed: endedAt - answeredAt
  },
  { timestamps: true, versionKey: false }
);

callLogSchema.index({ caller: 1, createdAt: -1 });
callLogSchema.index({ receiver: 1, createdAt: -1 });

module.exports = mongoose.model('CallLog', callLogSchema);
