'use strict';
/**
 * Notification Routes — Rentify PK
 * All routes require auth. Read/read-all are exposed as both PUT (frontend)
 * and PATCH (spec) so either verb works.
 */
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/notification.controller');
const { protect } = require('../middleware/auth');

router.use(protect);

// List notifications ( /history kept as an alias used by the frontend )
router.get('/',        ctrl.getNotifications);
router.get('/history', ctrl.getNotifications);

// Mark all read — PUT (frontend) + PATCH (spec). Must precede /:id/read.
router.route('/read-all').put(ctrl.markAllRead).patch(ctrl.markAllRead);

// Mark one read — PUT (frontend) + PATCH (spec)
router.route('/:id/read').put(ctrl.markRead).patch(ctrl.markRead);

// Delete a notification
router.delete('/:id', ctrl.deleteNotification);

module.exports = router;
