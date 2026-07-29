'use strict';
const mongoose = require('mongoose');
const { Conversation, Message } = require('../models/Message');
const { Notification } = require('../models/Notification');
const { emitToUser } = require('../utils/socket'); // real-time message push

// ── Helper: get or create conversation (one per participant pair, WhatsApp-style)
const getOrCreateConversation = async (userId, otherUserId, bookingId = null, listingId = null) => {
  // Sort participant IDs to ensure consistent lookup
  const participants = [userId, otherUserId].sort();

  // WhatsApp-style: ONE conversation per pair of people, regardless of booking.
  // We always look up by the participant pair (not by booking), so messages
  // about different bookings land in the same thread.
  let conversation = await Conversation.findOne({
    participants: { $all: participants, $size: 2 },
  }).sort({ lastMessageAt: -1 });

  if (!conversation) {
    conversation = await Conversation.create({
      participants,
      booking: bookingId || null,
      listing: listingId || null,
      unreadCounts: { [userId.toString()]: 0, [otherUserId.toString()]: 0 },
    });
  } else if (bookingId && !conversation.booking) {
    // Keep a reference to the latest booking for context, without splitting threads
    conversation.booking = bookingId;
    if (listingId) conversation.listing = listingId;
    await conversation.save();
  }

  return conversation;
};

// ═════════════════════════════════════════════════════════════════════════════
// GET MY CONVERSATIONS  GET /api/messages/conversations
// ═════════════════════════════════════════════════════════════════════════════
const getConversations = async (req, res) => {
  try {
    const myId = req.user._id.toString();

    const conversations = await Conversation.find({ participants: req.user._id, isArchived: false })
      .populate('participants', 'name avatar email')
      .populate('booking',     'status startDate endDate totalAmount')
      .populate('listing',     'title images price priceUnit')
      .populate('lastMessageBy', 'name')
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(100)
      .lean();

    // WhatsApp-style: one chat per person.
    // 1. Hide conversations that have no messages yet.
    // 2. Merge all conversations with the same other-participant into a single
    //    entry — keep the most recent one (already sorted desc), sum unread.
    const byPerson = new Map();   // otherUserId → merged conversation

    for (const c of conversations) {
      // Skip empty chats (no message ever sent)
      if (!c.lastMessageAt && !c.lastMessage) continue;

      const other = c.participants.find(p => p._id.toString() !== myId);
      if (!other) continue;                       // safety: skip malformed
      const key = other._id.toString();

      const myUnread = c.unreadCounts?.[myId] || 0;

      if (!byPerson.has(key)) {
        // First (most recent) conversation for this person becomes the base
        byPerson.set(key, {
          ...c,
          myUnreadCount: myUnread,
          otherParticipant: other,
        });
      } else {
        // Older conversation with same person — just add its unread count
        const existing = byPerson.get(key);
        existing.myUnreadCount += myUnread;
      }
    }

    const result = Array.from(byPerson.values());

    return res.json({ success: true, data: { conversations: result } });
  } catch (err) {
    console.error('[getConversations]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch conversations.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// GET MESSAGES  GET /api/messages/:conversationId
// ═════════════════════════════════════════════════════════════════════════════
const getMessages = async (req, res) => {
  try {
    const conversationId = req.params.id;   // route is /conversations/:id
    const { page = 1, limit = 30 } = req.query;
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit) || 30);
    const skip     = (pageNum - 1) * limitNum;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.user._id,
    })
      .populate('participants', 'name avatar email')
      .populate('listing', 'title images price priceUnit')
      .populate('booking', 'status startDate endDate totalAmount');

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }

    const [messages, total] = await Promise.all([
      Message.find({
        conversation: conversationId,
        // NOTE: isDeleted (delete-for-everyone) messages are intentionally
        // KEPT here — WhatsApp shows a "This message was deleted" placeholder
        // for those, it doesn't remove them from the thread. Only
        // "delete for me" (deletedFor) actually hides a message, and only
        // for the user who deleted it.
        deletedFor: { $ne: req.user._id },
      })
        .populate('sender', 'name avatar')
        .populate('replyTo', 'content type sender imageUrl audioUrl videoUrl locationLat locationLng isDeleted')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Message.countDocuments({
        conversation: conversationId,
        deletedFor: { $ne: req.user._id },
      }),
    ]);

    // Deleted-for-everyone messages should never leak their original
    // content/media through the API after a refresh, even if a future bug
    // forgets to clear those fields at delete time — defense in depth.
    messages.forEach(m => {
      if (m.isDeleted) {
        m.content = null;
        m.imageUrl = null;
        m.videoUrl = null;
        m.videoThumbUrl = null;
        m.audioUrl = null;
        m.locationLat = null;
        m.locationLng = null;
        m.locationLabel = null;
      }
    });

    // Mark as read
    await Message.updateMany(
      { conversation: conversationId, sender: { $ne: req.user._id }, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );

    // Reset unread count for current user
    await Conversation.findByIdAndUpdate(conversationId, {
      $set: { [`unreadCounts.${req.user._id}`]: 0 },
    });

    const myId = req.user._id.toString();
    const otherParticipant = conversation.participants.find(p => p._id.toString() !== myId) || null;

    return res.json({
      success: true,
      data: {
        messages: messages.reverse(), // chronological
        pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
        conversation: {
          _id: conversation._id,
          listing: conversation.listing,
          booking: conversation.booking,
          otherParticipant,
          myUnreadCount: 0, // just marked read above
        },
      },
    });
  } catch (err) {
    console.error('[getMessages]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch messages.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// SEND MESSAGE  POST /api/messages/send
// ═════════════════════════════════════════════════════════════════════════════
const sendMessage = async (req, res) => {
  try {
    const {
      recipientId, content, bookingId, listingId,
      audioUrl, audioPublicId, audioDuration,
      imageUrl, imagePublicId,
      videoUrl, videoPublicId, videoThumbUrl, videoDuration,
      locationLat, locationLng, locationLabel,
      replyTo,
    } = req.body;
    // conversationId may come from the URL (/conversations/:id/send) or the body (/send)
    const conversationId = req.params.id || req.body.conversationId;

    // Determine message type from which payload was sent — only one
    // media type is expected per call, checked in this priority order.
    let messageType = 'text';
    if (audioUrl)                          messageType = 'audio';
    else if (videoUrl)                     messageType = 'video';
    else if (imageUrl)                     messageType = 'image';
    else if (locationLat != null && locationLng != null) messageType = 'location';

    if (messageType === 'text' && !content?.trim()) {
      return res.status(400).json({ success: false, message: 'Message content is required.' });
    }
    if (!recipientId && !conversationId) {
      return res.status(400).json({ success: false, message: 'recipientId or conversationId required.' });
    }

    let conversation;

    if (conversationId) {
      conversation = await Conversation.findOne({
        _id: conversationId,
        participants: req.user._id,
      });
      if (!conversation) {
        return res.status(404).json({ success: false, message: 'Conversation not found.' });
      }
    } else {
      if (!mongoose.Types.ObjectId.isValid(recipientId)) {
        return res.status(400).json({ success: false, message: 'Invalid recipientId.' });
      }
      conversation = await getOrCreateConversation(req.user._id, recipientId, bookingId, listingId);
    }

    const messageData = { conversation: conversation._id, sender: req.user._id, type: messageType };
    if (replyTo && mongoose.Types.ObjectId.isValid(replyTo)) {
      messageData.replyTo = replyTo;
    }

    if (messageType === 'audio') {
      messageData.audioUrl      = audioUrl;
      messageData.audioPublicId = audioPublicId || null;
      messageData.audioDuration = audioDuration || null;
    } else if (messageType === 'video') {
      messageData.videoUrl      = videoUrl;
      messageData.videoPublicId = videoPublicId || null;
      messageData.videoThumbUrl = videoThumbUrl || null;
      messageData.videoDuration = videoDuration || null;
    } else if (messageType === 'image') {
      messageData.imageUrl      = imageUrl;
      messageData.imagePublicId = imagePublicId || null;
    } else if (messageType === 'location') {
      messageData.locationLat   = locationLat;
      messageData.locationLng   = locationLng;
      messageData.locationLabel = locationLabel || null;
    } else {
      messageData.content = content.trim();
    }

    const message = await Message.create(messageData);

    const previewTextMap = {
      audio:    '🎤 Voice message',
      video:    '🎥 Video',
      image:    '📷 Photo',
      location: '📍 Location',
      text:     content?.trim().substring(0, 100),
    };
    const previewText = previewTextMap[messageType];

    // Update conversation metadata + increment unread for recipient(s)
    const unreadUpdates = {};
    conversation.participants.forEach(pid => {
      if (pid.toString() !== req.user._id.toString()) {
        unreadUpdates[`unreadCounts.${pid}`] = (conversation.unreadCounts?.get?.(pid.toString()) || 0) + 1;
      }
    });

    await Conversation.findByIdAndUpdate(conversation._id, {
      $set: {
        lastMessage:   previewText,
        lastMessageAt: new Date(),
        lastMessageBy: req.user._id,
        ...unreadUpdates,
      },
    });

    // Send notification to recipient
    const recipId = recipientId || conversation.participants.find(p => p.toString() !== req.user._id.toString());
    if (recipId) {
      await Notification.notify(
        recipId,
        'new_message',
        `New message from ${req.user.name}`,
        previewText,
        { userId: req.user._id, link: `/messages/${conversation._id}` }
      );

      // Real-time push to recipient
      emitToUser(recipId, 'message:new', {
        type: 'new_message',
        title: `New message from ${req.user.name}`,
        message: previewText,
        senderName: req.user.name,
        link: `/messages/${conversation._id}`,
        conversationId: conversation._id,
      });
    }

    const populated = await Message.findById(message._id)
      .populate('sender', 'name avatar')
      .populate('replyTo', 'content type sender imageUrl audioUrl videoUrl locationLat locationLng isDeleted');

    return res.status(201).json({ success: true, data: { message: populated, conversationId: conversation._id } });
  } catch (err) {
    console.error('[sendMessage]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to send message.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// DELETE MESSAGE  DELETE /api/messages/:id
// Body: { mode: 'me' | 'everyone' }
//   'me'       → hide the message for the requesting user only (anyone in
//                the conversation can do this to any message).
//   'everyone' → WhatsApp-style true delete, visible to nobody. Only the
//                ORIGINAL SENDER is allowed to do this.
// ═════════════════════════════════════════════════════════════════════════════
const deleteMessage = async (req, res) => {
  try {
    const mode = req.body?.mode === 'everyone' ? 'everyone' : 'me';

    // Fetch by ID + conversation-membership only (NOT sender) so that
    // "delete for me" works for any participant, not just the sender.
    const message = await Message.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found.' });
    }

    const conversation = await Conversation.findOne({
      _id: message.conversation,
      participants: req.user._id,
    });
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }

    if (mode === 'everyone') {
      if (String(message.sender) !== String(req.user._id)) {
        return res.status(403).json({ success: false, message: 'Sirf apna bheja hua message sab ke liye delete kar sakte hain.' });
      }
      message.isDeleted   = true;
      message.deletedAt   = new Date();
      message.content     = null;
      message.imageUrl    = null;
      message.videoUrl    = null;
      message.videoThumbUrl = null;
      message.audioUrl    = null;
      message.locationLat = null;
      message.locationLng = null;
      message.locationLabel = null;
      await message.save();

      // Notify the other participant in real time so it disappears on
      // their screen instantly too, without a page refresh.
      const recipId = conversation.participants.find(p => String(p) !== String(req.user._id));
      if (recipId) {
        emitToUser(recipId, 'message:deleted', {
          messageId: message._id,
          conversationId: message.conversation,
          mode: 'everyone',
        });
      }

      return res.json({ success: true, message: 'Message deleted for everyone.', data: { mode: 'everyone' } });
    }

    // mode === 'me'
    if (!message.deletedFor?.some(id => String(id) === String(req.user._id))) {
      message.deletedFor = [...(message.deletedFor || []), req.user._id];
      await message.save();
    }

    return res.json({ success: true, message: 'Message deleted for you.', data: { mode: 'me' } });

  } catch (err) {
    console.error('[deleteMessage]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to delete message.' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// START OR GET CONVERSATION  POST /api/messages/conversation/start
// Body: { recipientId, listingId }
// Returns an existing conversation for this renter+owner+listing combo,
// or creates a new one. No duplicates for the same pair + listing.
// ═════════════════════════════════════════════════════════════════════════════
const startOrGetConversation = async (req, res) => {
  try {
    const me = req.user._id;
    const { recipientId, listingId } = req.body;

    if (!recipientId) {
      return res.status(400).json({ success: false, message: 'recipientId is required.' });
    }
    if (recipientId.toString() === me.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot start a conversation with yourself.' });
    }

    const participants = [me, recipientId].sort();

    // Look for an existing conversation between these two users for this listing.
    // (If no listingId given, match the pair's general thread with listing:null.)
    const query = { participants: { $all: participants, $size: 2 } };
    query.listing = listingId || null;

    let conversation = await Conversation.findOne(query);

    if (!conversation) {
      conversation = await Conversation.create({
        participants,
        listing: listingId || null,
        booking: null,
        unreadCounts: { [me.toString()]: 0, [recipientId.toString()]: 0 },
      });
    }

    // Populate for the client (listing title + participant names)
    await conversation.populate([
      { path: 'participants', select: 'name avatar email' },
      { path: 'listing',      select: 'title images price priceUnit' },
    ]);

    return res.json({
      success: true,
      data: {
        conversationId: conversation._id,
        conversation,
      },
    });
  } catch (err) {
    console.error('[startOrGetConversation]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to start conversation.' });
  }
};

module.exports = { getConversations, getMessages, sendMessage, deleteMessage, startOrGetConversation };
