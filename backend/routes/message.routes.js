'use strict';
/**
 * Message Routes — Rentify PK
 * Mounted at /api/messages in server.js — paths below are relative to that.
 * All routes require auth. Sending is rate-limited (messageLimiter).
 * Two send endpoints are exposed:
 *   • POST /send                    — body: { conversationId | recipientId, content }  (frontend)
 *   • POST /conversations/:id/send  — id in the URL                                   (spec)
 */
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/message.controller');
const { protect } = require('../middleware/auth');
const { messageLimiter } = require('../middleware/rateLimiter');

router.use(protect);

// Start or fetch a conversation (e.g. from a listing/booking)
router.post('/conversation/start', ctrl.startOrGetConversation);

// List my conversations
router.get('/conversations', ctrl.getConversations);

// Messages within one conversation
router.get('/conversations/:id', ctrl.getMessages);

// Send a message — rate-limited. Both URL styles supported.
router.post('/send',                   messageLimiter, ctrl.sendMessage);
router.post('/conversations/:id/send', messageLimiter, ctrl.sendMessage);

// Delete a message — body: { mode: 'me' | 'everyone' }
// NOTE: this router is mounted at /api/messages (see server.js), so the
// path here must be just '/:id' — NOT '/messages/:id', which would
// require the frontend to call /api/messages/messages/:id (the bug that
// caused "route /api/messages/<id> not found").
router.delete('/:id', ctrl.deleteMessage);

module.exports = router;
