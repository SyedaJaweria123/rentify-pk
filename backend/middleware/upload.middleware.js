// backend/middleware/upload.middleware.js
const multer     = require('multer');
const cloudinary = require('cloudinary').v2;
const { AppError } = require('./error.middleware');

// ── Memory storage (stream to Cloudinary) ─────────────────────────────────────
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) return cb(null, true);
  cb(new AppError('Only image files are allowed', 400), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024, files: 10 }, // 10MB, max 10 images
});

// ── Upload buffer to Cloudinary ───────────────────────────────────────────────
const uploadToCloudinary = (buffer, folder = 'rentify/listings', options = {}) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        ...options,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
};

// ── Delete from Cloudinary ────────────────────────────────────────────────────
const deleteFromCloudinary = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch {
    // Log but don't throw — non-critical
    console.warn(`[Cloudinary] Failed to delete ${publicId}`);
  }
};

module.exports = { upload, uploadToCloudinary, deleteFromCloudinary };
