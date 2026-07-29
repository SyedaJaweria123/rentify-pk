'use strict';
/**
 * Support Routes — Rentify PK (user-facing)
 * Authenticated users create and view their own support tickets.
 *
 * Controller/upload export names vary across versions, so we resolve each
 * handler from a list of likely names and fail loud only if none exist.
 */
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/support.controller');
const { protect } = require('../middleware/auth');
const ContactMessage = require('../models/ContactMessage');

// ── Resolve the upload middleware regardless of export style ──────────────────
const supportUploadModule = require('../middleware/supportUpload');
const resolveUpload = (m) => {
  if (typeof m === 'function') return m;
  if (m && typeof m.single === 'function') return m.single('attachment');
  if (m && typeof m.supportUpload === 'function') return m.supportUpload;
  if (m && m.supportUpload && typeof m.supportUpload.single === 'function') return m.supportUpload.single('attachment');
  if (m && m.upload && typeof m.upload.single === 'function') return m.upload.single('attachment');
  return (req, _res, next) => next();   // pass-through fallback
};
const uploadAttachment = resolveUpload(supportUploadModule);

// ── Resolve a controller handler from several possible names ──────────────────
const pick = (...names) => {
  for (const n of names) {
    if (typeof ctrl[n] === 'function') return ctrl[n];
  }
  // Loud-but-safe fallback so the server still boots; logs which handler is missing.
  const label = names[0];
  console.warn(`[support.routes] controller handler not found, tried: ${names.join(', ')}`);
  return (req, res) => res.status(501).json({ success: false, message: `Support handler "${label}" not implemented.` });
};

const createTicket = pick('createTicket', 'create', 'submitTicket', 'newTicket');
const listMine     = pick('myTickets', 'getMyTickets', 'listMyTickets', 'getUserTickets', 'listTickets');
const getMine      = pick('getMyTicket', 'getTicket', 'getTicketById', 'getMyTicketById');

// ── Public: Send email to admin (no auth needed) ────────────────────────────
router.post('/contact-email', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ success: false, message: 'Sab fields zaruri hain.' });
    }

    // Email validation
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRx.test(email)) {
      return res.status(400).json({ success: false, message: 'Valid email address darj karein.' });
    }

    // Save the message to MongoDB so admins can view it later
    try { await ContactMessage.create({ name, email, subject, message }); }
    catch (dbErr) { console.error('[contact-email] DB save failed:', dbErr.message); }

    const adminEmail = process.env.EMAIL_USER;
    const emailUtil  = require('../utils/email');

    // Send to admin
    await emailUtil.sendMail({
      to:      adminEmail,
      subject: `[Help Center] ${subject}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f8faf8;border-radius:12px">
          <div style="background:#1F5435;color:#fff;padding:18px 24px;border-radius:10px 10px 0 0">
            <h2 style="margin:0;font-size:18px">📧 New Help Center Message</h2>
          </div>
          <div style="background:#fff;padding:24px;border-radius:0 0 10px 10px;border:1px solid #e8efe8">
            <table style="width:100%;font-size:14px;color:#374151">
              <tr><td style="padding:8px 0;color:#6b7280;width:100px">Name:</td><td><strong>${name}</strong></td></tr>
              <tr><td style="padding:8px 0;color:#6b7280">Email:</td><td><a href="mailto:${email}" style="color:#1F5435">${email}</a></td></tr>
              <tr><td style="padding:8px 0;color:#6b7280">Subject:</td><td><strong>${subject}</strong></td></tr>
            </table>
            <hr style="border:none;border-top:1px solid #e8efe8;margin:16px 0"/>
            <p style="font-size:13px;color:#6b7280;margin-bottom:8px">Message:</p>
            <div style="background:#f8faf8;padding:14px;border-radius:8px;font-size:14px;color:#111827;line-height:1.6;white-space:pre-wrap">${message}</div>
            <p style="font-size:12px;color:#9ca3af;margin-top:16px">Sent from Rentify Help Center — ${new Date().toLocaleString('en-PK', {timeZone:'Asia/Karachi'})}</p>
          </div>
        </div>
      `,
    });

    // Auto-reply to sender
    await emailUtil.sendMail({
      to:      email,
      subject: `We received your message — Rentify Support`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
          <div style="background:#1F5435;color:#fff;padding:18px 24px;border-radius:10px 10px 0 0">
            <h2 style="margin:0;font-size:18px">✅ Message Received!</h2>
          </div>
          <div style="background:#fff;padding:24px;border-radius:0 0 10px 10px;border:1px solid #e8efe8">
            <p style="color:#374151;font-size:14px">Hi <strong>${name}</strong>,</p>
            <p style="color:#6b7280;font-size:13.5px;line-height:1.6">Thank you for reaching out to Rentify Support. We have received your message and our team will get back to you within <strong>1-3 business days</strong>.</p>
            <div style="background:#f8faf8;padding:14px;border-radius:8px;margin:16px 0;font-size:13px;color:#374151">
              <strong>Your message:</strong><br/><br/>
              <em style="color:#6b7280">${message.substring(0, 200)}${message.length > 200 ? '...' : ''}</em>
            </div>
            <p style="color:#9ca3af;font-size:12px">— Rentify PK Support Team</p>
          </div>
        </div>
      `,
    });

    return res.json({ success: true, message: 'Email successfully send ho gaya! Hum jald reply karein ge.' });
  } catch (err) {
    console.error('[contact-email] ERROR:', err.message, err.stack);
    return res.status(500).json({ 
      success: false, 
      message: `Email error: ${err.message}` 
    });
  }
});

// ── Public FAQ search (no auth needed) ───────────────────────────────────────
router.get('/faqs/search', ctrl.searchFaqs || ((req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  const ALL_FAQS = [
    { id:1, q:'How to book an item?',         a:'Browse listings, select dates, click "Book Now". Owner confirms, then pay via JazzCash/Easypaisa/Bank Transfer.' },
    { id:2, q:'How does the payment work?',   a:'Pay via JazzCash, Easypaisa or Bank Transfer. Upload slip — admin verifies within a few hours. Payment held in escrow until rental ends.' },
    { id:3, q:'How to add a listing?',        a:'Login as Owner, go to Dashboard → Add Listing. Fill title, category, price, city, photos and submit. Admin may review before it goes live.' },
    { id:4, q:'How to withdraw money?',       a:'Go to Wallet → Withdraw. Enter amount and account number. Admin processes withdrawals within 1-3 business days.' },
    { id:5, q:'What is security deposit?',    a:'A refundable amount held during rental. Returned after item is returned undamaged. Deducted if damage is found.' },
    { id:6, q:'How does delivery work?',      a:'Choose "Doorstep Delivery" at booking. Our rider picks up from owner and delivers to you. Track live on map.' },
    { id:7, q:'How to cancel a booking?',     a:'Go to My Bookings → Booking Detail → Cancel. Refund depends on cancellation policy set by owner.' },
    { id:8, q:'What if item is damaged?',     a:'Owner files a Damage Claim with photos. Admin reviews and deducts from security deposit if valid.' },
    { id:9, q:'How to verify my CNIC?',       a:'Go to Profile → CNIC Verification. Upload front, back and selfie. Admin verifies within 24 hours.' },
    { id:10,q:'How to become an owner?',      a:'Register as Renter first, then click "Become Owner" in your dashboard. Fill in required details and submit.' },
    { id:11,q:'How to become a rider?',       a:'Register with Rider role or upgrade from dashboard. Admin approves rider applications.' },
    { id:12,q:'What payment methods are accepted?', a:'JazzCash, Easypaisa and Bank Transfer (manual slip upload). Stripe is available for international cards.' },
    { id:13,q:'How long does payment verification take?', a:'Admins verify payment slips within a few hours during working hours (9am–9pm PKT).' },
    { id:14,q:'Can I track my delivery?',     a:'Yes — go to Bookings → Booking Detail → Track Delivery. See rider live location on map.' },
    { id:15,q:'What is escrow?',              a:'Your payment is held safely in escrow until rental ends. Owner gets paid after successful return. Protects both parties.' },
  ];

  if (!q) return res.json({ success: true, data: ALL_FAQS.slice(0, 6) });

  const results = ALL_FAQS.filter(f =>
    f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)
  );

  return res.json({ success: true, data: results });
}));

router.use(protect);

// Create a ticket (optional single attachment, field name: "attachment")
router.post('/', uploadAttachment, createTicket);

// List my tickets
router.get('/', listMine);

// Single ticket I own
router.get('/:id', getMine);

module.exports = router;
