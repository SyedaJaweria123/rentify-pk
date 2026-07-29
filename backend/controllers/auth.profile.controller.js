// backend/controllers/auth.profile.controller.js
// Appends to existing auth routes: PUT /auth/profile, PUT /auth/profile/password, PUT /auth/profile/avatar

const User       = require('../models/User');
const bcrypt     = require('bcryptjs');
const cloudinary = require('cloudinary').v2;
const multer     = require('multer');
const { body, validationResult } = require('express-validator');

// ── Multer memory storage for avatar ─────────────────────────────────────────
const storage = multer.memoryStorage();
const avatarUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter(req, file, cb) {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only images are allowed'));
    cb(null, true);
  },
}).single('avatar');

// ── GET /auth/me ──────────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password -refreshTokens -otp -passwordResetToken');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: { user } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── PUT /auth/profile ─────────────────────────────────────────────────────────
exports.updateProfile = [
  body('name').trim().notEmpty().isLength({ min: 2, max: 100 }),
  body('phone').optional({ checkFalsy: true }).trim().isMobilePhone(),
  body('address').optional().trim().isLength({ max: 300 }),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

    try {
      const { name, phone, address } = req.body;
      const updateFields = {
        name,
        ...(phone !== undefined && { phone: phone || null }),
        ...(address !== undefined && { address: address ? address.trim() : null }),
      };
      const user = await User.findByIdAndUpdate(
        req.user._id,
        updateFields,
        { new: true, runValidators: true }
      ).select('-password -refreshTokens -otp');

      res.json({ success: true, message: 'Profile updated', data: { user } });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
];

// ── PUT /auth/profile/password ────────────────────────────────────────────────
exports.changePassword = [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({
      success: false,
      message: 'Password must be at least 8 chars with uppercase, lowercase, and digit.',
    });

    try {
      const user = await User.findById(req.user._id).select('+password');
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const valid = await bcrypt.compare(req.body.currentPassword, user.password);
      if (!valid) return res.status(400).json({ success: false, message: 'Current password is incorrect' });

      const salt = await bcrypt.genSalt(12);
      user.password = await bcrypt.hash(req.body.newPassword, salt);
      user.refreshTokens = []; // Invalidate all sessions
      await user.save();

      res.json({ success: true, message: 'Password changed. Please log in again.' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
];

// ── PUT /auth/profile/avatar ──────────────────────────────────────────────────
exports.updateAvatar = (req, res) => {
  avatarUpload(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    if (!req.file) return res.status(400).json({ success: false, message: 'No image provided' });

    try {
      const user = await User.findById(req.user._id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      // Delete old avatar from Cloudinary
      if (user.avatarPublicId) {
        await cloudinary.uploader.destroy(user.avatarPublicId).catch(() => {});
      }

      // Upload new avatar
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'rentify/avatars', transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }] },
          (error, result) => error ? reject(error) : resolve(result)
        );
        stream.end(req.file.buffer);
      });

      user.avatar         = result.secure_url;
      user.avatarPublicId = result.public_id;
      await user.save();

      res.json({ success: true, message: 'Avatar updated', data: { avatar: user.avatar } });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });
};

// ── GET /auth/login-history ───────────────────────────────────────────────────
exports.getLoginHistory = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('loginHistory');
    res.json({ success: true, data: { history: user?.loginHistory?.slice(-20).reverse() || [] } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
