'use strict';
/**
 * Token Blacklist — Rentify PK (Redis-backed, in-memory fallback)
 * ─────────────────────────────────────────────────────────────────────────────
 * Revocation list for access-token JTIs (JWT IDs). Used to make logout actually
 * invalidate a still-valid (un-expired) access token, and to survive restarts
 * and span multiple instances when Redis is available.
 *
 *   addToBlacklist(jti, expiresAt)  → revoke a token until it would expire anyway
 *   isBlacklisted(jti)              → (async) true if the jti is currently revoked
 *   checkBlacklist                  → Express middleware (verifies req's jti)
 *   blacklistSize()                 → (async) approximate count (in-memory only)
 *
 * Storage:
 *   • If REDIS_URL is set and reachable → ioredis (key: `bl:<jti>`, TTL = token's
 *     remaining lifetime via PX). Revocations then persist across restarts.
 *   • Otherwise → in-memory Map fallback so development still works.
 *
 * Graceful: a Redis connection failure NEVER crashes the app. We log a single
 * warning and transparently fall back to in-memory.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const jwt = require('jsonwebtoken');

const KEY_PREFIX = 'bl:';
const DEFAULT_TTL_MS = 15 * 60 * 1000;   // safety horizon when no expiry is known

// ── In-memory fallback store (Map<jti, expiresAtMs>) ─────────────────────────
const memory = new Map();

// ── Redis client (lazy, optional) ────────────────────────────────────────────
let redis = null;
let redisReady = false;
let warnedOnce = false;

function warnFallback(msg) {
  if (!warnedOnce) {
    console.warn(`⚠️  tokenBlacklist: ${msg} — falling back to in-memory store (revocations will not persist across restarts).`);
    warnedOnce = true;
  }
}

(function initRedis() {
  const url = process.env.REDIS_URL;
  if (!url) {
    // No Redis configured — silently use in-memory (normal in development).
    return;
  }
  try {
    // Require ioredis only when a URL is configured, so the app runs without it.
    const Redis = require('ioredis');
    redis = new Redis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2000)),
    });

    redis.on('ready', () => {
      redisReady = true;
      if (process.env.NODE_ENV === 'development') console.log('✅ tokenBlacklist: Redis connected.');
    });
    redis.on('end',   () => { redisReady = false; });
    redis.on('error', (err) => {
      redisReady = false;
      warnFallback(`Redis error (${err.code || err.message})`);
    });
  } catch (err) {
    // ioredis not installed, or constructor threw — never crash.
    warnFallback(`Redis unavailable (${err.message})`);
    redis = null;
    redisReady = false;
  }
})();

function useRedis() {
  return !!redis && redisReady;
}

// Compute remaining TTL in ms from an expiry (ms epoch). Returns null if unknown/past.
function ttlMs(expiresAt) {
  const exp = Number(expiresAt);
  if (Number.isFinite(exp) && exp > 0) {
    const remaining = exp - Date.now();
    return remaining > 0 ? remaining : null;   // already expired → caller skips
  }
  return DEFAULT_TTL_MS;
}

/**
 * Revoke a token by its jti until `expiresAt` (ms epoch, e.g. decoded.exp*1000).
 * Async, but safe to call without awaiting (fire-and-forget on logout).
 */
const addToBlacklist = async (jti, expiresAt) => {
  if (!jti) return;
  const remaining = ttlMs(expiresAt);
  if (remaining === null) return;   // token already expired — nothing to track

  if (useRedis()) {
    try {
      // PX = TTL in ms; Redis auto-expires the key when the token would expire.
      await redis.set(`${KEY_PREFIX}${jti}`, '1', 'PX', remaining);
      return;
    } catch (err) {
      warnFallback(`Redis set failed (${err.message})`);
      // fall through to memory
    }
  }
  memory.set(jti, Date.now() + remaining);
};

/**
 * True if the jti is currently revoked. Async (Redis lookup when available).
 */
const isBlacklisted = async (jti) => {
  if (!jti) return false;

  if (useRedis()) {
    try {
      const hit = await redis.exists(`${KEY_PREFIX}${jti}`);
      return hit === 1;
    } catch (err) {
      warnFallback(`Redis exists failed (${err.message})`);
      // fall through to memory
    }
  }

  const exp = memory.get(jti);
  if (!exp) return false;
  if (exp <= Date.now()) { memory.delete(jti); return false; }  // lazy purge
  return true;
};

// ── Express middleware: reject requests whose token jti is revoked ────────────
// Place AFTER `protect` (which has verified the JWT and set req.tokenJti).
const checkBlacklist = async (req, res, next) => {
  try {
    let jti = req.tokenJti;
    if (!jti) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const decoded = jwt.decode(authHeader.slice(7));
        jti = decoded?.jti;
      }
    }
    if (jti && await isBlacklisted(jti)) {
      return res.status(401).json({
        success: false,
        message: 'Session has been revoked. Please login again.',
        code: 'TOKEN_REVOKED',
      });
    }
    next();
  } catch {
    next();   // never block on a decode/store hiccup
  }
};

// ── In-memory auto-cleanup every 15 minutes (Redis self-expires via PX) ───────
const CLEANUP_INTERVAL = 15 * 60 * 1000;
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  let purged = 0;
  for (const [jti, exp] of memory.entries()) {
    if (exp <= now) { memory.delete(jti); purged++; }
  }
  if (purged && process.env.NODE_ENV === 'development') {
    console.log(`🧹 tokenBlacklist: purged ${purged} expired in-memory entr${purged === 1 ? 'y' : 'ies'}`);
  }
}, CLEANUP_INTERVAL);
cleanupTimer.unref();

// Approximate count (in-memory only; Redis count omitted to avoid KEYS scans).
const blacklistSize = () => memory.size;

module.exports = { addToBlacklist, isBlacklisted, checkBlacklist, blacklistSize };
