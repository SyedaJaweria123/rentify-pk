'use strict';
/**
 * JazzCash Payment Service — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements JazzCash's official HTTP-redirect / Mobile-Account flow.
 *
 * Secure hash rule (JazzCash spec):
 *   - Take all pp_* params that have a non-empty value
 *   - Sort their KEYS alphabetically
 *   - Join their VALUES with '&', prefixed by the Integrity Salt:
 *       salt&val1&val2&...&valN
 *   - HMAC-SHA256 with the Integrity Salt as the key → uppercase hex
 *
 * Env:
 *   JAZZCASH_MERCHANT_ID, JAZZCASH_PASSWORD, JAZZCASH_INTEGRITY_SALT,
 *   JAZZCASH_API_URL          (redirect/transaction endpoint)
 *   JAZZCASH_RETURN_URL       (where JazzCash redirects the customer back)
 *   JAZZCASH_STATUS_URL       (optional: txn status inquiry endpoint)
 * ─────────────────────────────────────────────────────────────────────────────
 */
const crypto = require('crypto');

const cfg = () => ({
  merchantId:    process.env.JAZZCASH_MERCHANT_ID,
  password:      process.env.JAZZCASH_PASSWORD,
  salt:          process.env.JAZZCASH_INTEGRITY_SALT,
  apiUrl:        process.env.JAZZCASH_API_URL
    || 'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform',
  statusUrl:     process.env.JAZZCASH_STATUS_URL
    || 'https://sandbox.jazzcash.com.pk/ApplicationAPI/API/PaymentInquiry/Inquire',
  returnUrl:     process.env.JAZZCASH_RETURN_URL || 'http://localhost:5000/api/payments/jazzcash/callback',
});

const isConfigured = () => {
  const c = cfg();
  return !!(c.merchantId && c.password && c.salt);
};

// ── Date helpers (JazzCash wants yyyyMMddHHmmss, PKT) ─────────────────────────
const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
  `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

// ── Secure hash: HMAC-SHA256 over salt + sorted non-empty pp_* values ─────────
const generateHash = (params) => {
  const { salt } = cfg();
  const sortedKeys = Object.keys(params)
    .filter(k => k.startsWith('pp_') || k.startsWith('ppmpf_'))
    .filter(k => params[k] !== undefined && params[k] !== null && String(params[k]).length > 0)
    .sort();

  const values = sortedKeys.map(k => String(params[k]));
  const message = [salt, ...values].join('&');

  return crypto.createHmac('sha256', salt).update(message).digest('hex').toUpperCase();
};

// ── Unique txn ref: JC + yyyyMMddHHmmss + 4 random digits ─────────────────────
const generateTxnRef = () => {
  const ts = fmt(new Date());
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `JC${ts}${rand}`;
};

/**
 * Build a JazzCash payment request.
 * @returns {{ txnRefNo, redirectUrl, fields }}  fields = signed form to POST/redirect
 */
const initiatePayment = ({ amount, bookingId, customerPhone, customerEmail, customerName }) => {
  if (!isConfigured()) throw new Error('JazzCash is not configured (.env keys missing).');
  if (!amount || Number(amount) <= 0) throw new Error('A positive amount is required.');

  const c = cfg();
  const now = new Date();
  const expire = new Date(now.getTime() + 60 * 60 * 1000);   // 1 hour
  const txnRefNo = generateTxnRef();

  // Amount must be in the lowest denomination (paisa) with no decimals
  const amountPaisa = String(Math.round(Number(amount) * 100));

  const params = {
    pp_Version:        '1.1',
    pp_TxnType:        'MWALLET',                 // Mobile Account
    pp_Language:       'EN',
    pp_MerchantID:     c.merchantId,
    pp_Password:       c.password,
    pp_TxnRefNo:       txnRefNo,
    pp_Amount:         amountPaisa,
    pp_TxnCurrency:    'PKR',
    pp_TxnDateTime:    fmt(now),
    pp_BillReference:  String(bookingId || 'rentify'),
    pp_Description:    `Rentify booking ${bookingId || ''}`.trim(),
    pp_TxnExpiryDateTime: fmt(expire),
    pp_ReturnURL:      c.returnUrl,
    pp_SecureHash:     '',
    // Merchant-defined pass-through fields
    ppmpf_1: String(bookingId || ''),
    ppmpf_2: String(customerPhone || ''),
    ppmpf_3: String(customerEmail || ''),
    ppmpf_4: String(customerName || ''),
    ppmpf_5: 'rentify',
  };

  params.pp_SecureHash = generateHash(params);

  return { txnRefNo, redirectUrl: c.apiUrl, fields: params };
};

/**
 * Verify a callback from JazzCash by recomputing the secure hash.
 * @returns {{ valid: boolean, success: boolean, txnRefNo, responseCode, raw }}
 */
const verifyCallback = (callbackData = {}) => {
  const received = callbackData.pp_SecureHash;
  // Recompute over everything except the hash field itself
  const toHash = { ...callbackData };
  delete toHash.pp_SecureHash;
  const expected = generateHash(toHash);

  const valid = !!received && received.toUpperCase() === expected;
  const responseCode = callbackData.pp_ResponseCode;
  const success = valid && (responseCode === '000' || responseCode === '121');  // 000 success, 121 pending-success

  return {
    valid,
    success,
    txnRefNo: callbackData.pp_TxnRefNo || null,
    responseCode: responseCode || null,
    responseMessage: callbackData.pp_ResponseMessage || null,
    raw: callbackData,
  };
};

/**
 * Inquire a transaction's status via JazzCash Payment Inquiry API.
 * @returns {Promise<{ ok, responseCode, status, raw }>}
 */
const checkTransactionStatus = async (txnRefNo) => {
  if (!isConfigured()) throw new Error('JazzCash is not configured.');
  if (!txnRefNo) throw new Error('txnRefNo is required.');
  const c = cfg();

  const params = {
    pp_TxnRefNo:   txnRefNo,
    pp_MerchantID: c.merchantId,
    pp_Password:   c.password,
  };
  params.pp_SecureHash = generateHash(params);

  const res = await fetch(c.statusUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));

  return {
    ok: res.ok,
    responseCode: data.pp_ResponseCode || null,
    status: data.pp_PaymentResponseMessage || data.pp_ResponseMessage || null,
    raw: data,
  };
};

module.exports = {
  isConfigured,
  generateHash,
  generateTxnRef,
  initiatePayment,
  verifyCallback,
  checkTransactionStatus,
};
