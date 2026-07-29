// backend/config/email.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// ── Send email ────────────────────────────────────────────────────────────────
const sendEmail = async ({ to, subject, html, text }) => {
  const info = await transporter.sendMail({
    from: `"Rentify" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
    text,
  });
  return info;
};

// ── Email Templates ───────────────────────────────────────────────────────────
const templates = {
  bookingConfirmed: (renterName, listingTitle, startDate, endDate) => ({
    subject: `Booking Confirmed — ${listingTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#4f46e5">Booking Confirmed! 🎉</h2>
        <p>Hi ${renterName},</p>
        <p>Your booking for <strong>${listingTitle}</strong> has been confirmed.</p>
        <p><strong>Dates:</strong> ${new Date(startDate).toDateString()} – ${new Date(endDate).toDateString()}</p>
        <p>Log in to Rentify to view full details.</p>
      </div>
    `,
  }),

  bookingRequest: (ownerName, renterName, listingTitle, startDate, endDate, totalAmount) => ({
    subject: `New Booking Request — ${listingTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#4f46e5">New Booking Request</h2>
        <p>Hi ${ownerName},</p>
        <p><strong>${renterName}</strong> wants to rent <strong>${listingTitle}</strong>.</p>
        <p><strong>Dates:</strong> ${new Date(startDate).toDateString()} – ${new Date(endDate).toDateString()}</p>
        <p><strong>Amount:</strong> Rs ${totalAmount.toLocaleString()}</p>
        <p>Log in to confirm or reject this booking.</p>
      </div>
    `,
  }),

  withdrawalProcessed: (name, amount, method) => ({
    subject: 'Withdrawal Processed',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#4f46e5">Withdrawal Processed</h2>
        <p>Hi ${name},</p>
        <p>Your withdrawal of <strong>Rs ${amount.toLocaleString()}</strong> via ${method} is being processed.</p>
        <p>Allow 1–3 business days for the funds to arrive.</p>
      </div>
    `,
  }),
};

module.exports = { sendEmail, templates };
