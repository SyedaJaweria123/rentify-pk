'use strict';
/**
 * Chat Media Upload Routes — Rentify PK
 * Lets chat users send WhatsApp-style voice notes and video clips.
 * (Image uploads for chat reuse the existing generic /api/uploads/image
 * route — no new endpoint needed there.)
 * Media is uploaded to Cloudinary and the resulting URL is then attached
 * to a chat message via the existing /messages/send flow.
 */
const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const { protect } = require('../middleware/auth');
const cloudinary   = require('cloudinary').v2;
const { Readable } = require('stream');

function uploadToCloudinary(buffer, folder, resourceType) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    Readable.from(buffer).pipe(uploadStream);
  });
}

// ── Voice notes ──────────────────────────────────────────────────────────────
const ALLOWED_AUDIO_TYPES = [
  'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp3',
  'audio/wav', 'audio/mp4', 'audio/aac', 'audio/x-m4a',
];
const MAX_AUDIO_SIZE = 10 * 1024 * 1024; // 10MB

const audioStorage = multer.memoryStorage();
const audioFilter = (_req, file, cb) => {
  if (ALLOWED_AUDIO_TYPES.includes(file.mimetype)) cb(null, true);
  else cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only audio files are allowed.'));
};
const uploadAudio = multer({ storage: audioStorage, fileFilter: audioFilter, limits: { fileSize: MAX_AUDIO_SIZE } });

// POST /api/uploads/voice  (single audio file, field: "audio")
router.post('/voice', protect, uploadAudio.single('audio'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'No audio provided.' });
    }
    const durationSec = parseFloat(req.body.duration) || null;
    const result = await uploadToCloudinary(req.file.buffer, 'rentify/voice-messages', 'video');

    return res.json({
      success: true,
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        duration: durationSec ?? result.duration ?? null,
      },
    });
  } catch (err) {
    console.error('[uploads.voice]', err.message);
    return res.status(500).json({ success: false, message: 'Voice upload failed.' });
  }
}, (err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'Voice message must be under 10MB.' });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  next(err);
});

// ── Video clips ──────────────────────────────────────────────────────────────
const ALLOWED_VIDEO_TYPES = [
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/3gpp',
];
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB — enough for a short clip

const videoStorage = multer.memoryStorage();
const videoFilter = (_req, file, cb) => {
  if (ALLOWED_VIDEO_TYPES.includes(file.mimetype)) cb(null, true);
  else cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only video files (MP4, WebM, MOV) are allowed.'));
};
const uploadVideo = multer({ storage: videoStorage, fileFilter: videoFilter, limits: { fileSize: MAX_VIDEO_SIZE } });

// POST /api/uploads/video  (single video file, field: "video")
router.post('/video', protect, uploadVideo.single('video'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'No video provided.' });
    }

    const result = await uploadToCloudinary(req.file.buffer, 'rentify/chat-videos', 'video');

    // Cloudinary can generate a JPG thumbnail for any uploaded video by
    // swapping the extension — no extra upload/processing call needed.
    const thumbUrl = result.secure_url.replace(/\.[a-zA-Z0-9]+$/, '.jpg');

    return res.json({
      success: true,
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        thumbUrl,
        duration: result.duration || null,
      },
    });
  } catch (err) {
    console.error('[uploads.video]', err.message);
    return res.status(500).json({ success: false, message: 'Video upload failed.' });
  }
}, (err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'Video must be under 50MB.' });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  next(err);
});

module.exports = router;
