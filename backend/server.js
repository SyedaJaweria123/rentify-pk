'use strict';
/**
 * Server Entry Point — Rentify PK v6.0
 * Original auth + listings + NEW: bookings, reviews, notifications,
 * messages, wallet, dashboard modules
 */
require('dotenv').config();
const express   = require('express');
const http      = require('http');
const morgan    = require('morgan');
const session   = require('express-session');
const passport  = require('passport');
const rateLimit = require('express-rate-limit');
const cookieParser  = require('cookie-parser');

const security  = require('./middleware/security.middleware');
const connectDB       = require('./config/db');
const { verifyEmailTransport } = require('./utils/email');
const setupPassport   = require('./utils/passport');
const { initSocket }  = require('./utils/socket');  // real-time notifications
const { notFound, globalErrorHandler } = require('./middleware/error.middleware');

// ── Escrow Auto-Release Cron (runs every hour — releases escrow after grace period) ──
// Requires: npm install node-cron
require('./services/escrowCron.service');

// ── Rider Payout Auto-Release Cron (runs every hour — independent of damage claims) ──
require('./services/riderPayoutCron.service');

// ── Late Delivery / No-Show Auto-Refund Cron (runs every 15 minutes) ──
require('./services/lateDeliveryCron.service');

const app = express();
app.set('trust proxy', 1);

// ── Security headers + CORS (from security.middleware.js) ─────────────────────
app.use(security.helmetConfig);
app.use(security.corsConfig);

// ── Stripe webhook — MUST be before express.json() so the raw body survives ──
// (Stripe signature verification needs the unparsed body.)
app.post('/api/payments/stripe/webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => require('./controllers/payment.controller').stripeWebhook(req, res));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ── Input hardening (after body is parsed) ────────────────────────────────────
app.use(security.contentType);    // reject odd Content-Types on writes
app.use(security.mongoSanitize);  // NoSQL injection
app.use(security.hppProtect);     // parameter pollution
app.use(security.xssClean);       // recursively HTML-escape inputs

if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

// Session (required for passport OAuth)
app.use(session({
  secret: process.env.JWT_SECRET || 'fallback_secret',
  resave: false, saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 10 * 60 * 1000 }
}));

app.use(passport.initialize());
app.use(passport.session());
setupPassport();

// Global rate limit
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000, max: 5000, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please wait 15 minutes.' }
}));

// ── Routes ────────────────────────────────────────────────────────────────────
// Original
app.use('/api/auth',          require('./routes/auth.routes'));

// Public platform settings (CMS text, maintenance flag, fee %) — no auth needed
app.use('/api/settings',      require('./routes/settings.routes'));
app.use('/api/newsletter',    require('./routes/newsletter.routes'));

// ── Maintenance mode gate ────────────────────────────────────────────────────
// When admin enables maintenance, block write actions (POST/PUT/PATCH/DELETE)
// for everyone EXCEPT admins and the auth/settings routes, so the site is
// effectively read-only. Admins can still operate (and turn it back off).
app.use('/api', async (req, res, next) => {
  try {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    // Always allow auth + settings so users can log in and admins can edit settings
    if (req.path.startsWith('/auth') || req.path.startsWith('/settings') || req.path.startsWith('/admin')) return next();

    const Settings = require('./models/Settings');
    const s = await Settings.getSingleton();
    if (!s.maintenanceMode) return next();

    // Allow admins through even during maintenance
    const role = req.user?.role;   // set later by protect; may be undefined here
    if (role === 'admin') return next();

    return res.status(503).json({
      success: false,
      maintenance: true,
      message: 'Rentify is under maintenance. Please try again shortly.',
    });
  } catch {
    next();   // never block on settings-read failure
  }
});

app.use('/api/cnic',          require('./routes/cnic.routes'));
app.use('/api/chat',          require('./routes/chat.routes'));
app.use('/api/listings',      require('./routes/listing.routes'));
app.use('/api/stats',          require('./routes/stats.routes'));
app.use('/api/cms',            require('./routes/cms.routes'));

// New modules
app.use('/api/bookings',      require('./routes/booking.routes'));
app.use('/api/reviews',       require('./routes/review.routes'));
app.use('/api/notifications', require('./routes/notification.routes'));
app.use('/api/messages',      require('./routes/message.routes'));
app.use('/api/wallet',        require('./routes/wallet.routes'));
app.use('/api/wishlist',      require('./routes/wishlist.routes'));
app.use('/api/cart',          require('./routes/cart.routes'));
app.use('/api/dashboard',     require('./routes/dashboard.routes'));
app.use('/api/admin',        require('./routes/admin.routes'));
app.use('/api/support',      require('./routes/support.routes'));
app.use('/api/escrow',         require('./routes/escrow.routes'));
app.use('/api/damage-claims',  require('./routes/damageClaim.routes'));
app.use('/api/disputes',       require('./routes/dispute.routes'));
app.use('/api/inspections',    require('./routes/inspection.routes'));
app.use('/api/rider',          require('./routes/rider.routes'));
app.use('/api/video',          require('./routes/video.routes'));
app.use('/api/payments',       require('./routes/payment.routes'));
app.use('/api/uploads',        require('./routes/uploads.routes'));
app.use('/api/uploads',        require('./routes/chat-media.routes'));
app.use('/api/trust',          require('./routes/trust.routes'));

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({
  success: true, time: new Date().toISOString(), env: process.env.NODE_ENV,
  modules: ['auth','listings','bookings','reviews','notifications','messages','wallet','dashboard'],
  google:     !!process.env.GOOGLE_CLIENT_ID    && process.env.GOOGLE_CLIENT_ID    !== 'YOUR_GOOGLE_CLIENT_ID',
  facebook:   !!process.env.FACEBOOK_APP_ID     && process.env.FACEBOOK_APP_ID     !== 'YOUR_FACEBOOK_APP_ID',
  cloudinary: !!process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_CLOUD_NAME !== 'YOUR_CLOUD_NAME',
}));

// ── 404 + Global Error Handler (from error.middleware.js) ────────────────────
app.use(notFound);
app.use(globalErrorHandler);

let httpServer;   // kept in outer scope for graceful shutdown

const start = async () => {
  await connectDB();
  try { await verifyEmailTransport(); } catch (e) { console.warn('Email transport warning:', e.message); }
  const PORT = process.env.PORT || 5000;

  // Create an HTTP server so Socket.IO can attach to it, then init sockets.
  httpServer = http.createServer(app);
  initSocket(httpServer);

  httpServer.listen(PORT, () => {
    console.log(`\n🚀 Rentify PK Backend v6.0`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🌐 http://localhost:${PORT}`);
    console.log(`📦 Modules: Auth, Listings, Bookings, Reviews`);
    console.log(`📦         Notifications, Messages, Wallet, Dashboard`);
    console.log(`⚡ Real-time: Socket.IO enabled`);
    console.log(`📧 ${process.env.EMAIL_USER}`);
    console.log(`☁️  Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME ? '✅' : '❌'}`);
    console.log(`🔑 Google OAuth:   ${process.env.GOOGLE_CLIENT_ID   && process.env.GOOGLE_CLIENT_ID   !== 'YOUR_GOOGLE_CLIENT_ID'   ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`🔑 Facebook OAuth: ${process.env.FACEBOOK_APP_ID    && process.env.FACEBOOK_APP_ID    !== 'YOUR_FACEBOOK_APP_ID'    ? '✅ Configured' : '❌ Not configured'}\n`);
  });
};

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
const shutdown = (signal) => {
  console.log(`\n${signal} received — shutting down gracefully…`);
  if (!httpServer) process.exit(0);

  httpServer.close(async () => {
    console.log('✔ HTTP server closed (no longer accepting connections)');
    try {
      const mongoose = require('mongoose');
      await mongoose.connection.close(false);
      console.log('✔ MongoDB connection closed');
    } catch (e) {
      console.error('Error closing MongoDB:', e.message);
    }
    process.exit(0);
  });

  // Force-exit if cleanup hangs beyond 10s
  setTimeout(() => {
    console.error('⏱ Forced shutdown (cleanup timed out)');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Crash-safety: log and exit on unexpected errors so the process manager can restart
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  process.exit(1);
});

start().catch(err => { console.error('Startup failed:', err.message); process.exit(1); });
