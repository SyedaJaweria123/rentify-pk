'use strict';
const mongoose = require('mongoose');

const contactMessageSchema = new mongoose.Schema(
  {
    name:    { type: String, required: true, trim: true, maxlength: 120 },
    email:   { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
    subject: { type: String, required: true, trim: true, maxlength: 200, default: 'General Inquiry' },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    isRead:  { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ContactMessage', contactMessageSchema);
