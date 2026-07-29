'use strict';
/**
 * Cloudinary Configuration — RentAnything PK
 * Handles image upload, deletion, and transformation for listings.
 */
const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

// ── Configure Cloudinary from environment variables ───────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
});

/**
 * Upload a buffer (from multer memoryStorage) to Cloudinary.
 * @param {Buffer} buffer  - File buffer
 * @param {Object} options - Cloudinary upload options
 * @returns {Promise<Object>} Cloudinary upload result
 */
const uploadBuffer = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder:          options.folder    || 'rentanything/listings',
        resource_type:   'image',
        transformation:  options.transform || [
          { width: 1200, height: 900, crop: 'limit', quality: 'auto:good', fetch_format: 'auto' }
        ],
        ...options,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    // Pipe buffer into the upload stream
    const readable = Readable.from(buffer);
    readable.pipe(uploadStream);
  });
};

/**
 * Delete an image from Cloudinary by its public_id.
 * @param {string} publicId - Cloudinary public_id
 * @returns {Promise<Object>} Deletion result
 */
const deleteImage = (publicId) => {
  return cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
};

/**
 * Delete multiple images by their public_ids.
 * @param {string[]} publicIds
 */
const deleteImages = async (publicIds) => {
  if (!publicIds || publicIds.length === 0) return;
  const promises = publicIds.map(id => deleteImage(id));
  return Promise.allSettled(promises); // Don't fail if one deletion fails
};

/**
 * Generate a thumbnail URL from a Cloudinary public_id.
 * @param {string} publicId
 * @param {number} width
 * @param {number} height
 */
const getThumbnailUrl = (publicId, width = 400, height = 300) => {
  return cloudinary.url(publicId, {
    width, height, crop: 'fill', quality: 'auto', fetch_format: 'auto',
  });
};

module.exports = { cloudinary, uploadBuffer, deleteImage, deleteImages, getThumbnailUrl };
