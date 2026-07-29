'use strict';
const SupportTicket = require('../models/SupportTicket');
const { TICKET_STATUSES, TICKET_CATEGORIES } = require('../models/SupportTicket');
const { uploadBuffer } = require('../config/cloudinary');
const email = require('../utils/email');

// Basic XSS-safe sanitizer: strip angle brackets, trim, cap length
const clean = (v, max = 5000) =>
  String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, max);

const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/* ──────────────────────────────────────────────────────────────────────────
   POST /api/support/create-ticket   (AUTH REQUIRED)
   Name + email are taken from the authenticated session — never trusted from body.
   ────────────────────────────────────────────────────────────────────────── */
exports.createTicket = async (req, res) => {
  try {
    // Identity comes ONLY from the verified session
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required. Please log in first.' });
    }
    const fullName = clean(req.user.name || req.user.fullName || 'User', 120);
    const emailAdr = clean(req.user.email, 160).toLowerCase();

    const subject  = clean(req.body.subject, 200);
    const category = clean(req.body.category, 40);
    const message  = clean(req.body.message, 5000);

    // ── Server-side validation (only user-supplied fields) ──
    if (!subject || !message) {
      return res.status(400).json({ success: false, message: 'Please fill in all required fields.' });
    }
    if (!emailAdr || !isEmail(emailAdr)) {
      return res.status(400).json({ success: false, message: 'Your account email is invalid. Please update your profile.' });
    }
    const finalCategory = TICKET_CATEGORIES.includes(category) ? category : 'Other';

    // ── Optional attachment → Cloudinary ──
    let attachmentUrl = '';
    if (req.file && req.file.buffer) {
      const isPdf = req.file.mimetype === 'application/pdf';
      const result = await uploadBuffer(req.file.buffer, {
        folder: 'rentify/support',
        resource_type: isPdf ? 'raw' : 'image',
      });
      attachmentUrl = result.secure_url;
    }

    const ticket = await SupportTicket.create({
      user: req.user._id,          // always linked to the authenticated user
      fullName, email: emailAdr, subject,
      category: finalCategory, message, attachmentUrl,
    });

    email.sendSupportTicketCreatedEmail({
      to: emailAdr, name: fullName, ticketNumber: ticket.ticketNumber, subject,
    }).catch(err => console.warn('Support confirm email failed:', err.message));

    return res.status(201).json({
      success: true,
      message: 'Your support request has been submitted successfully.',
      data: { ticketNumber: ticket.ticketNumber, status: ticket.status },
    });
  } catch (err) {
    console.error('createTicket error:', err);
    return res.status(500).json({ success: false, message: 'Could not submit your request. Please try again.' });
  }
};

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/support/my-tickets   (AUTH REQUIRED) — only the user's own tickets
   query: page, limit, search, status
   ────────────────────────────────────────────────────────────────────────── */
exports.myTickets = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required. Please log in first.' });

    const page  = Math.max(1, parseInt(req.query.page, 10)  || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip  = (page - 1) * limit;

    const filter = { user: req.user._id };   // strictly scoped to this user
    if (req.query.status && TICKET_STATUSES.includes(req.query.status)) filter.status = req.query.status;
    if (req.query.search && req.query.search.trim()) {
      const esc = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(esc, 'i');
      filter.$or = [{ ticketNumber: rx }, { subject: rx }];
    }

    const sortOrder = req.query.sort === 'oldest' ? 1 : -1;

    const [tickets, total] = await Promise.all([
      SupportTicket.find(filter).sort({ createdAt: sortOrder }).skip(skip).limit(limit),
      SupportTicket.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: {
        tickets: tickets.map(t => t.toPublicJSON()),
        pagination: {
          page, limit, total,
          totalPages: Math.ceil(total / limit) || 1,
          hasPrev: page > 1,
          hasNext: page * limit < total,
        },
      },
    });
  } catch (err) {
    console.error('myTickets error:', err.message, err.stack);
    return res.status(500).json({ success: false, message: err.message || 'Could not load your tickets.' });
  }
};

/* GET /api/support/my-tickets/:id   (AUTH REQUIRED) — only if owned by the user */
exports.myTicketDetail = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required. Please log in first.' });
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found.' });
    // Ownership check — user can never read another user's ticket
    if (String(ticket.user) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'You do not have access to this ticket.' });
    }
    return res.json({ success: true, data: ticket.toPublicJSON() });
  } catch (err) {
    console.error('myTicketDetail error:', err);
    return res.status(500).json({ success: false, message: 'Could not load ticket.' });
  }
};

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/admin/support-tickets   (admin)
   query: page, limit, search, status, category
   ────────────────────────────────────────────────────────────────────────── */
exports.listTickets = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page, 10)  || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip  = (page - 1) * limit;

    const filter = {};
    if (req.query.status && TICKET_STATUSES.includes(req.query.status))     filter.status = req.query.status;
    if (req.query.category && TICKET_CATEGORIES.includes(req.query.category)) filter.category = req.query.category;
    if (req.query.search && req.query.search.trim()) {
      const esc = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(esc, 'i');
      filter.$or = [{ ticketNumber: rx }, { fullName: rx }, { email: rx }, { subject: rx }];
    }

    const [tickets, total, openCount, progressCount, resolvedCount] = await Promise.all([
      SupportTicket.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      SupportTicket.countDocuments(filter),
      SupportTicket.countDocuments({ status: 'Open' }),
      SupportTicket.countDocuments({ status: 'In Progress' }),
      SupportTicket.countDocuments({ status: 'Resolved' }),
    ]);

    return res.json({
      success: true,
      data: {
        tickets: tickets.map(t => t.toPublicJSON()),
        stats: { open: openCount, inProgress: progressCount, resolved: resolvedCount, total: await SupportTicket.estimatedDocumentCount() },
        pagination: {
          page, limit, total,
          totalPages: Math.ceil(total / limit) || 1,
          hasPrev: page > 1,
          hasNext: page * limit < total,
        },
      },
    });
  } catch (err) {
    console.error('listTickets error:', err);
    return res.status(500).json({ success: false, message: 'Could not load tickets.' });
  }
};

/* GET /api/admin/support-tickets/:id */
exports.getTicket = async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id).populate('user', 'name email');
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found.' });
    return res.json({ success: true, data: ticket.toPublicJSON() });
  } catch (err) {
    console.error('getTicket error:', err);
    return res.status(500).json({ success: false, message: 'Could not load ticket.' });
  }
};

/* PUT /api/admin/support-tickets/:id/status   body: { status, internalNotes? } */
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!TICKET_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found.' });

    const wasResolved = ticket.status === 'Resolved';
    ticket.status = status;
    if (typeof req.body.internalNotes === 'string') {
      ticket.internalNotes = clean(req.body.internalNotes, 3000);
    }
    await ticket.save();

    // Resolution email when newly resolved
    if (status === 'Resolved' && !wasResolved) {
      email.sendSupportResolvedEmail({
        to: ticket.email, name: ticket.fullName, ticketNumber: ticket.ticketNumber,
      }).catch(err => console.warn('Support resolved email failed:', err.message));
    }

    return res.json({ success: true, message: 'Ticket status updated.', data: ticket.toPublicJSON() });
  } catch (err) {
    console.error('updateStatus error:', err);
    return res.status(500).json({ success: false, message: 'Could not update status.' });
  }
};

/* POST /api/admin/support-tickets/:id/reply   body: { reply, status? } */
exports.replyTicket = async (req, res) => {
  try {
    const reply = clean(req.body.reply, 5000);
    if (!reply) return res.status(400).json({ success: false, message: 'Reply cannot be empty.' });

    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found.' });

    ticket.adminReply = reply;
    ticket.repliedBy  = req.user._id;
    ticket.repliedAt  = new Date();
    // optional status change with the reply
    if (req.body.status && TICKET_STATUSES.includes(req.body.status)) {
      ticket.status = req.body.status;
    } else if (ticket.status === 'Open') {
      ticket.status = 'In Progress';
    }
    await ticket.save();

    // Send reply email to user
    email.sendSupportReplyEmail({
      to: ticket.email, name: ticket.fullName, ticketNumber: ticket.ticketNumber, reply,
    }).catch(err => console.warn('Support reply email failed:', err.message));

    return res.json({ success: true, message: 'Reply sent to user.', data: ticket.toPublicJSON() });
  } catch (err) {
    console.error('replyTicket error:', err);
    return res.status(500).json({ success: false, message: 'Could not send reply.' });
  }
};
