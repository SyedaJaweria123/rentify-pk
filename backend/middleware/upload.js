'use strict';
/**
 * Upload Middleware — RentAnything PK
 * Multer memory-storage config for Cloudinary image pipeline.
 * Validates file type, count, and size before upload.
 */
const multer = require('multer');

// ── Allowed MIME types ────────────────────────────────────────────────────────
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB per file
const MAX_FILES     = 8;               // max 8 images per listing

// ── Use memory storage — buffers go directly to Cloudinary ───────────────────
const storage = multer.memoryStorage();

// ── File filter: reject non-image types immediately ───────────────────────────
const fileFilter = (_req, file, cb) => {
  if (ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only JPEG, PNG, and WebP images are allowed.'));
  }
};

// ── Main upload middleware ────────────────────────────────────────────────────
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize:  MAX_FILE_SIZE,
    files:     MAX_FILES,
  },
});

/**
 * Express error handler for Multer errors.
 * Must be used AFTER the multer middleware in the route chain.
 */
const handleUploadError = (err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'Each image must be under 5MB.' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ success: false, message: `Maximum ${MAX_FILES} images allowed.` });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ success: false, message: err.field || 'Invalid file type. Use JPEG, PNG, or WebP.' });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  next(err);
};

module.exports = { upload, handleUploadError, MAX_FILES, MAX_FILE_SIZE };
