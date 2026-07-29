'use strict';
const mongoose = require('mongoose');

const TICKET_STATUSES   = ['Open', 'In Progress', 'Resolved', 'Closed'];
const TICKET_CATEGORIES = ['Property Issue', 'Payment Issue', 'Account Issue', 'Technical Issue', 'Other'];

const supportTicketSchema = new mongoose.Schema(
  {
    ticketNumber:  { type: String, unique: true, index: true },
    user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null if guest
    fullName:      { type: String, required: true, trim: true, maxlength: 120 },
    email:         { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
    subject:       { type: String, required: true, trim: true, maxlength: 200 },
    category:      { type: String, enum: TICKET_CATEGORIES, default: 'Other' },
    message:       { type: String, required: true, trim: true, maxlength: 5000 },
    attachmentUrl: { type: String, default: '' },
    status:        { type: String, enum: TICKET_STATUSES, default: 'Open', index: true },
    adminReply:    { type: String, default: '' },
    internalNotes: { type: String, default: '' },
    repliedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    repliedAt:     { type: Date, default: null },
  },
  { timestamps: true }
);

// Auto-generate ticket number: TKT-2026-0001
supportTicketSchema.pre('save', async function (next) {
  if (this.ticketNumber) return next();
  try {
    const year  = new Date().getFullYear();
    const prefix = `TKT-${year}-`;
    // Count this year's tickets to get the next sequence
    const last = await this.constructor
      .findOne({ ticketNumber: new RegExp('^' + prefix) })
      .sort({ createdAt: -1 })
      .select('ticketNumber')
      .lean();
    let seq = 1;
    if (last && last.ticketNumber) {
      const n = parseInt(last.ticketNumber.split('-')[2], 10);
      if (!isNaN(n)) seq = n + 1;
    }
    this.ticketNumber = prefix + String(seq).padStart(4, '0');
    next();
  } catch (err) {
    next(err);
  }
});

supportTicketSchema.methods.toPublicJSON = function () {
  return {
    id:            this._id,
    ticketNumber:  this.ticketNumber,
    fullName:      this.fullName,
    email:         this.email,
    subject:       this.subject,
    category:      this.category,
    message:       this.message,
    attachmentUrl: this.attachmentUrl,
    status:        this.status,
    adminReply:    this.adminReply,
    internalNotes: this.internalNotes,
    repliedAt:     this.repliedAt,
    createdAt:     this.createdAt,
    updatedAt:     this.updatedAt,
  };
};

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

module.exports = SupportTicket;
module.exports.TICKET_STATUSES   = TICKET_STATUSES;
module.exports.TICKET_CATEGORIES = TICKET_CATEGORIES;
