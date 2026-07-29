#!/usr/bin/env node
/**
 * RentAnything PK — Email Setup Tester
 *
 * Run: node test-email.js [your@email.com]
 *
 * Yeh script email configuration test karta hai aur
 * batata hai exactly kya fix karna hai agar email nahi ja rahi.
 */

require('dotenv').config();

const nodemailer = require('nodemailer');

const recipient = process.argv[2] || process.env.EMAIL_USER;

if (!recipient) {
  console.error('\nUsage: node test-email.js your@email.com\n');
  process.exit(1);
}

const banner = (msg, char = '─') =>
  `\n${char.repeat(60)}\n  ${msg}\n${char.repeat(60)}`;

async function main() {
  console.log(banner('RentAnything PK — Email Configuration Test', '═'));

  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  // ── Step 1: Check env vars ─────────────────────────────────────────────
  console.log('\n📋 STEP 1: Checking .env variables...');

  if (!user) {
    console.error('   ❌ EMAIL_USER is NOT set in .env');
    printFix();
    process.exit(1);
  }
  console.log(`   ✅ EMAIL_USER: ${user}`);

  if (!pass) {
    console.error('   ❌ EMAIL_PASS is NOT set in .env');
    printFix();
    process.exit(1);
  }

  const cleanPass = pass.replace(/\s+/g, '');
  console.log(`   ℹ️  EMAIL_PASS length (without spaces): ${cleanPass.length}`);

  if (cleanPass.includes('xxxx') || cleanPass === 'xxxxxxxxxxxxxxxx') {
    console.error('   ❌ EMAIL_PASS is still the placeholder value!');
    console.error('      You need to replace "xxxx xxxx xxxx xxxx" with a real Gmail App Password.');
    printFix();
    process.exit(1);
  }

  if (cleanPass.length < 16) {
    console.error(`   ❌ EMAIL_PASS is too short (${cleanPass.length} chars). Gmail App Passwords are 16 characters.`);
    printFix();
    process.exit(1);
  }

  console.log('   ✅ EMAIL_PASS length looks correct (16 chars)');

  // ── Step 2: Create transporter ─────────────────────────────────────────
  console.log('\n📡 STEP 2: Creating SMTP transporter...');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  // ── Step 3: Verify connection ──────────────────────────────────────────
  console.log('\n🔌 STEP 3: Verifying SMTP connection to Gmail...');
  try {
    await transporter.verify();
    console.log('   ✅ SMTP connection successful!');
  } catch (err) {
    console.error('   ❌ SMTP connection FAILED:', err.message);
    console.log('\n🔍 Diagnosing...');

    if (err.message.includes('Invalid login') || err.message.includes('Username and Password not accepted')) {
      console.log('\n   CAUSE: Gmail rejected the password.');
      console.log('   This means:');
      console.log('     a) EMAIL_PASS is wrong, OR');
      console.log('     b) 2-Step Verification is not enabled, OR');
      console.log('     c) You used your Gmail login password instead of App Password');
    } else if (err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT')) {
      console.log('\n   CAUSE: Network issue. Check your internet or firewall.');
    } else if (err.message.includes('Less secure')) {
      console.log('\n   CAUSE: "Less Secure App Access" is deprecated. Use App Password instead.');
    }

    printFix();
    process.exit(1);
  }

  // ── Step 4: Send test email ────────────────────────────────────────────
  console.log(`\n📧 STEP 4: Sending test email to ${recipient}...`);

  try {
    const info = await transporter.sendMail({
      from: `"RentAnything Test" <${user}>`,
      to: recipient,
      subject: '✅ RentAnything Email Setup — Working!',
      html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#eef2f1;border-radius:18px">
          <div style="background:#fff;border-radius:16px;padding:28px">
            <h2 style="color:#1F5435;margin:0 0 12px">&#9989; Email Setup Successful!</h2>
            <p style="color:#374151;margin:0 0 16px">
              Rentify PK ka email system sahi se kaam kar raha hai.
            </p>
            <div style="background:#eefbf1;border:1px solid #cdebd6;border-radius:12px;padding:16px;margin:0 0 16px">
              <p style="color:#1F5435;margin:0"><strong>Test Time:</strong> ${new Date().toLocaleString('en-PK')}</p>
              <p style="color:#1F5435;margin:8px 0 0"><strong>From:</strong> ${user}</p>
              <p style="color:#1F5435;margin:8px 0 0"><strong>To:</strong> ${recipient}</p>
            </div>
            <p style="color:#6b7280;font-size:13px;margin:0">
              Verification emails aur OTP codes ab properly bheje jayenge.
            </p>
          </div>
        </div>
      `,
      text: `RentAnything PK email setup successful!\nTest time: ${new Date().toISOString()}\nFrom: ${user}\nTo: ${recipient}`,
    });

    console.log(`   ✅ Test email sent! Message ID: ${info.messageId}`);
    console.log(`\n${'═'.repeat(60)}`);
    console.log('  🎉 SUCCESS! Email configuration is working correctly.');
    console.log(`  Check inbox (and spam folder) at: ${recipient}`);
    console.log(`${'═'.repeat(60)}\n`);

  } catch (err) {
    console.error('   ❌ Send failed:', err.message);
    printFix();
    process.exit(1);
  }
}

function printFix() {
  console.log(banner('HOW TO FIX — Gmail App Password Setup', '━'));
  console.log(`
  1. Go to: https://myaccount.google.com/security

  2. Under "How you sign in to Google":
     → Enable "2-Step Verification" (REQUIRED!)

  3. After enabling 2FA, go back to Security page

  4. Search for "App Passwords" or go to:
     https://myaccount.google.com/apppasswords

  5. Select app: "Mail"
     Select device: "Windows Computer" (or any)
     Click "Generate"

  6. Copy the 16-character password shown (e.g. "abcd efgh ijkl mnop")

  7. Open backend/.env and set:
     EMAIL_PASS=abcd efgh ijkl mnop
     (keep the spaces — they're fine)

  8. Save .env and restart the server:
     npm run dev

  9. Run this test again:
     node test-email.js your@email.com
  `);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
