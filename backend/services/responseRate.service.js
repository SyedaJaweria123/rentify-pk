'use strict';
/**
 * Response Rate Service — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Calculates the real percentage of conversations an owner actually replied
 * to within 24 hours of the renter's first message — no fabricated numbers.
 *
 * Definition: for every conversation where this owner is a participant and
 * the OTHER participant (the renter) sent at least one message, did the
 * owner send a reply within 24 hours of that renter's first message in the
 * conversation? responseRate = (conversations answered in time) / (total
 * conversations where the renter reached out).
 *
 * Conversations where the renter never sent anything (e.g. an empty thread
 * that was started but never used) don't count in either the numerator or
 * denominator — there's nothing to "respond" to yet.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const mongoose = require('mongoose');
const { Conversation, Message } = require('../models/Message');

const RESPONSE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * @param {string|ObjectId} ownerId
 * @returns {Promise<{ responseRate: number, totalConversations: number, respondedInTime: number }>}
 */
async function getOwnerResponseRate(ownerId) {
  const ownerObjId = new mongoose.Types.ObjectId(ownerId);

  // Capped to the owner's most recent conversations — keeps this fast even
  // for very active owners, and recent activity is the most representative
  // (and most relevant to a renter deciding whether to message them today).
  const MAX_CONVERSATIONS_SCANNED = 200;

  const conversations = await Conversation.find({ participants: ownerObjId })
    .select('_id participants')
    .sort({ updatedAt: -1 })
    .limit(MAX_CONVERSATIONS_SCANNED)
    .lean();

  if (conversations.length === 0) {
    return { responseRate: 0, totalConversations: 0, respondedInTime: 0 };
  }

  let totalWithRenterMessage = 0;
  let respondedInTime = 0;

  for (const conv of conversations) {
    const renterId = conv.participants.find(p => String(p) !== String(ownerObjId));
    if (!renterId) continue; // malformed conversation — skip rather than guess

    // First message from the renter in this conversation.
    const firstRenterMsg = await Message.findOne({
      conversation: conv._id,
      sender: renterId,
    }).sort({ createdAt: 1 }).select('createdAt').lean();

    if (!firstRenterMsg) continue; // renter never actually sent anything yet

    totalWithRenterMessage++;

    // First owner reply that came AFTER the renter's first message.
    const firstOwnerReply = await Message.findOne({
      conversation: conv._id,
      sender: ownerObjId,
      createdAt: { $gt: firstRenterMsg.createdAt },
    }).sort({ createdAt: 1 }).select('createdAt').lean();

    if (firstOwnerReply) {
      const replyDelayMs = new Date(firstOwnerReply.createdAt) - new Date(firstRenterMsg.createdAt);
      if (replyDelayMs <= RESPONSE_WINDOW_MS) respondedInTime++;
    }
  }

  const responseRate = totalWithRenterMessage > 0
    ? Math.round((respondedInTime / totalWithRenterMessage) * 100)
    : 0;

  return { responseRate, totalConversations: totalWithRenterMessage, respondedInTime };
}

module.exports = { getOwnerResponseRate, RESPONSE_WINDOW_MS };
