'use strict';
/**
 * Security Middleware — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * A single place for every app-wide security layer:
 *
 *   helmetConfig   → secure HTTP headers (CSP, HSTS, no-sniff, X-Frame deny)
 *   corsConfig     → CORS locked to FRONTEND_URL, credentials enabled
 *   mongoSanitize  → strips $ and . from keys to block NoSQL injection
 *   xssClean       → recursively HTML-escapes req.body/query/params (he)
 *   hppProtect     → blocks HTTP Parameter Pollution
 *   contentType    → rejects non-JSON/multipart bodies on POST/PUT/PATCH
 *
 * Usage (server.js):
 *   const security = require('./middleware/security.middleware');
 *   app.use(security.helmetConfig);
 *   app.use(security.corsConfig);
 *   app.use(express.json());
 *   app.use(security.mongoSanitize);
 *   app.use(security.hppProtect);
 *   app.use(security.xssClean);
 *   app.use(security.contentType);
 * ─────────────────────────────────────────────────────────────────────────────
 */
const helmet        = require('helmet');
const cors          = require('cors');
const mongoSanitize = require('express-mongo-sanitize');
const hpp           = require('hpp');
const he            = require('he');

// ── 1. Helmet — strict secure headers ─────────────────────────────────────────
const helmetConfig = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc:      ["'self'", 'data:', 'https:', 'blob:'],   // Cloudinary + data URIs
      connectSrc:  ["'self'", 'https:', 'wss:'],             // API + Socket.IO
      frameSrc:    ["'none'"],
      objectSrc:   ["'none'"],
      baseUri:     ["'self'"],
      formAction:  ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 31536000,        // 1 year
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,                              // X-Content-Type-Options: nosniff
  frameguard: { action: 'deny' },             // X-Frame-Options: DENY (clickjacking)
  referrerPolicy: { policy: 'no-referrer-when-downgrade' },
  crossOriginEmbedderPolicy: false,           // allow Cloudinary images
});

// ── 2. CORS — locked to the frontend origin(s) ────────────────────────────────
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:4200')
  .split(',').map(s => s.trim()).filter(Boolean);

const corsConfig = cors({
  origin: (origin, cb) => {
    // Allow same-origin / server-to-server / curl (no Origin header)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

// ── 3. Mongo sanitize — block NoSQL operator injection ($ / .) ────────────────
const mongoSanitizeMw = mongoSanitize();

// ── 4. HPP — prevent HTTP Parameter Pollution ─────────────────────────────────
const hppProtect = hpp();

// ── 5. XSS clean — recursively HTML-escape user-supplied data ─────────────────
const sanitizeValue = (val) => {
  if (typeof val === 'string') return he.escape(val.trim());
  if (Array.isArray(val))      return val.map(sanitizeValue);
  if (val && typeof val === 'object') {
    for (const key of Object.keys(val)) val[key] = sanitizeValue(val[key]);
    return val;
  }
  return val;   // numbers, booleans, null, undefined — untouched
};

const xssClean = (req, _res, next) => {
  // req.query / req.params can be read-only getters on some Express versions —
  // mutate their keys in place rather than reassigning the object.
  if (req.body   && typeof req.body === 'object')   sanitizeValue(req.body);
  if (req.params && typeof req.params === 'object') sanitizeValue(req.params);
  if (req.query  && typeof req.query === 'object') {
    for (const key of Object.keys(req.query)) req.query[key] = sanitizeValue(req.query[key]);
  }
  next();
};

// ── 6. Content-Type guard — POST/PUT/PATCH must be JSON or multipart ──────────
const WRITE_METHODS = ['POST', 'PUT', 'PATCH'];
const contentType = (req, res, next) => {
  if (!WRITE_METHODS.includes(req.method)) return next();

  // No body → nothing to validate (e.g. PATCH /:id/confirm with empty body)
  const len = req.headers['content-length'];
  if (!len || len === '0') return next();

  const ct = (req.headers['content-type'] || '').toLowerCase();
  const ok = ct.includes('application/json')
    || ct.includes('multipart/form-data')           // file uploads
    || ct.includes('application/x-www-form-urlencoded');

  if (!ok) {
    return res.status(415).json({
      success: false,
      message: 'Unsupported Content-Type. Use application/json or multipart/form-data.',
    });
  }
  next();
};

module.exports = {
  helmetConfig,
  corsConfig,
  mongoSanitize: mongoSanitizeMw,
  xssClean,
  hppProtect,
  contentType,
};
