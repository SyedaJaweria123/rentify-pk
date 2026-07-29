'use strict';
/**
 * Easypaisa Payment Service — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements Easypaisa's official payment flow (OTC = Over The Counter, and
 * MA = Mobile Account).
 *
 * Hash rule (Easypaisa spec):
 *   - Take request params (excluding the hash field), sort KEYS alphabetically
 *   - Join as key1=val1&key2=val2&... (only non-empty values)
 *   - Append the Hash Key, then SHA-256 the whole string → uppercase hex
 *
 * Env:
 *   EASYPAISA_STORE_ID, EASYPAISA_HASH_KEY, EASYPAISA_API_URL
 *   EASYPAISA_RETURN_URL   (post-payment redirect)
 *   EASYPAISA_STATUS_URL   (optional: inquiry endpoint)
 * ─────────────────────────────────────────────────────────────────────────────
 */
const crypto = require('crypto');

const cfg = () => ({
  storeId:   process.env.EASYPAISA_STORE_ID,
  hashKey:   process.env.EASYPAISA_HASH_KEY,
  apiUrl:    process.env.EASYPAISA_API_URL
    || 'https://easypaisa.com.pk/easypay/Index.jsf',
  statusUrl: process.env.EASYPAISA_STATUS_URL
    || 'https://easypaisa.com.pk/easypay-service/rest/v4/inquire-transaction',
  returnUrl: process.env.EASYPAISA_RETURN_URL || 'http://localhost:5000/api/payments/easypaisa/callback',
});

const isConfigured = () => {
  const c = cfg();
  return !!(c.storeId && c.hashKey);
};

// ── Date helpers (Easypaisa wants ddMMyyyy HHmmss) ────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${pad(d.getDate())}${pad(d.getMonth() + 1)}${d.getFullYear()}`;
const fmtTime = (d) => `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

// ── Unique order id: EP + yyyyMMddHHmmss + 4 random ───────────────────────────
const generateOrderId = () => {
  const d = new Date();
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `EP${ts}${rand}`;
};

/**
 * SHA-256 hash over sorted non-empty params + hash key.
 * @param {object} params
 * @returns {string} uppercase hex
 */
const generateHash = (params) => {
  const { hashKey } = cfg();
  const sortedKeys = Object.keys(params)
    .filter(k => params[k] !== undefined && params[k] !== null && String(params[k]).length > 0)
    .filter(k => k.toLowerCase() !== 'merchanthashedreq' && k.toLowerCase() !== 'hash')
    .sort();

  const query = sortedKeys.map(k => `${k}=${params[k]}`).join('&');
  const message = `${query}&${hashKey}`;

  return crypto.createHash('sha256').update(message).digest('hex').toUpperCase();
};

/**
 * Build an Easypaisa payment request.
 * @param {{amount, bookingId, customerPhone, orderId?, paymentMethod?}} args
 *        paymentMethod: 'MA' (Mobile Account, default) | 'OTC' (Over The Counter)
 * @returns {{ orderId, paymentMethod, paymentUrl, fields }}
 */
const initiatePayment = ({ amount, bookingId, customerPhone, orderId, paymentMethod = 'MA' }) => {
  if (!isConfigured()) throw new Error('Easypaisa is not configured (.env keys missing).');
  if (!amount || Number(amount) <= 0) throw new Error('A positive amount is required.');
  if (!['MA', 'OTC'].includes(paymentMethod)) throw new Error("paymentMethod must be 'MA' or 'OTC'.");

  const c = cfg();
  const now = new Date();
  // OTC tokens stay payable for 24h; MA expires sooner (1h)
  const expiry = new Date(now.getTime() + (paymentMethod === 'OTC' ? 24 : 1) * 60 * 60 * 1000);
  const finalOrderId = orderId || generateOrderId();

  const params = {
    storeId:               c.storeId,
    amount:                Number(amount).toFixed(1),      // Easypaisa wants 1 decimal (e.g. 500.0)
    postBackURL:           c.returnUrl,
    orderRefNum:           finalOrderId,
    expiryDate:            `${fmtDate(expiry)} ${fmtTime(expiry)}`,
    merchantPaymentMethod: paymentMethod,                  // MA | OTC
    mobileNum:             String(customerPhone || ''),
    emailAddr:             '',
    paymentMethod:         paymentMethod === 'OTC' ? 'OTC_PAYMENT_METHOD' : 'MA_PAYMENT_METHOD',
    bookingRef:            String(bookingId || ''),
  };

  params.merchantHashedReq = generateHash(params);

  return {
    orderId: finalOrderId,
    paymentMethod,
    paymentUrl: c.apiUrl,
    fields: params,
  };
};

/**
 * Inquire a transaction's status via Easypaisa inquiry API.
 * @returns {Promise<{ ok, status, responseCode, raw }>}
 */
const verifyPayment = async (transactionId, orderId) => {
  if (!isConfigured()) throw new Error('Easypaisa is not configured.');
  if (!orderId) throw new Error('orderId is required.');
  const c = cfg();

  const params = {
    storeId:     c.storeId,
    orderId:     orderId,
    accountNum:  transactionId || '',
  };
  params.merchantHashedReq = generateHash(params);

  const res = await fetch(c.statusUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));

  // Easypaisa returns responseCode '0000' on success
  const responseCode = data.responseCode || data.transactionStatus || null;
  return {
    ok: res.ok,
    success: responseCode === '0000' || data.transactionStatus === 'PAID',
    status: data.transactionStatus || data.responseDesc || null,
    responseCode,
    raw: data,
  };
};

/**
 * Verify a callback's hash and report the payment outcome.
 * @returns {{ valid, success, orderId, transactionId, responseCode, raw }}
 */
const handleCallback = (data = {}) => {
  const received = data.merchantHashedReq || data.hash;
  const toHash = { ...data };
  delete toHash.merchantHashedReq;
  delete toHash.hash;
  const expected = generateHash(toHash);

  const valid = !!received && received.toUpperCase() === expected;
  const responseCode = data.responseCode || data.status || null;
  const success = valid && (responseCode === '0000' || data.status === 'PAID');

  return {
    valid,
    success,
    orderId: data.orderRefNum || data.orderId || null,
    transactionId: data.transactionId || data.transactionRefNumber || null,
    responseCode,
    raw: data,
  };
};

module.exports = {
  isConfigured,
  generateHash,
  generateOrderId,
  initiatePayment,
  verifyPayment,
  handleCallback,
};
