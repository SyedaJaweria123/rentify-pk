'use strict';
/**
 * Rentify PK — Email Utility (Production-Ready v3 — New Brand Design)
 *
 * ROOT CAUSE FIX for email delivery issues:
 *   1. Gmail App Password must be real 16-char code (not placeholder)
 *   2. Transport is verified at startup — misconfiguration caught early
 *   3. Retry logic (2 retries) for transient SMTP failures
 *   4. Pooled connection for performance
 *   5. Plain-text fallback included in every email (prevents spam)
 *   6. XSS-safe HTML escaping for user-supplied data
 *
 * HOW TO FIX YOUR GMAIL:
 *   1. myaccount.google.com → Security → Enable 2-Step Verification
 *   2. Security → App Passwords → Select "Mail" → Generate
 *   3. Set EMAIL_PASS=xxxx xxxx xxxx xxxx in .env (keep spaces)
 */

const nodemailer = require('nodemailer');

let _transporter = null;

// ── Brand asset (hero illustration) ─────────────────────────────────────────
const HERO_IMAGE_URL = 'https://res.cloudinary.com/dqqjiwsdk/image/upload/v1781913884/ChatGPT_Image_Jun_18__2026__10_50_24_PM-removebg-preview_gs62es.png';

// The real Rentify logo, hosted so email clients can load it (a PNG in the
// app's /public folder can't be referenced from an email). Upload
// rentify-logo.png to Cloudinary and set the RENTIFY_LOGO_URL env var to its
// URL. Until then the header falls back to the monogram tile.
const LOGO_URL = process.env.RENTIFY_LOGO_URL || '';

// ── Transporter (lazy singleton, pooled) ────────────────────────────────────
const getTransporter = () => {
  if (_transporter) return _transporter;

  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    throw new Error('EMAIL_USER aur EMAIL_PASS .env mein set karein');
  }

  const cleanPass = pass.replace(/\s+/g, '');
  if (!cleanPass || cleanPass.includes('xxxx') || cleanPass.length < 16) {
    throw new Error(
      'EMAIL_PASS valid nahi hai.\n' +
      '  Gmail App Password 16 characters ka hota hai.\n' +
      '  → myaccount.google.com/security → 2-Step Verification → App Passwords\n' +
      '  Current value length: ' + cleanPass.length
    );
  }

  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: 5,
  });

  return _transporter;
};

// ── Verify transport (call from server.js startup) ──────────────────────────
const verifyEmailTransport = async () => {
  try {
    const t = getTransporter();
    await t.verify();
    console.log(`\u2705 Email ready: ${process.env.EMAIL_USER}`);
    return true;
  } catch (err) {
    console.error('\n\u274C EMAIL TRANSPORT ERROR:');
    console.error('   ' + err.message);
    console.error('\n   Quick Fix Steps:');
    console.error('   1. myaccount.google.com/security');
    console.error('   2. Enable 2-Step Verification (REQUIRED)');
    console.error('   3. Security > App Passwords > Mail > Generate');
    console.error('   4. Paste 16-char code in .env as EMAIL_PASS');
    console.error('   5. Restart server\n');
    console.error('   EMAIL_USER set:', !!process.env.EMAIL_USER);
    console.error('   EMAIL_PASS set:', !!process.env.EMAIL_PASS);
    return false;
  }
};

// ── HTML escape (XSS safety) ────────────────────────────────────────────────
const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

// ── PKR amount formatter — 1500 → "1,500" (comma grouping, no decimals) ──────
const pkr = (amount) => {
  const n = Number(amount) || 0;
  return n.toLocaleString('en-PK', { maximumFractionDigits: 0 });
};

// ── Short date formatter — for booking dates ────────────────────────────────
const fmtDate = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
};

// ── Icon set — emoji-based (Gmail strips inline <svg>, emoji always render) ──
const ICONS = {
  lock: '&#128274;',
  mail: '&#9993;&#65039;',
  party: '&#127881;',
  shieldAlert: '&#128683;',
  shieldCheck: '&#9989;',
  calendarCheck: '&#128197;',
  calendarX: '&#128197;',
  bell: '&#128276;',
  wallet: '&#128176;',
  cashOut: '&#128184;',
  star: '&#11088;',
  ban: '&#128683;',
  idCard: '&#129380;',
  idCardX: '&#129380;',
  ticket: '&#127979;',
  truck: '&#128692;',
  box: '&#128230;',
  boxCheck: '&#9989;',
};

const eyebrowToneClass = (tone) => (tone === 'warn' ? ' warn' : tone === 'danger' ? ' danger' : '');
const boxToneClass = (tone) => tone || 'info';
const BOX_GLYPH = { info: 'i', note: 'i', warn: '!', alert: '!' };

// ── Email shell (hero header + body slot + footer) ──────────────────────────
const wrap = (content) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Rentify PK</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#f7faf8;padding:40px 20px;-webkit-font-smoothing:antialiased}
  .outer{max-width:600px;margin:0 auto;background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 1px 3px rgba(15,40,25,.04),0 12px 32px rgba(15,40,25,.07),0 32px 64px rgba(15,40,25,.05)}

  /* Hero header */
  .hero{position:relative;background:linear-gradient(135deg,#f4f8f6 0%,#e7f3ea 55%,#dcefe1 100%);padding:38px 40px 0;overflow:hidden}
  .hero-dots{position:absolute;top:20px;right:20px;width:54px;height:54px;background-image:radial-gradient(#bcd9c4 1.6px, transparent 1.6px);background-size:9px 9px;opacity:.7}
  .logo-row{position:relative;z-index:2}
  .logo-box{width:42px;height:42px;border-radius:12px;text-align:center;line-height:42px;background:linear-gradient(135deg,#2F855A,#1F5435);color:#fff;font-size:22px;font-weight:800;box-shadow:0 4px 10px rgba(31,84,53,.3)}
  .hero-sub{position:relative;z-index:2;color:#64748B;font-size:13px;font-weight:500;margin-top:12px;letter-spacing:.1px}
  .hero-rule{position:relative;z-index:2;width:32px;height:3px;background:linear-gradient(90deg,#2F855A,#1F5435);border-radius:2px;margin-top:11px}
  .wave{height:16px;background:#fff;border-radius:50% 50% 0 0 / 100% 100% 0 0;margin:0 -40px -1px;border-top:2.5px solid #1F5435}
  .logo-text{font-size:24px;font-weight:800;color:#1E293B;letter-spacing:-0.4px}
  .logo-text span{color:#1F5435}

  /* Body */
  .body{padding:14px 40px 8px}
  .icon-circle{width:60px;height:60px;border-radius:50%;background:#E8F5EE;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:27px;line-height:1;font-family:'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif}
  .icon-circle.tone-danger{background:#fdeaea}
  .eyebrow-row{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:20px}
  .eyebrow-line{width:20px;height:1px;background:#a7d7b4}
  .eyebrow{display:inline-block;background:#E8F5EE;color:#1F5435;font-size:11px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;padding:6px 15px;border-radius:20px;white-space:nowrap}
  .eyebrow.warn{background:#fef3c7;color:#b45309}
  .eyebrow.danger{background:#fee2e2;color:#dc2626}
  h1.greet{text-align:center;font-size:26px;font-weight:800;color:#1E293B;margin-bottom:14px;letter-spacing:-0.5px;line-height:1.25}
  h1.greet span{color:#1F5435}
  p.lead{text-align:center;color:#64748B;font-size:15px;line-height:1.75;max-width:450px;margin:0 auto 28px}
  p.lead strong{color:#1F5435;font-weight:600}

  /* OTP / amount card */
  .otp-wrap{background:linear-gradient(135deg,#eefbf1,#e1f6e6);border:1px solid #d3edd9;border-radius:18px;padding:28px 24px;text-align:center;margin-bottom:24px}
  .otp-title{text-align:center;color:#1F5435;font-size:12px;font-weight:800;letter-spacing:1.3px;text-transform:uppercase;margin-bottom:18px}
  .otp-digits{text-align:center;margin-bottom:18px;line-height:0}
  .otp-digit{display:inline-block;width:48px;height:56px;background:#fff;border:1.5px solid #cdebd6;border-radius:11px;font-size:25px;font-weight:800;color:#1E293B;box-shadow:0 2px 5px rgba(15,40,25,.06);text-align:center;line-height:56px;margin:0 4px;vertical-align:middle}
  .otp-amount{font-size:36px;font-weight:800;color:#1E293B;margin-bottom:10px;letter-spacing:.3px;text-align:center}
  .otp-note{text-align:center;color:#3f6b4d;font-size:13px;line-height:1.6}
  .otp-note strong{color:#1F5435}

  /* Detail rows card */
  .detail-card{background:#F7FAF8;border:1px solid #E2E8F0;border-radius:14px;padding:18px 20px;margin-bottom:20px;font-size:13.5px;color:#334155;line-height:1.95}
  .detail-card strong{color:#1E293B}
  .detail-card.tone-alert{background:#fef2f2;border-color:#fbdada;color:#7a2424}
  .detail-card.tone-alert strong{color:#7a2424}
  .detail-card .stars{font-size:18px;margin-bottom:4px}

  /* Callout boxes */
  .box{border-radius:14px;margin-bottom:20px;font-size:13.5px;line-height:1.65}
  .box td{padding:0}
  .box.note{background:#fdf6e3;color:#8a6d1d}
  .box.note td:first-child,.box.note td:last-child{padding-top:16px;padding-bottom:16px}
  .box.note td:first-child{padding-left:18px}
  .box.note td:last-child{padding-right:18px}
  .box-icon{width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-size:13px;font-weight:800;color:#fff}
  .box.note .box-icon{background:#F59E0B}
  .box.warn{background:#fef3c7;color:#92400e}
  .box.warn td:first-child,.box.warn td:last-child{padding-top:16px;padding-bottom:16px}
  .box.warn td:first-child{padding-left:18px}
  .box.warn td:last-child{padding-right:18px}
  .box.warn .box-icon{background:#F59E0B}
  .box.alert{background:#fef2f2;color:#991b1b}
  .box.alert td:first-child,.box.alert td:last-child{padding-top:16px;padding-bottom:16px}
  .box.alert td:first-child{padding-left:18px}
  .box.alert td:last-child{padding-right:18px}
  .box.alert .box-icon{background:#ef4444}
  .box.info{background:#E8F5EE;color:#2c5c42}
  .box.info td:first-child,.box.info td:last-child{padding-top:16px;padding-bottom:16px}
  .box.info td:first-child{padding-left:18px}
  .box.info td:last-child{padding-right:18px}
  .box.info .box-icon{background:#1F5435}
  .box strong{color:inherit}

  .btn-row{text-align:center;margin:10px 0 26px}
  .btn{display:inline-block;background:linear-gradient(135deg,#2F855A,#1F5435);color:#fff!important;padding:15px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:.2px;box-shadow:0 8px 20px rgba(31,84,53,.3)}
  .btn.danger{background:linear-gradient(135deg,#ef4444,#b91c1c);box-shadow:0 8px 20px rgba(185,28,28,.28)}

  .fine{text-align:center;color:#94a3b8;font-size:12px;margin-bottom:24px;line-height:1.7}

  /* Trust / security strip */
  .trust{display:flex;border:1px solid #E2E8F0;border-radius:16px;padding:20px 8px;margin-bottom:28px;background:#fff}
  .trust-item{flex:1;text-align:center;padding:0 6px}
  .trust-icon{width:36px;height:36px;border-radius:50%;background:#E8F5EE;display:flex;align-items:center;justify-content:center;margin:0 auto 9px;font-size:15px;line-height:1;font-family:'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif}
  .trust-title{font-size:11.5px;font-weight:700;color:#1E293B;margin-bottom:2px}
  .trust-sub{font-size:10px;color:#94a3b8;line-height:1.3}

  /* Elegant divider */
  .divider-row{display:flex;align-items:center;gap:14px;margin:4px 0 24px}
  .divider-line{flex:1;height:1px;background:#E2E8F0}
  .divider-dot{width:6px;height:6px;border-radius:50%;background:#1F5435;flex-shrink:0}

  /* Support section */
  .support{text-align:center;margin-bottom:24px}
  .support-title{font-size:13px;font-weight:700;color:#1E293B;margin-bottom:12px}
  .support-links{font-size:13px}
  .support-links a{color:#1F5435!important;text-decoration:none;font-weight:600;margin:0 8px;white-space:nowrap}
  .support-sep{color:#cbd5e1}

  /* Sign-off */
  .signoff{text-align:center;color:#64748B;font-size:14px;margin-bottom:18px;line-height:1.6}
  .signoff strong{color:#1F5435}
  .socials{text-align:center;padding-bottom:8px}
  .social-icon{display:inline-block;width:36px;height:36px;line-height:36px;border-radius:50%;background:#1F5435;text-align:center;margin:0 4px;text-decoration:none;color:#fff!important;font-size:14px;font-weight:700;font-family:Georgia,'Times New Roman',serif}

  .legal-footer{background:#F7FAF8;border-top:1px solid #eef3f0;padding:24px 40px 28px;text-align:center;color:#94a3b8;font-size:10.5px;line-height:1.95}
  .legal-footer strong{color:#1F5435}
  .legal-footer a{color:#94a3b8;text-decoration:underline}
  .footer-addr{color:#94a3b8;font-size:10.5px;margin-bottom:6px}

  @media (max-width:480px){
    body{padding:20px 12px}
    .hero{padding:28px 24px 0}
    .body{padding:12px 24px 8px}
    .legal-footer{padding:22px 24px 24px}
    .otp-digit{width:40px;height:50px;font-size:21px}
    .trust{flex-wrap:wrap}
    .trust-item{flex:1 1 50%;margin-bottom:14px}
    .support-links a{display:inline-block;margin:3px 6px}
  }
</style>
</head>
<body>
<div class="outer">

  <div class="hero">
    <div class="hero-dots"></div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="vertical-align:middle;padding-bottom:18px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              ${LOGO_URL
                ? `<td><img src="${LOGO_URL}" alt="Rentify PK" height="34" style="height:34px;width:auto;display:block;border:0"></td>`
                : `<td style="vertical-align:middle;padding-right:11px"><div class="logo-box">R</div></td>
                   <td style="vertical-align:middle"><div class="logo-text">Rent<span>ify</span> PK</div></td>`}
            </tr>
          </table>
          <div class="hero-sub">Pakistan's Trusted Rental Marketplace</div>
          <div class="hero-rule"></div>
        </td>
        <td width="150" style="vertical-align:middle;text-align:right;padding-bottom:18px">
          <img src="${HERO_IMAGE_URL}" width="140" alt="Rentify PK" style="width:140px;max-width:140px;height:auto;display:inline-block;border:0">
        </td>
      </tr>
    </table>
    <div class="wave"></div>
  </div>


  <div class="body">${content}</div>

  <div style="padding:0 40px">
    <div class="divider-row">
      <span class="divider-line"></span>
      <span class="divider-dot"></span>
      <span class="divider-line"></span>
    </div>

    <div class="support">
      <div class="support-title">Need help? We're here for you.</div>
      <div class="support-links">
        <a href="${process.env.FRONTEND_URL || '#'}/help">Help Center</a>
        <span class="support-sep">&bull;</span>
        <a href="${process.env.FRONTEND_URL || '#'}/contact">Email Support</a>
        <span class="support-sep">&bull;</span>
        <a href="${process.env.FRONTEND_URL || '#'}/faqs">FAQs</a>
      </div>
    </div>

    <div class="socials">
      <a class="social-icon" href="#" title="Facebook">f</a>
      <a class="social-icon" href="#" title="Instagram">&#9673;</a>
      <a class="social-icon" href="#" title="LinkedIn">in</a>
      <a class="social-icon" href="#" title="YouTube">&#9654;</a>
    </div>
  </div>

  <div class="legal-footer">
    <div class="footer-addr"><strong>Rentify PK</strong> &mdash; Pakistan's Trusted Rental Marketplace</div>
    Karachi, Sindh, Pakistan<br>
    <a href="${process.env.FRONTEND_URL || '#'}/privacy">Privacy Policy</a>
    &nbsp;&middot;&nbsp;
    <a href="${process.env.FRONTEND_URL || '#'}/terms">Terms of Service</a>
    &nbsp;&middot;&nbsp;
    <a href="${process.env.FRONTEND_URL || '#'}/settings/notifications">Unsubscribe</a><br>
    <span style="color:#b6c2bb">&#x1F512; SSL Encrypted &nbsp;&middot;&nbsp; Spam-Free &nbsp;&middot;&nbsp; This is an automated email, please don't reply</span><br>
    &copy; ${new Date().getFullYear()} Rentify PK. All rights reserved.
  </div>
</div>
</body>
</html>`;

// ── Reusable body-content builders ──────────────────────────────────────────

// Icon circle + eyebrow pill + heading + lead paragraph (the "intro" block every email starts with)
const introBlock = ({ icon, tone, eyebrowText, heading, headingAccent, lead }) => `
  <div class="icon-circle${tone === 'danger' ? ' tone-danger' : ''}">${icon}</div>
  <div class="eyebrow-row">
    <span class="eyebrow-line"></span>
    <span class="eyebrow${eyebrowToneClass(tone)}">${eyebrowText}</span>
    <span class="eyebrow-line"></span>
  </div>
  <h1 class="greet">${heading}${headingAccent ? ` <span>${headingAccent}</span>` : ''}</h1>
  ${lead ? `<p class="lead">${lead}</p>` : ''}
`;

// Six individual boxes showing a code (OTP)
const otpDigitsBlock = ({ label, code, validityText }) => {
  const digits = String(code).split('').map((d) => `<div class="otp-digit">${esc(d)}</div>`).join('');
  return `
  <div class="otp-wrap">
    <div class="otp-title"><span style="margin-right:7px">&#128273;</span>${label}</div>
    <div class="otp-digits">${digits}</div>
    <div class="otp-note"><span style="margin-right:6px">&#128274;</span><span>${validityText}</span></div>
  </div>`;
};

// Single highlighted amount (payments/withdrawals)
const otpAmountBlock = ({ label, amount, note }) => `
  <div class="otp-wrap">
    <div class="otp-title">&#9989; ${label}</div>
    <div class="otp-amount">PKR ${pkr(amount)}</div>
    ${note ? `<div class="otp-note">${note}</div>` : ''}
  </div>`;

// Key:value detail card
const detailCard = (rows, tone) => `<div class="detail-card${tone === 'alert' ? ' tone-alert' : ''}">${rows.join('<br>')}</div>`;

// Callout box (note / warn / alert / info)
const box = (tone, html) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="box ${boxToneClass(tone)}">
    <tr>
      <td width="24" style="vertical-align:top;padding-right:12px">
        <div class="box-icon">${BOX_GLYPH[tone] || 'i'}</div>
      </td>
      <td style="vertical-align:top">${html}</td>
    </tr>
  </table>`;

const ctaButton = (href, label, danger) => `
  <div class="btn-row"><a href="${href}" class="btn${danger ? ' danger' : ''}">${label}</a></div>`;

const fineprint = (text) => `<p class="fine">${text}</p>`;

const trustStrip = () => `
  <div class="trust">
    <div class="trust-item">
      <div class="trust-icon">${ICONS.shieldCheck}</div>
      <div class="trust-title">Secure Platform</div>
      <div class="trust-sub">100% Protected</div>
    </div>
    <div class="trust-item">
      <div class="trust-icon">&#128101;</div>
      <div class="trust-title">Trusted</div>
      <div class="trust-sub">Happy Users</div>
    </div>
    <div class="trust-item">
      <div class="trust-icon">&#127911;</div>
      <div class="trust-title">24/7 Support</div>
      <div class="trust-sub">Always Here</div>
    </div>
    <div class="trust-item">
      <div class="trust-icon">${ICONS.lock}</div>
      <div class="trust-title">Privacy First</div>
      <div class="trust-sub">Data Stays Safe</div>
    </div>
  </div>`;

const signoffBlock = () => `
  <div class="signoff">Shukriya,<br>Team <strong>Rentify PK</strong> &#9829;</div>`;

// Full body assembler — every template below builds its content with this
const buildBody = (parts) => parts.filter(Boolean).join('\n');

// ── Send with retry ─────────────────────────────────────────────────────────
const sendMail = async (options, retries = 2) => {
  // ── DEVELOPMENT BYPASS ────────────────────────────────────────────────────
  // In development we don't require a working Gmail App Password. If email
  // isn't configured (or EMAIL_DEV_BYPASS=true), we log the message to the
  // server console instead of sending — so OTPs / codes are still visible
  // in the terminal and the request never 500s on a mail failure.
  const devBypass =
    process.env.NODE_ENV === 'development' &&
    (process.env.EMAIL_DEV_BYPASS === 'true' || !process.env.EMAIL_PASS);

  if (devBypass) {
    const otpMatch = (options.subject || '').match(/^\d{6}/) ||
                     (options.text || '').match(/\b\d{6}\b/);
    console.log('\n📭 [DEV EMAIL — not actually sent]');
    console.log('   To:      ' + options.to);
    console.log('   Subject: ' + (options.subject || ''));
    if (otpMatch) console.log('   🔑 CODE/OTP: ' + otpMatch[0]);
    console.log('   (Set a real Gmail App Password in .env to send for real)\n');
    return { messageId: 'dev-bypass', accepted: [options.to] };
  }

  const transporter = getTransporter();
  let lastErr;
  for (let i = 1; i <= retries + 1; i++) {
    try {
      const info = await transporter.sendMail({
        from: `"${process.env.EMAIL_FROM_NAME || 'Rentify PK'}" <${process.env.EMAIL_USER}>`,
        ...options,
      });
      console.log(`\uD83D\uDCE7 Email sent [${(options.subject || '').slice(0, 40)}] \u2192 ${options.to} (${info.messageId})`);
      return info;
    } catch (err) {
      lastErr = err;
      if (i <= retries) {
        console.warn(`\uD83D\uDCE7 Retry ${i}/${retries}: ${err.message}`);
        await new Promise(r => setTimeout(r, 1000 * i));
      }
    }
  }

  // ── In development, never hard-fail on email — fall back to console ─────────
  if (process.env.NODE_ENV === 'development') {
    const otpMatch = (options.subject || '').match(/^\d{6}/) ||
                     (options.text || '').match(/\b\d{6}\b/);
    console.log('\n📭 [DEV EMAIL FALLBACK — Gmail failed, logged instead]');
    console.log('   To:      ' + options.to);
    console.log('   Subject: ' + (options.subject || ''));
    if (otpMatch) console.log('   🔑 CODE/OTP: ' + otpMatch[0]);
    console.log('   Gmail error: ' + (lastErr && lastErr.message) + '\n');
    return { messageId: 'dev-fallback', accepted: [options.to] };
  }

  throw lastErr;
};

// ══════════════════════════════════════════════════════════════════════
// EMAIL TEMPLATES
// ══════════════════════════════════════════════════════════════════════

const sendVerificationEmail = async ({ to, name, token }) => {
  // token is now a 6-digit OTP
  const isOTP = /^\d{6}$/.test(token);
  return sendMail({
    to,
    subject: isOTP
      ? `${token} \u2014 Rentify Verification Code (5 min valid)`
      : '\u2705 Rentify \u2014 Apni Email Verify Karein',
    html: wrap(buildBody([
      introBlock({
        icon: ICONS.mail, tone: 'success', eyebrowText: 'Email Verification',
        heading: 'Assalam-o-Alaikum,', headingAccent: `${esc(name)}!`,
        lead: `Rentify PK mein khush amdeed! Apna account activate karne ke liye neeche diya gaya <strong>6-digit verification code</strong> enter karein:`,
      }),
      otpDigitsBlock({ label: 'Aapka Verification Code', code: token, validityText: `Sirf <strong>5 minutes</strong> ke liye valid hai.` }),
      box('warn', `<strong>Yeh code sirf aapke liye hai!</strong><br>Kisi ke saath share mat karein.`),
      box('warn', `Email nahi mili? <strong>Spam / Junk</strong> folder bhi check karein.`),
      fineprint('Agar aapne register nahi kiya to is email ko ignore karein.'),
      trustStrip(),
      signoffBlock(),
    ])),
    text: `Rentify — Verification Code\n\nAssalam-o-Alaikum ${name},\n\nYour verification code: ${token}\n\nValid for 5 minutes only.\n\n© Rentify PK`,
  });
};

const sendOTPEmail = async ({ to, name, otp }) => {
  return sendMail({
    to,
    subject: `${otp} \u2014 Rentify Password Reset Code (10 min valid)`,
    html: wrap(buildBody([
      introBlock({
        icon: ICONS.lock, tone: 'warn', eyebrowText: 'Password Reset',
        heading: 'Assalam-o-Alaikum,', headingAccent: `${esc(name)}!`,
        lead: `Aapne password reset request ki hai.<br>Neeche diya gaya <strong>6-digit secure code</strong> enter karein:`,
      }),
      otpDigitsBlock({ label: 'Aapka Secure Reset Code', code: otp, validityText: `Yeh code <strong>10 minutes</strong> ke liye valid hai.` }),
      box('note', `Agar aapne yeh request nahi ki, to is email ko ignore karein. Aapka account safe hai.`),
      trustStrip(),
      signoffBlock(),
    ])),
    text: `Rentify — Password Reset Code\n\nAssalam-o-Alaikum ${name},\n\nReset Code: ${otp}\n\nYeh code 10 minutes mein expire ho jayega.\nKisi ke saath share mat karein.\n\n© Rentify PK`,
  });
};

const sendWelcomeEmail = async ({ to, name, role }) => {
  const isOwner = role === 'owner';
  return sendMail({
    to,
    subject: '\uD83C\uDF89 Khush Amdeed! Rentify Account Active Ho Gaya',
    html: wrap(buildBody([
      introBlock({
        icon: ICONS.party, tone: 'success', eyebrowText: 'Khush Amdeed!',
        heading: 'Mubarak ho,', headingAccent: `${esc(name)}!`,
        lead: `Aapka <strong>Rentify PK</strong> account successfully activate ho gaya! Ab aap tamam features use kar sakte hain.`,
      }),
      detailCard([
        `&#x1F464; <strong>Account Type:</strong> ${isOwner ? '&#x1F3E0; Owner (Malik)' : '&#x1F511; Renter (Kiraya Dar)'}`,
        isOwner ? '&#x1F4CB; <strong>Kar sakte hain:</strong> Apni cheezein list karein' : '&#x1F50D; <strong>Kar sakte hain:</strong> Cheezein kiraye pe lein',
      ]),
      ctaButton(`${process.env.FRONTEND_URL}/dashboard`, '&#x1F680; Dashboard Kholo'),
      trustStrip(),
      signoffBlock(),
    ])),
    text: `Mubarak ho ${name}! Rentify account active ho gaya.\nDashboard: ${process.env.FRONTEND_URL}/dashboard\n\n© Rentify PK`,
  });
};

const sendLockEmail = async ({ to, name, lockUntil }) => {
  const t = new Date(lockUntil).toLocaleTimeString('en-PK', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
  return sendMail({
    to,
    subject: '\uD83D\uDD12 Security Alert \u2014 Account Lock Ho Gaya',
    html: wrap(buildBody([
      introBlock({
        icon: ICONS.shieldAlert, tone: 'danger', eyebrowText: 'Security Alert',
        heading: 'Attention,', headingAccent: `${esc(name)}!`,
        lead: `Aapke account pe <strong>5 baar galat password</strong> try kiya gaya. Security ke liye account temporarily lock ho gaya.`,
      }),
      detailCard([
        `&#x1F550; <strong>Lock khatam hoga:</strong> ${t}`,
        `30 minute baad automatically unlock ho jayega.`,
      ], 'alert'),
      box('warn', `<strong>Agar aap nahi the:</strong> Foran password reset karein!`),
      ctaButton(`${process.env.FRONTEND_URL}/auth/forgot-password`, '&#x1F511; Password Reset Karein', true),
      trustStrip(),
      signoffBlock(),
    ])),
    text: `Security Alert: ${name}, aapka account lock ho gaya.\nPassword reset: ${process.env.FRONTEND_URL}/auth/forgot-password\n\n© Rentify PK`,
  });
};

const sendLoginNotificationEmail = async ({ to, name, device, time, ip }) => {
  return sendMail({
    to,
    subject: '🔐 New Login to Your Rentify Account',
    html: wrap(buildBody([
      introBlock({
        icon: ICONS.shieldCheck, tone: 'success', eyebrowText: 'Login Notification',
        heading: 'Hello,', headingAccent: `${esc(name)}!`,
        lead: `A new login was detected on your <strong>Rentify</strong> account. Here are the details:`,
      }),
      detailCard([
        `&#x1F4C5; <strong>Date &amp; Time:</strong> ${esc(time)}`,
        `&#x1F4BB; <strong>Device:</strong> ${esc(device.device)} &mdash; ${esc(device.browser)} on ${esc(device.os)}`,
        `&#x1F310; <strong>IP Address:</strong> ${esc(ip)}`,
      ]),
      box('warn', `<strong>Was this you?</strong><br>If you did not log in, please reset your password immediately.`),
      ctaButton(`${process.env.FRONTEND_URL}/auth/forgot-password`, '&#x1F511; Reset Password Now', true),
      fineprint('If this was you, no action is needed. This is an automated security notification.'),
      trustStrip(),
      signoffBlock(),
    ])),
    text: `Hello ${name},

A new login was detected on your Rentify account.

Time: ${time}
Device: ${device.device} - ${device.browser} on ${device.os}
IP: ${ip}

If this was not you, reset your password immediately:
${process.env.FRONTEND_URL}/auth/forgot-password

© Rentify PK`,
  });
};


// ══════════════════════════════════════════════════════════════════════
// BOOKING LIFECYCLE EMAILS
// ══════════════════════════════════════════════════════════════════════

// 1. New booking request → email to OWNER
const sendBookingRequestedEmail = async ({ to, ownerName, renterName, listingTitle, startDate, endDate, totalAmount, bookingId }) => {
  const frontend = process.env.FRONTEND_URL || '';
  return sendMail({
    to,
    subject: `\uD83D\uDCCB New Booking Request for "${listingTitle}"`,
    html: wrap(buildBody([
      introBlock({
        icon: ICONS.calendarCheck, tone: 'warn', eyebrowText: 'New Booking Request',
        heading: 'Assalam-o-Alaikum,', headingAccent: `${esc(ownerName)}!`,
        lead: `<strong>${esc(renterName)}</strong> aapki listing kiraye pe lena chahte hain. Neeche details hain &mdash; jaldi respond karein taake booking confirm ho sake.`,
      }),
      detailCard([
        `&#x1F4E6; <strong>Item:</strong> ${esc(listingTitle)}`,
        `&#x1F464; <strong>Renter:</strong> ${esc(renterName)}`,
        `&#x1F4C5; <strong>Dates:</strong> ${fmtDate(startDate)} &mdash; ${fmtDate(endDate)}`,
        `&#x1F4B0; <strong>Total:</strong> PKR ${pkr(totalAmount)}`,
      ]),
      ctaButton(`${frontend}/bookings/${bookingId}`, '&#x1F50D; Review Request'),
      fineprint('Owner ko 24 ghante mein respond karna chahiye, warna request expire ho sakti hai.'),
      trustStrip(),
      signoffBlock(),
    ])),
    text: `New Booking Request\n\nAssalam-o-Alaikum ${ownerName},\n\n${renterName} wants to rent "${listingTitle}".\nDates: ${fmtDate(startDate)} - ${fmtDate(endDate)}\nTotal: PKR ${pkr(totalAmount)}\n\nReview: ${frontend}/bookings/${bookingId}\n\n© Rentify PK`,
  });
};

// 2. Booking confirmed → email to RENTER
const sendBookingConfirmedEmail = async ({ to, renterName, listingTitle, startDate, endDate, totalAmount, bookingId }) => {
  const frontend = process.env.FRONTEND_URL || '';
  return sendMail({
    to,
    subject: `\u2705 Booking Confirmed: "${listingTitle}"`,
    html: wrap(buildBody([
      introBlock({
        icon: ICONS.calendarCheck, tone: 'success', eyebrowText: 'Booking Confirmed!',
        heading: 'Mubarak ho,', headingAccent: `${esc(renterName)}!`,
        lead: `Aapki booking <strong>confirm</strong> ho gayi hai. Owner ne aapki request accept kar li. Niche apni booking ki details dekhein:`,
      }),
      detailCard([
        `&#x1F4E6; <strong>Item:</strong> ${esc(listingTitle)}`,
        `&#x1F4C5; <strong>Dates:</strong> ${fmtDate(startDate)} &mdash; ${fmtDate(endDate)}`,
        `&#x1F4B0; <strong>Total:</strong> PKR ${pkr(totalAmount)}`,
      ]),
      ctaButton(`${frontend}/bookings/${bookingId}`, '&#x1F4C4; View Booking'),
      trustStrip(),
      signoffBlock(),
    ])),
    text: `Booking Confirmed!\n\nMubarak ho ${renterName},\n\nYour booking for "${listingTitle}" is confirmed.\nDates: ${fmtDate(startDate)} - ${fmtDate(endDate)}\nTotal: PKR ${pkr(totalAmount)}\n\nView: ${frontend}/bookings/${bookingId}\n\n© Rentify PK`,
  });
};

// 3. Booking cancelled → email to a party (renter OR owner)
const sendBookingCancelledEmail = async ({ to, name, listingTitle, startDate, endDate, cancelledBy }) => {
  const who = cancelledBy === 'owner' ? 'owner' : cancelledBy === 'renter' ? 'renter' : 'system';
  return sendMail({
    to,
    subject: `\u274C Booking Cancelled: "${listingTitle}"`,
    html: wrap(buildBody([
      introBlock({
        icon: ICONS.calendarX, tone: 'danger', eyebrowText: 'Booking Cancelled',
        heading: 'Assalam-o-Alaikum,', headingAccent: `${esc(name)}`,
        lead: `Afsos, "<strong>${esc(listingTitle)}</strong>" ke liye aapki booking cancel kar di gayi hai (by ${esc(who)}).`,
      }),
      detailCard([
        `&#x1F4E6; <strong>Item:</strong> ${esc(listingTitle)}`,
        `&#x1F4C5; <strong>Dates:</strong> ${fmtDate(startDate)} &mdash; ${fmtDate(endDate)}`,
      ], 'alert'),
      box('info', `Agar koi payment hui thi, refund policy ke mutabiq process hogi. Sawaal ho to support se rabta karein.`),
      trustStrip(),
      signoffBlock(),
    ])),
    text: `Booking Cancelled\n\nAssalam-o-Alaikum ${name},\n\nYour booking for "${listingTitle}" was cancelled by ${who}.\nDates: ${fmtDate(startDate)} - ${fmtDate(endDate)}\n\n© Rentify PK`,
  });
};

// 4. Booking completed → email to RENTER + review request
const sendBookingCompletedEmail = async ({ to, renterName, listingTitle, bookingId }) => {
  const frontend = process.env.FRONTEND_URL || '';
  return sendMail({
    to,
    subject: `\uD83C\uDF89 Booking Complete \u2014 Review "${listingTitle}"`,
    html: wrap(buildBody([
      introBlock({
        icon: ICONS.party, tone: 'success', eyebrowText: 'Booking Completed',
        heading: 'Shukriya,', headingAccent: `${esc(renterName)}!`,
        lead: `"<strong>${esc(listingTitle)}</strong>" ki rental complete ho gayi hai. Umeed hai sab acha raha! Apna experience share karein &mdash; aapka review doosron ki madad karta hai.`,
      }),
      ctaButton(`${frontend}/bookings/${bookingId}/review`, '&#x2B50; Write a Review'),
      fineprint('Review dene mein sirf ek minute lagega.'),
      trustStrip(),
      signoffBlock(),
    ])),
    text: `Booking Complete!\n\nShukriya ${renterName},\n\n"${listingTitle}" rental complete ho gayi.\nWrite a review: ${frontend}/bookings/${bookingId}/review\n\n© Rentify PK`,
  });
};

// 5. Booking reminder → email to RENTER (24h before start)
const sendBookingReminderEmail = async ({ to, renterName, listingTitle, startDate, bookingId }) => {
  const frontend = process.env.FRONTEND_URL || '';
  return sendMail({
    to,
    subject: `\u23F0 Reminder: "${listingTitle}" starts tomorrow`,
    html: wrap(buildBody([
      introBlock({
        icon: ICONS.bell, tone: 'warn', eyebrowText: 'Upcoming Rental',
        heading: 'Yaad dahani,', headingAccent: `${esc(renterName)}!`,
        lead: `Aapki rental "<strong>${esc(listingTitle)}</strong>" <strong>kal</strong> (${fmtDate(startDate)}) se shuru ho rahi hai. Tayyar rahein!`,
      }),
      detailCard([
        `&#x1F4E6; <strong>Item:</strong> ${esc(listingTitle)}`,
        `&#x1F4C5; <strong>Start:</strong> ${fmtDate(startDate)}`,
      ]),
      ctaButton(`${frontend}/bookings/${bookingId}`, '&#x1F4C4; View Booking Details'),
      trustStrip(),
      signoffBlock(),
    ])),
    text: `Reminder: Upcoming Rental\n\n${renterName}, your rental "${listingTitle}" starts ${fmtDate(startDate)}.\n\nDetails: ${frontend}/bookings/${bookingId}\n\n© Rentify PK`,
  });
};

// ══════════════════════════════════════════════════════════════════════
// PAYMENT EMAILS
// ══════════════════════════════════════════════════════════════════════

// 6. Payment received → email to OWNER
const sendPaymentReceivedEmail = async ({ to, ownerName, amount, listingTitle, bookingId }) => {
  const frontend = process.env.FRONTEND_URL || '';
  return sendMail({
    to,
    subject: `\uD83D\uDCB0 You received PKR ${pkr(amount)}`,
    html: wrap(buildBody([
      introBlock({
        icon: ICONS.wallet, tone: 'success', eyebrowText: 'Payment Received',
        heading: 'Mubarak ho,', headingAccent: `${esc(ownerName)}!`,
        lead: `Aapko ek rental se payment mili hai. Raqam aapke wallet mein add kar di gayi hai.`,
      }),
      otpAmountBlock({ label: 'Amount Received', amount }),
      listingTitle ? detailCard([`&#x1F4E6; <strong>Listing:</strong> ${esc(listingTitle)}`]) : '',
      ctaButton(`${frontend}/wallet`, '&#x1F4B3; View Wallet'),
      trustStrip(),
      signoffBlock(),
    ])),
    text: `Payment Received\n\nMubarak ho ${ownerName},\n\nYou received PKR ${pkr(amount)}${listingTitle ? ` for "${listingTitle}"` : ''}.\nIt has been added to your wallet.\n\nWallet: ${frontend}/wallet\n\n© Rentify PK`,
  });
};

// 7. Withdrawal processed → email to OWNER
const sendWithdrawalProcessedEmail = async ({ to, ownerName, amount, method }) => {
  const frontend = process.env.FRONTEND_URL || '';
  return sendMail({
    to,
    subject: `\uD83D\uDCB8 Withdrawal of PKR ${pkr(amount)} Initiated`,
    html: wrap(buildBody([
      introBlock({
        icon: ICONS.cashOut, tone: 'warn', eyebrowText: 'Withdrawal Initiated',
        heading: 'Assalam-o-Alaikum,', headingAccent: `${esc(ownerName)}!`,
        lead: `Aapki withdrawal request process ho rahi hai. Raqam 1&ndash;3 business days mein aapke account mein aa jayegi.`,
      }),
      otpAmountBlock({ label: 'Withdrawal Amount', amount, note: method ? `via ${esc(method)}` : '' }),
      ctaButton(`${frontend}/wallet`, '&#x1F4B3; View Wallet'),
      fineprint('Agar aapne yeh request nahi ki to foran support se rabta karein.'),
      trustStrip(),
      signoffBlock(),
    ])),
    text: `Withdrawal Initiated\n\n${ownerName}, your withdrawal of PKR ${pkr(amount)}${method ? ` via ${method}` : ''} is being processed (1-3 business days).\n\nWallet: ${frontend}/wallet\n\n© Rentify PK`,
  });
};

// ══════════════════════════════════════════════════════════════════════
// REVIEW EMAIL
// ══════════════════════════════════════════════════════════════════════

// 8. New review received → email to OWNER
const sendReviewReceivedEmail = async ({ to, ownerName, reviewerName, rating, comment, listingTitle, listingId }) => {
  const frontend = process.env.FRONTEND_URL || '';
  const stars = '\u2B50'.repeat(Math.max(1, Math.min(5, Number(rating) || 0)));
  return sendMail({
    to,
    subject: `\u2B50 New ${rating}-star review on "${listingTitle}"`,
    html: wrap(buildBody([
      introBlock({
        icon: ICONS.star, tone: 'success', eyebrowText: 'New Review',
        heading: 'Assalam-o-Alaikum,', headingAccent: `${esc(ownerName)}!`,
        lead: `<strong>${esc(reviewerName)}</strong> ne aapki listing "<strong>${esc(listingTitle)}</strong>" pe review chhoda hai:`,
      }),
      `<div class="detail-card"><div class="stars">${stars}</div>${comment ? `&#x1F4AC; "${esc(comment)}"` : '<em>No comment left.</em>'}</div>`,
      ctaButton(`${frontend}/listings/${listingId}`, '&#x1F441;&#xFE0F; View on Listing'),
      trustStrip(),
      signoffBlock(),
    ])),
    text: `New Review\n\n${ownerName}, ${reviewerName} left a ${rating}-star review on "${listingTitle}".\n${comment ? `"${comment}"\n` : ''}\nView: ${frontend}/listings/${listingId}\n\n© Rentify PK`,
  });
};

// ══════════════════════════════════════════════════════════════════════
// ACCOUNT EMAILS
// ══════════════════════════════════════════════════════════════════════

// 9. Account suspended → email to USER (with appeal instructions)
const sendAccountSuspendedEmail = async ({ to, name, reason }) => {
  const frontend = process.env.FRONTEND_URL || '';
  return sendMail({
    to,
    subject: `\uD83D\uDEAB Your Rentify Account Has Been Suspended`,
    html: wrap(buildBody([
      introBlock({
        icon: ICONS.ban, tone: 'danger', eyebrowText: 'Account Suspended',
        heading: 'Assalam-o-Alaikum,', headingAccent: `${esc(name)}`,
        lead: `Aapka Rentify account temporarily <strong>suspend</strong> kar diya gaya hai.`,
      }),
      detailCard([`&#x1F4DD; <strong>Reason:</strong> ${esc(reason || 'Violation of our terms of service')}`], 'alert'),
      box('info', `&#x2696;&#xFE0F; <strong>Appeal kaise karein:</strong><br>Agar aapko lagta hai yeh ghalti se hua hai, to support team ko email karein apne account details ke saath. Hum review karke jaldi jawab denge.`),
      ctaButton(`${frontend}/support`, '&#x1F4E7; Contact Support / Appeal', true),
      trustStrip(),
      signoffBlock(),
    ])),
    text: `Account Suspended\n\nAssalam-o-Alaikum ${name},\n\nYour Rentify account has been suspended.\nReason: ${reason || 'Violation of our terms of service'}\n\nTo appeal, contact support: ${frontend}/support\n\n© Rentify PK`,
  });
};

// 10. Password changed → security alert to USER
const sendPasswordChangedEmail = async ({ to, name }) => {
  const frontend = process.env.FRONTEND_URL || '';
  const time = new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' });
  return sendMail({
    to,
    subject: `\uD83D\uDD12 Your Rentify Password Was Changed`,
    html: wrap(buildBody([
      introBlock({
        icon: ICONS.lock, tone: 'warn', eyebrowText: 'Security Alert',
        heading: 'Assalam-o-Alaikum,', headingAccent: `${esc(name)}`,
        lead: `Aapke Rentify account ka password abhi <strong>change</strong> kiya gaya hai.`,
      }),
      detailCard([`&#x1F550; <strong>Time:</strong> ${esc(time)}`]),
      box('warn', `<strong>Agar yeh aapne nahi kiya:</strong> foran apna account secure karein aur password reset karein.`),
      ctaButton(`${frontend}/auth/forgot-password`, '&#x1F511; Reset Password', true),
      trustStrip(),
      signoffBlock(),
    ])),
    text: `Security Alert: Password Changed\n\nAssalam-o-Alaikum ${name},\n\nYour Rentify password was changed at ${time}.\nIf this wasn't you, reset immediately: ${frontend}/auth/forgot-password\n\n© Rentify PK`,
  });
};


// ══════════════════════════════════════════════════════════════════════
// CNIC VERIFICATION EMAILS
// ══════════════════════════════════════════════════════════════════════

// CNIC approved → email to USER
const sendCnicVerifiedEmail = async ({ to, name }) => {
  const frontend = process.env.FRONTEND_URL || '';
  return sendMail({
    to,
    subject: `\u2705 Your CNIC is Verified \u2014 Rentify`,
    html: wrap(buildBody([
      introBlock({
        icon: ICONS.idCard, tone: 'success', eyebrowText: 'Identity Verified',
        heading: 'Mubarak ho,', headingAccent: `${esc(name)}!`,
        lead: `Aapka CNIC verify ho gaya hai. Ab aap Rentify pe owner features istemal kar sakte hain aur renters ke saath bharosa banega.`,
      }),
      ctaButton(`${frontend}/dashboard`, '&#x1F3E0; Go to Dashboard'),
      trustStrip(),
      signoffBlock(),
    ])),
    text: `Identity Verified!\n\nMubarak ho ${name}, aapka CNIC verify ho gaya hai.\nDashboard: ${frontend}/dashboard\n\n© Rentify PK`,
  });
};

// CNIC rejected → email to USER (with reason + resubmit)
const sendCnicRejectedEmail = async ({ to, name, reason }) => {
  const frontend = process.env.FRONTEND_URL || '';
  return sendMail({
    to,
    subject: `\u274C CNIC Verification Rejected \u2014 Rentify`,
    html: wrap(buildBody([
      introBlock({
        icon: ICONS.idCardX, tone: 'danger', eyebrowText: 'Verification Rejected',
        heading: 'Assalam-o-Alaikum,', headingAccent: `${esc(name)}`,
        lead: `Afsos, aapka CNIC verification reject kar diya gaya hai. Niche wajah di gayi hai &mdash; theek karke dobara submit karein.`,
      }),
      detailCard([`&#x1F4DD; <strong>Reason:</strong> ${esc(reason || 'Documents could not be verified')}`], 'alert'),
      ctaButton(`${frontend}/verify-cnic`, '&#x1F504; Re-submit CNIC'),
      trustStrip(),
      signoffBlock(),
    ])),
    text: `CNIC Verification Rejected\n\nAssalam-o-Alaikum ${name},\n\nReason: ${reason || 'Documents could not be verified'}\n\nRe-submit: ${frontend}/verify-cnic\n\n© Rentify PK`,
  });
};

// ── Support Ticket: created (confirmation to user) ────────────────────────────
const sendSupportTicketCreatedEmail = async ({ to, name, ticketNumber, subject }) => {
  const frontend = process.env.FRONTEND_URL || '';
  return sendMail({
    to,
    subject: `\u{1F3AB} Support Ticket ${ticketNumber} Received \u2014 Rentify`,
    html: wrap(buildBody([
      introBlock({
        icon: ICONS.ticket, tone: 'warn', eyebrowText: 'Support Ticket Created',
        heading: 'Assalam-o-Alaikum,', headingAccent: `${esc(name)}!`,
        lead: `Aapki support request mil gayi hai. Hamari team jald hi review karke aapko jawab degi. Niche aapke ticket ki details hain:`,
      }),
      detailCard([
        `&#x1F516; <strong>Ticket Number:</strong> ${esc(ticketNumber)}`,
        `&#x1F4DD; <strong>Subject:</strong> ${esc(subject)}`,
        `&#x23F3; <strong>Status:</strong> Open`,
      ]),
      ctaButton(`${frontend}/my-tickets`, '&#x1F4AC; View My Tickets'),
      fineprint('Is email ka jawab dene ki zaroorat nahi. Ticket par koi update aane par aap ko notify kar diya jayega. Shukriya!'),
      trustStrip(),
      signoffBlock(),
    ])),
    text: `Support Ticket Received\n\nAssalam-o-Alaikum ${name},\n\nTicket: ${ticketNumber}\nSubject: ${subject}\nStatus: Open\n\nView: ${frontend}/my-tickets\n\n© Rentify PK`,
  });
};


// ══════════════════════════════════════════════════════════════════════
// RIDER DELIVERY EMAILS
// ══════════════════════════════════════════════════════════════════════

// Rider assigned → RENTER + OWNER
const sendRiderAssignedEmail = async ({ to, name, listingTitle, isOwner, trackingNumber }) => {
  const msg = isOwner
    ? `Rider aapki cheez "${listingTitle}" collect karne aa raha hai. Tayyar rahein.`
    : `Aapke "${listingTitle}" ki delivery ke liye rider assign ho gaya hai.`;

  const trackingSection = trackingNumber ? `
    <div class="detail-card" style="background:#f3f0fc;border-color:#ddd3f7">
      &#x1F4E6; <strong style="color:#5b21b6">Tracking Number:</strong><br>
      <span style="font-family:monospace;font-size:18px;font-weight:700;color:#5b21b6;letter-spacing:1px">${esc(trackingNumber)}</span><br>
      <small style="color:#6b7280">Is number se apna order track karein: ${process.env.FRONTEND_URL || 'http://localhost:4200'}/track?id=${esc(trackingNumber)}</small>
    </div>` : '';

  return sendMail({
    to,
    subject: `\uD83D\uDEB4 Rider Assign Ho Gaya — Tracking: ${trackingNumber || ''} — "${listingTitle}"`,
    html: wrap(buildBody([
      introBlock({
        icon: ICONS.truck, tone: 'warn', eyebrowText: 'Rider On The Way',
        heading: 'Assalam-o-Alaikum,', headingAccent: `${esc(name)}!`,
        lead: esc(msg),
      }),
      detailCard([
        `&#x1F4E6; <strong>Item:</strong> ${esc(listingTitle)}`,
        `&#x1F550; <strong>Status:</strong> Rider Assigned`,
      ]),
      trackingSection,
      trustStrip(),
      signoffBlock(),
    ])),
    text: `Rider Assign Ho Gaya\n\n${name}, ${msg}\nTracking Number: ${trackingNumber || 'N/A'}\n\n© Rentify PK`,
  });
};

// Item picked up → RENTER + OWNER
const sendItemPickedUpEmail = async ({ to, name, listingTitle, isOwner }) => {
  const msg = isOwner
    ? `Rider ne "${listingTitle}" successfully pick up kar liya hai.`
    : `"${listingTitle}" pick up ho gayi — rider aapki taraf delivery ke liye nikal gaya!`;
  return sendMail({
    to,
    subject: `\uD83D\uDCE6 Item Pick Up Ho Gayi \u2014 "${listingTitle}"`,
    html: wrap(buildBody([
      introBlock({
        icon: ICONS.box, tone: 'warn', eyebrowText: 'Item Picked Up',
        heading: 'Assalam-o-Alaikum,', headingAccent: `${esc(name)}!`,
        lead: esc(msg),
      }),
      detailCard([
        `&#x1F4E6; <strong>Item:</strong> ${esc(listingTitle)}`,
        `&#x1F6B4; <strong>Status:</strong> In Delivery`,
      ]),
      trustStrip(),
      signoffBlock(),
    ])),
    text: `Item Picked Up\n\n${name}, ${msg}\n\n© Rentify PK`,
  });
};

// Item delivered → RENTER + OWNER
const sendItemDeliveredEmail = async ({ to, name, listingTitle, isOwner, bookingId }) => {
  const frontend = process.env.FRONTEND_URL || '';
  const msg = isOwner
    ? `"${listingTitle}" renter tak successfully deliver ho gayi hai. Shukriya!`
    : `"${listingTitle}" aapke paas deliver ho gayi — enjoy karein!`;
  return sendMail({
    to,
    subject: `\u2705 Delivery Complete \u2014 "${listingTitle}"`,
    html: wrap(buildBody([
      introBlock({
        icon: ICONS.boxCheck, tone: 'success', eyebrowText: 'Delivery Complete!',
        heading: 'Assalam-o-Alaikum,', headingAccent: `${esc(name)}!`,
        lead: esc(msg),
      }),
      detailCard([
        `&#x1F4E6; <strong>Item:</strong> ${esc(listingTitle)}`,
        `&#x2705; <strong>Status:</strong> Delivered`,
      ]),
      ctaButton(`${frontend}/bookings/${bookingId}/review`, '&#x2B50; Review Likhein'),
      trustStrip(),
      signoffBlock(),
    ])),
    text: `Delivery Complete\n\n${name}, ${msg}\n\n© Rentify PK`,
  });
};

// ── Password reset (alias of sendOTPEmail; accepts { to, name, otp }) ─────────
// Kept as a named export so callers using either name work.
const sendPasswordResetEmail = async (opts) => sendOTPEmail(opts);

module.exports = {
  verifyEmailTransport,
  sendVerificationEmail,
  sendOTPEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendLockEmail,
  sendLoginNotificationEmail,
  // Booking lifecycle
  sendBookingRequestedEmail,
  sendBookingConfirmedEmail,
  sendBookingCancelledEmail,
  sendBookingCompletedEmail,
  sendBookingReminderEmail,
  // Payment
  sendPaymentReceivedEmail,
  sendWithdrawalProcessedEmail,
  // Review
  sendReviewReceivedEmail,
  // Account
  sendAccountSuspendedEmail,
  sendPasswordChangedEmail,
  // CNIC
  sendCnicVerifiedEmail,
  sendCnicRejectedEmail,
  // Support
  sendSupportTicketCreatedEmail,
  // Rider delivery
  sendRiderAssignedEmail,
  sendItemPickedUpEmail,
  sendItemDeliveredEmail,
  // Generic
  sendMail,
};
