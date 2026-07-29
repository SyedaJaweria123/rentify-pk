'use strict';
/**
 * Video/Voice Call routes — Rentify PK
 * - ZegoCloud token generation (free tier, no payment method required)
 * - CallLog tracking: every invite/accept/end/decline gets persisted to
 *   MongoDB so calls show up in history, support, and dispute review.
 *
 * AppID + ServerSecret are kept on the backend only (never sent to frontend).
 */
const express     = require('express');
const router      = express.Router();
const crypto       = require('crypto');
const mongoose     = require('mongoose');
const { protect } = require('../middleware/auth');
const CallLog      = require('../models/CallLog');

// ── ZegoCloud Token04 generator (per official ZegoCloud Node.js sample) ────
function rndNum(a, b) { return Math.ceil((a + (b - a)) * Math.random()); }

function makeRandomIv() {
  const str = '0123456789abcdefghijklmnopqrstuvwxyz';
  const result = [];
  for (let i = 0; i < 16; i++) {
    const r = Math.floor(Math.random() * str.length);
    result.push(str.charAt(r));
  }
  return result.join('');
}

function getAlgorithm(keyBuf) {
  switch (keyBuf.length) {
    case 16: return 'aes-128-cbc';
    case 24: return 'aes-192-cbc';
    case 32: return 'aes-256-cbc';
  }
  throw new Error('Invalid key length: ' + keyBuf.length);
}

function aesEncrypt(plainText, key, iv) {
  const cipher = crypto.createCipheriv(getAlgorithm(Buffer.from(key)), key, iv);
  cipher.setAutoPadding(true);
  const encrypted = cipher.update(plainText);
  const final     = cipher.final();
  return Buffer.concat([encrypted, final]);
}

function generateToken04(appId, userId, secret, effectiveTimeInSeconds, payload) {
  if (!appId || typeof appId !== 'number') throw new Error('appID invalid');
  if (!userId || typeof userId !== 'string') throw new Error('userId invalid');
  if (!secret || typeof secret !== 'string' || secret.length !== 32) {
    throw new Error('secret must be a 32 byte string');
  }
  if (!effectiveTimeInSeconds || typeof effectiveTimeInSeconds !== 'number') {
    throw new Error('effectiveTimeInSeconds invalid');
  }

  const createTime = Math.floor(Date.now() / 1000);
  const tokenInfo = {
    app_id : appId,
    user_id: userId,
    nonce  : rndNum(-2147483648, 2147483647),
    ctime  : createTime,
    expire : createTime + effectiveTimeInSeconds,
    payload: payload || '',
  };

  const plainText  = JSON.stringify(tokenInfo);
  const iv         = makeRandomIv();
  const encryptBuf = aesEncrypt(plainText, secret, iv);

  const b1 = Buffer.alloc(8);
  const b2 = Buffer.alloc(2);
  const b3 = Buffer.alloc(2);
  b1.writeBigInt64BE(BigInt(tokenInfo.expire), 0);
  b2.writeUInt16BE(iv.length, 0);
  b3.writeUInt16BE(encryptBuf.length, 0);

  const buf = Buffer.concat([b1, b2, Buffer.from(iv), b3, encryptBuf]);
  return '04' + buf.toString('base64');
}

// ── POST /api/video/token ───────────────────────────────────────────────────
router.post('/token', protect, async (req, res) => {
  try {
    const appId  = parseInt(process.env.ZEGO_APP_ID, 10);
    const secret = process.env.ZEGO_SERVER_SECRET;

    if (!appId || !secret) {
      return res.status(500).json({ success: false, message: 'ZEGO_APP_ID / ZEGO_SERVER_SECRET not set in .env' });
    }

    const userId = String(req.user._id);
    const token  = generateToken04(appId, userId, secret, 3600, '');

    return res.json({
      success : true,
      appId,
      userId,
      userName: req.user.name || 'User',
      token,
    });
  } catch (err) {
    console.error('[video/token] error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not generate video token' });
  }
});

// ── POST /api/video/call/start ──────────────────────────────────────────────
// Called by the caller right when they trigger startVideoCall()/startVoiceCall().
// Creates a 'ringing' CallLog row and returns its id so later events can update it.
router.post('/call/start', protect, async (req, res) => {
  try {
    const { receiverId, roomId, callType, conversationId } = req.body;

    if (!receiverId || !roomId || !callType) {
      return res.status(400).json({ success: false, message: 'receiverId, roomId, callType required.' });
    }
    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
      return res.status(400).json({ success: false, message: 'Invalid receiverId.' });
    }

    const log = await CallLog.create({
      caller      : req.user._id,
      receiver    : receiverId,
      conversation: conversationId || null,
      callType,
      roomId,
      status      : 'ringing',
      startedAt   : new Date(),
    });

    return res.status(201).json({ success: true, data: { callLogId: log._id } });
  } catch (err) {
    console.error('[video/call/start] error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not log call start.' });
  }
});

// ── PATCH /api/video/call/:id/accept ────────────────────────────────────────
// Called by the receiver when they accept the incoming call.
router.patch('/call/:id/accept', protect, async (req, res) => {
  try {
    const log = await CallLog.findByIdAndUpdate(
      req.params.id,
      { $set: { status: 'completed', answeredAt: new Date() } },
      { new: true }
    );
    if (!log) return res.status(404).json({ success: false, message: 'Call log not found.' });
    return res.json({ success: true, data: log });
  } catch (err) {
    console.error('[video/call/accept] error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not update call log.' });
  }
});

// ── PATCH /api/video/call/:id/decline ───────────────────────────────────────
// Called by the receiver when they decline, or if the call times out unanswered.
router.patch('/call/:id/decline', protect, async (req, res) => {
  try {
    const { reason } = req.body; // optional: 'declined' (explicit) or 'missed' (timeout)
    const status = reason === 'missed' ? 'missed' : 'declined';

    const log = await CallLog.findByIdAndUpdate(
      req.params.id,
      { $set: { status, endedAt: new Date() } },
      { new: true }
    );
    if (!log) return res.status(404).json({ success: false, message: 'Call log not found.' });
    return res.json({ success: true, data: log });
  } catch (err) {
    console.error('[video/call/decline] error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not update call log.' });
  }
});

// ── PATCH /api/video/call/:id/end ───────────────────────────────────────────
// Called by either party when an active call ends normally.
router.patch('/call/:id/end', protect, async (req, res) => {
  try {
    const log = await CallLog.findById(req.params.id);
    if (!log) return res.status(404).json({ success: false, message: 'Call log not found.' });

    const endedAt = new Date();
    const durationSeconds = log.answeredAt
      ? Math.max(0, Math.round((endedAt - log.answeredAt) / 1000))
      : 0;

    log.status          = log.status === 'ringing' ? 'missed' : 'completed';
    log.endedAt          = endedAt;
    log.durationSeconds  = durationSeconds;
    await log.save();

    return res.json({ success: true, data: log });
  } catch (err) {
    console.error('[video/call/end] error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not update call log.' });
  }
});

// ── GET /api/video/call/history ─────────────────────────────────────────────
// Returns the logged-in user's call history (as caller or receiver), newest first.
router.get('/call/history', protect, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);

    const logs = await CallLog.find({
      $or: [{ caller: req.user._id }, { receiver: req.user._id }],
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('caller', 'name avatar')
      .populate('receiver', 'name avatar');

    return res.json({ success: true, data: logs });
  } catch (err) {
    console.error('[video/call/history] error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not fetch call history.' });
  }
});

module.exports = router;
