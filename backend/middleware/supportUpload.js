'use strict';
const multer = require('multer');

// Memory storage — buffer goes straight to Cloudinary
const storage = multer.memoryStorage();

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const fileFilter = (_req, file, cb) => {
  if (ALLOWED.includes(file.mimetype)) cb(null, true);
  else cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only JPEG, PNG, WebP, GIF images or PDF files are allowed.'));
};

const supportUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
});

const handleSupportUploadError = (err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    let msg = 'File upload error.';
    if (err.code === 'LIMIT_FILE_SIZE')        msg = 'File too large. Maximum size is 5MB.';
    else if (err.code === 'LIMIT_UNEXPECTED_FILE') msg = err.field || 'Invalid file type.';
    return res.status(400).json({ success: false, message: msg });
  }
  if (err) return res.status(400).json({ success: false, message: err.message || 'Upload failed.' });
  next();
};

module.exports = { supportUpload, handleSupportUploadError };
