'use strict';
/**
 * Stripe Payment Service — Rentify (international cards)
 * ─────────────────────────────────────────────────────────────────────────────
 * Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 * Note: Stripe amounts are in the smallest currency unit (paisa for PKR).
 * ─────────────────────────────────────────────────────────────────────────────
 */
const Stripe = require('stripe');

let _stripe = null;
const client = () => {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured.');
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
};

const isConfigured = () => !!process.env.STRIPE_SECRET_KEY;

// Zero-decimal currencies don't multiply by 100
const ZERO_DECIMAL = new Set(['jpy', 'krw', 'vnd', 'clp']);
const toSmallestUnit = (amount, currency) =>
  ZERO_DECIMAL.has(String(currency).toLowerCase()) ? Math.round(amount) : Math.round(amount * 100);

/**
 * Create a PaymentIntent.
 * @returns {Promise<{ id, clientSecret, status, amount }>}
 */
const createPaymentIntent = async ({ amount, currency = 'pkr', bookingId, metadata = {} }) => {
  if (!amount || Number(amount) <= 0) throw new Error('A positive amount is required.');
  const intent = await client().paymentIntents.create({
    amount: toSmallestUnit(Number(amount), currency),
    currency: String(currency).toLowerCase(),
    metadata: { bookingId: String(bookingId || ''), ...metadata },
    automatic_payment_methods: { enabled: true },
  });
  return { id: intent.id, clientSecret: intent.client_secret, status: intent.status, amount: intent.amount };
};

/**
 * Retrieve / confirm a PaymentIntent's current state.
 * @returns {Promise<{ id, status, paid, amount, bookingId }>}
 */
const confirmPayment = async (paymentIntentId) => {
  if (!paymentIntentId) throw new Error('paymentIntentId is required.');
  const intent = await client().paymentIntents.retrieve(paymentIntentId);
  return {
    id: intent.id,
    status: intent.status,
    paid: intent.status === 'succeeded',
    amount: intent.amount,
    bookingId: intent.metadata?.bookingId || null,
  };
};

/**
 * Refund a payment (full or partial).
 * @param {string} paymentIntentId
 * @param {number} [amount]  in main units (e.g. PKR); omit for full refund
 */
const createRefund = async (paymentIntentId, amount, currency = 'pkr') => {
  if (!paymentIntentId) throw new Error('paymentIntentId is required.');
  const payload = { payment_intent: paymentIntentId };
  if (amount && Number(amount) > 0) payload.amount = toSmallestUnit(Number(amount), currency);
  const refund = await client().refunds.create(payload);
  return { id: refund.id, status: refund.status, amount: refund.amount };
};

/**
 * Verify + parse a webhook payload. Throws if the signature is invalid.
 * @param {Buffer|string} payload  RAW request body (express.raw)
 * @param {string} signature       stripe-signature header
 */
const constructWebhookEvent = (payload, signature) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET not configured.');
  return client().webhooks.constructEvent(payload, signature, secret);
};

/**
 * Interpret a verified webhook event into a normalized result the controller
 * can act on (update booking, hold escrow, etc.).
 * @returns {{ type, handled, bookingId, paymentIntentId, status }}
 */
const handleWebhookEvent = (event) => {
  const out = { type: event.type, handled: true, bookingId: null, paymentIntentId: null, status: null };
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const pi = event.data.object;
      out.paymentIntentId = pi.id;
      out.bookingId = pi.metadata?.bookingId || null;
      out.status = 'succeeded';
      break;
    }
    case 'payment_intent.payment_failed': {
      const pi = event.data.object;
      out.paymentIntentId = pi.id;
      out.bookingId = pi.metadata?.bookingId || null;
      out.status = 'failed';
      break;
    }
    case 'charge.refunded': {
      const ch = event.data.object;
      out.paymentIntentId = ch.payment_intent || null;
      out.status = 'refunded';
      break;
    }
    default:
      out.handled = false;   // event we don't care about — acknowledge but ignore
  }
  return out;
};

module.exports = {
  isConfigured,
  createPaymentIntent,
  confirmPayment,
  createRefund,
  constructWebhookEvent,
  handleWebhookEvent,
};
