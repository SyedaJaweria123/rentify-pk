'use strict';
const { Notification } = require('../models/Notification');

// GET /api/notifications
const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit) || 20);
    const skip     = (pageNum - 1) * limitNum;

    const filter = { recipient: req.user._id };
    if (unreadOnly === 'true') filter.isRead = false;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ recipient: req.user._id, isRead: false }),
    ]);

    return res.json({
      success: true,
      data: {
        notifications,
        unreadCount,
        pagination: {
          total, page: pageNum, limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (err) {
    console.error('[getNotifications]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch notifications.' });
  }
};

// PATCH /api/notifications/:id/read
const markRead = async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { $set: { isRead: true, readAt: new Date() } },
      { new: true }
    );
    if (!notif) return res.status(404).json({ success: false, message: 'Notification not found.' });
    return res.json({ success: true, data: { notification: notif } });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to mark notification.' });
  }
};

// PATCH /api/notifications/read-all
const markAllRead = async (req, res) => {
  try {
    const result = await Notification.markAllRead(req.user._id);
    return res.json({ success: true, message: `${result.modifiedCount} notifications marked as read.` });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to mark notifications.' });
  }
};

// DELETE /api/notifications/:id
const deleteNotification = async (req, res) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, recipient: req.user._id });
    return res.json({ success: true, message: 'Notification deleted.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to delete notification.' });
  }
};

module.exports = { getNotifications, markRead, markAllRead, deleteNotification };
