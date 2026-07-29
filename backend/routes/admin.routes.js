// backend/routes/admin.routes.js
'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/admin.controller');
const support = require('../controllers/support.controller');
const { protect } = require('../middleware/auth');
const { logAdminAction } = require('../middleware/auditLog.middleware');

// Admin role middleware
const adminOnly = (req, res, next) => {
  const adminRoles = ['super_admin', 'admin', 'manager', 'support'];
  if (!adminRoles.includes(req.user?.role)) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

router.use(protect, adminOnly);

// Dashboard
router.get('/stats',            ctrl.getDashboardStats);

// Contact form messages
router.get('/contact-messages',           ctrl.getContactMessages);
router.patch('/contact-messages/:id/read', ctrl.markContactMessageRead);
router.delete('/contact-messages/:id',     ctrl.deleteContactMessage);
router.get('/activity',         ctrl.getRecentActivity);

// Users
router.get('/users',              ctrl.getUsers);
router.get('/users/:id',          ctrl.getUserById);
router.put('/users/:id',          ctrl.updateUser);
router.put('/users/:id/suspend',  logAdminAction('USER_SUSPEND', 'User'), ctrl.suspendUser);
router.put('/users/:id/unsuspend',logAdminAction('USER_ACTIVATE', 'User'), ctrl.unsuspendUser);
router.delete('/users/:id',       ctrl.deleteUser);
router.put('/users/:id/verify-cnic',   ctrl.verifyCNIC);
router.put('/users/:id/approve-owner', ctrl.approveOwner);

// Listings
router.get('/listings',             ctrl.getListings);
router.get('/listings/export',      ctrl.exportListings);     // CSV export (before :id)
router.post('/listings/bulk',       ctrl.bulkUpdateListings); // bulk action (before :id)
router.put('/listings/:id/status',  logAdminAction('LISTING_STATUS', 'Listing'), ctrl.updateListingStatus);
router.delete('/listings/:id',      ctrl.deleteListing);

// Bookings
router.get('/bookings',             ctrl.getBookings);
router.put('/bookings/:id/status',  logAdminAction('BOOKING_STATUS', 'Booking'), ctrl.updateBookingStatus);  // NEW: approve/confirm/active/complete/cancel/dispute

// Charts (real-data dashboards)
router.get('/charts/revenue',    ctrl.getRevenueChart);     // NEW: revenue line/area
router.get('/charts/bookings',   ctrl.getBookingsChart);    // NEW: bookings bar
router.get('/charts/users',      ctrl.getUserGrowthChart);  // NEW: user growth line
router.get('/charts/categories', ctrl.getCategoryChart);    // NEW: category doughnut
router.get('/charts/cnic-status',    ctrl.getCnicStatusChart);   // NEW: CNIC verification donut
router.get('/charts/face-match',     ctrl.getFaceMatchChart);    // NEW: face-match score histogram

// Revenue
router.get('/revenue/summary',  ctrl.getRevenueSummary);
router.get('/platform-wallet',  ctrl.getPlatformWallet);   // commission balance + history
router.post('/platform-wallet/withdraw', ctrl.withdrawPlatformFunds);
router.get('/transactions',     ctrl.getTransactions);
router.get('/analytics',        ctrl.getAnalytics);          // top cities + top owners
router.get('/reports/:type',    ctrl.getReports);            // users|revenue|listings|bookings

// Notifications
router.post('/notifications/announce', ctrl.sendAnnouncement);
router.get('/notifications/feed',      ctrl.getAdminNotifications);
router.get('/notifications/history',   ctrl.getAnnouncementHistory);

// Activity
// NOTE: '/activity' is already taken above by getRecentActivity (the dashboard
// feed). Express matches the first route, so the logs page needs its own path
// — sharing it meant this handler never ran and the page showed "No activity".
router.get('/activity-logs', ctrl.getActivityLogs);

// Settings
router.get('/settings',  ctrl.getSettings);
router.put('/settings',  ctrl.updateSettings);
router.post('/force-logout', ctrl.forceLogoutAll);   // security: log out all non-admin users

// ── Spec-named aliases (PATCH) — mirror existing PUT routes ───────────────────
router.get('/dashboard/stats', ctrl.getDashboardStats);                 // alias of /stats
router.patch('/users/:id/suspend',  logAdminAction('USER_SUSPEND', 'User'),  ctrl.suspendUser);
router.patch('/users/:id/activate', logAdminAction('USER_ACTIVATE', 'User'), ctrl.unsuspendUser);
router.patch('/listings/:id/status', logAdminAction('LISTING_STATUS', 'Listing'), ctrl.updateListingStatus);

// ── Support tickets (admin) ───────────────────────────────────────────────────
router.get('/support-tickets',              support.listTickets);
router.get('/support-tickets/:id',          support.getTicket);
router.put('/support-tickets/:id/status',   support.updateStatus);      // existing style
router.patch('/support-tickets/:id/status', support.updateStatus);      // spec
router.post('/support-tickets/:id/reply',   support.replyTicket);

module.exports = router;
