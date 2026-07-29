'use strict';
/**
 * Generic Image Upload Routes — Rentify PK
 * Reusable authenticated image upload for evidence/proof/inspection photos.
 * Returns { url, publicId } so any feature (rider, damage-claim, inspection)
 * can attach Cloudinary images without its own upload endpoint.
 */
const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const { upload, handleUploadError } = require('../middleware/upload');
const { uploadBuffer } = require('../config/cloudinary');

// POST /api/uploads/image   (single image, field: "image")
router.post('/image', protect, upload.single('image'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'No image provided.' });
    }
    const folder = req.body.folder || 'rentify/evidence';
    const result = await uploadBuffer(req.file.buffer, { folder });
    return res.json({ success: true, data: { url: result.secure_url, publicId: result.public_id } });
  } catch (err) {
    console.error('[uploads.image]', err.message);
    return res.status(500).json({ success: false, message: 'Upload failed.' });
  }
}, handleUploadError);

// POST /api/uploads/images  (up to 6 images, field: "images")
router.post('/images', protect, upload.array('images', 6), async (req, res) => {
  try {
    if (!req.files || !req.files.length) {
      return res.status(400).json({ success: false, message: 'No images provided.' });
    }
    const folder = req.body.folder || 'rentify/evidence';
    const out = [];
    for (const f of req.files) {
      const r = await uploadBuffer(f.buffer, { folder });
      out.push({ url: r.secure_url, publicId: r.public_id });
    }
    return res.json({ success: true, data: out });
  } catch (err) {
    console.error('[uploads.images]', err.message);
    return res.status(500).json({ success: false, message: 'Upload failed.' });
  }
}, handleUploadError);

module.exports = router;
