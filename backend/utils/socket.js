'use strict';
/**
 * socket.js — Rentify PK (Live Rider Tracking Edition)
 * ─────────────────────────────────────────────────────────────────────────────
 * KIYA BADLA:
 *   Pehle: rider ki location sirf uske apne room mein broadcast hoti thi.
 *   Ab:    jab rider apni location update kare, uski ACTIVE booking ke
 *          renter aur owner — dono — ko live coordinates milte hain.
 *
 * FLOW:
 *   1. Rider app se  socket.emit('rider:location_update', { lat, lng })
 *   2. Backend DB mein coordinates save karta hai
 *   3. RiderAssignment check karta hai — koi active booking hai?
 *   4. Agar hai → booking ke renter aur owner dono ko emit karta hai
 *      event: 'rider:location_update'  payload: { riderId, lat, lng, bookingId }
 *   5. Renter/Owner ka Angular component map pe rider ka marker move karta hai
 *
 * BAQI SAB SAME HAI — sirf rider:location_update handler updated hai.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { Server } = require('socket.io');
const jwt        = require('jsonwebtoken');

let io = null;                       // singleton Socket.IO server instance
const userSocketMap = new Map();     // Map<userIdString, Set<socketId>>

const roomFor = (userId) => `user:${userId}`;

// ── Helpers: socket connection map ───────────────────────────────────────────
const addSocket = (userId, socketId) => {
  const key = String(userId);
  if (!userSocketMap.has(key)) userSocketMap.set(key, new Set());
  userSocketMap.get(key).add(socketId);
};

const removeSocket = (userId, socketId) => {
  const key   = String(userId);
  const set   = userSocketMap.get(key);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) userSocketMap.delete(key);
};

// ── JWT verify ────────────────────────────────────────────────────────────────
const verifyToken = (token) => {
  if (!token) return null;
  try {
    const clean   = token.startsWith('Bearer ') ? token.slice(7) : token;
    const decoded = jwt.verify(clean, process.env.JWT_SECRET);
    return decoded.id || null;
  } catch {
    return null;
  }
};

// ── Initialize Socket.IO ──────────────────────────────────────────────────────
const initSocket = (server) => {
  const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:4200')
    .split(',').map(s => s.trim());

  io = new Server(server, {
    cors: {
      origin     : allowedOrigins,
      credentials: true,
      methods    : ['GET', 'POST'],
    },
  });

  // ── Auth middleware: verify JWT before connection accepted ────────────────
  io.use((socket, next) => {
    const token  = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
    const userId = verifyToken(token);
    if (!userId) return next(new Error('Unauthorized: invalid or missing token'));
    socket.userId = String(userId);
    next();
  });

  // ── On connection ─────────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const uid = socket.userId;

    // Each user joins their personal room, e.g. "user:64abc..."
    socket.join(roomFor(uid));
    addSocket(uid, socket.id);

    if (process.env.NODE_ENV === 'development') {
      const tabs = userSocketMap.get(uid)?.size || 1;
      console.log(`🔌 connected: user ${uid} (${socket.id}) — ${tabs} tab(s)`);
    }

    // ── Re-authenticate (after token refresh) ─────────────────────────────
    socket.on('authenticate', (token, ack) => {
      const newId = verifyToken(token);
      if (!newId) { if (typeof ack === 'function') ack({ ok: false }); return; }
      if (newId !== socket.userId) {
        socket.leave(roomFor(socket.userId));
        removeSocket(socket.userId, socket.id);
        socket.userId = String(newId);
        socket.join(roomFor(socket.userId));
        addSocket(socket.userId, socket.id);
      }
      if (typeof ack === 'function') ack({ ok: true });
    });

    socket.on('join_room', (ack) => {
      socket.join(roomFor(socket.userId));
      if (typeof ack === 'function') ack({ ok: true, room: roomFor(socket.userId) });
    });

    // ── RIDER LIVE LOCATION UPDATE ────────────────────────────────────────
    // Rider phone/app sends this every few seconds while on a delivery.
    // We:
    //   1. Save coordinates to DB (User.currentLocation)
    //   2. Find active assignment for this rider
    //   3. Broadcast to renter AND owner so their maps update live
    socket.on('rider:location_update', async (data) => {
      try {
        const lat = Number(data?.lat);
        const lng = Number(data?.lng);

        // Validate coordinates — ignore garbage values
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        const User            = require('../models/User');
        const RiderAssignment = require('../models/RiderAssignment');

        // 1. Save to DB so scanQR / getAssignments always have fresh coords
        await User.findByIdAndUpdate(socket.userId, {
          currentLocation: { type: 'Point', coordinates: [lng, lat] },
        });

        // 2. Find the rider's active delivery assignment
        //    Only 'accepted' or 'picked_up' statuses mean the rider is actively moving
        const assignment = await RiderAssignment.findOne({
          rider : socket.userId,
          status: { $in: ['accepted', 'picked_up'] },
        }).populate({
          path   : 'booking',
          select : 'renter owner',           // just the IDs we need for rooms
        });

        // 3. Build the location payload for the frontend map
        const locationPayload = {
          riderId  : socket.userId,
          lat,
          lng,
          bookingId: assignment?.booking?._id ? String(assignment.booking._id) : null,
          status   : assignment?.status || null,
          ts       : Date.now(),             // timestamp so frontend can detect stale data
        };

        // 4a. Always echo back to the rider's own room
        //     (so rider dashboard can also show their position if needed)
        io.to(roomFor(socket.userId)).emit('rider:location_update', locationPayload);

        // 4b. If there's an active booking — broadcast to renter AND owner
        if (assignment?.booking) {
          const { renter, owner } = assignment.booking;

          // Renter room (e.g. user watching "where is my delivery?")
          if (renter) {
            io.to(roomFor(String(renter))).emit('rider:location_update', locationPayload);
          }

          // Owner room (owner can also watch the rider collect their item)
          if (owner) {
            io.to(roomFor(String(owner))).emit('rider:location_update', locationPayload);
          }
        }

      } catch (e) {
        // Never crash the socket on a location event
        if (process.env.NODE_ENV === 'development') {
          console.warn('[socket] rider:location_update error:', e.message);
        }
      }
    });


    // ── VIDEO CALL SIGNALING ──────────────────────────────────────────────
    socket.on('video:call_invite', (data) => {
      if (!data?.toUserId || !data?.roomId) return;
      io.to(roomFor(String(data.toUserId))).emit('video:incoming_call', {
        roomId    : data.roomId,
        callerName: data.callerName,
        callType  : data.callType || 'video',
        callLogId : data.callLogId || null,
        fromUserId: socket.userId,
      });
    });

    socket.on('video:call_declined', (data) => {
      if (!data?.toUserId) return;
      io.to(roomFor(String(data.toUserId))).emit('video:call_declined', {
        fromUserId: socket.userId,
      });
    });
    // ── END VIDEO CALL SIGNALING ──────────────────────────────────────────

    // ── Disconnect cleanup ────────────────────────────────────────────────
    socket.on('disconnect', () => {
      removeSocket(uid, socket.id);
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔌 disconnected: user ${uid} (${socket.id})`);
      }
    });
  });

  console.log('⚡ Socket.IO ready (live rider tracking enabled)');
  return io;
};

// ── Emit to every tab/device of one user ─────────────────────────────────────
// Used by controllers: emitToUser(ownerId, 'booking:new', payload)
const emitToUser = (userId, event, data) => {
  if (!io || !userId) return;
  io.to(roomFor(String(userId))).emit(event, data);
};

const isUserOnline = (userId) => userSocketMap.has(String(userId));
const getIO        = ()       => io;

module.exports = { initSocket, getIO, emitToUser, isUserOnline };
