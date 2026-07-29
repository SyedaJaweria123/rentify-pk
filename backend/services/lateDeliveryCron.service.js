'use strict';
/**
 * Late Delivery / No-Show Auto-Refund Cron — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs every 15 minutes. Finds confirmed bookings whose deliveryDeadline has
 * passed with no rider having actually delivered yet, refunds the renter's
 * advance to their wallet, cancels the booking, and records a strike against
 * the owner so future trust-score recalculations factor it in.
 *
 * ELIGIBLE BOOKINGS (all must be true):
 *   1. deliveryMethod is 'delivery' (pickup bookings have no deadline)
 *   2. deliveryDeadline has passed
 *   3. status is still 'confirmed' (rider never marked delivered —
 *      'in_delivery'/'delivered'/'active'/'completed' all mean it DID happen)
 *   4. paymentStatus is 'paid' or 'partial_paid' (something was actually
 *      charged — nothing to refund on an unpaid booking)
 *   5. lateDeliveryStrike is not already true (idempotent — never double-fire)
 *
 * SETUP:
 *   In server.js add:  require('./services/lateDeliveryCron.service');
 * ─────────────────────────────────────────────────────────────────────────────
 */

const cron = require('node-cron');

const { Booking } = require('../models/Booking');
const Escrow = require('../models/Escrow');
const { Transaction } = require('../models/Transaction');
const { Notification } = require('../models/Notification');
const { emitToUser } = require('../utils/socket');

const DRY_RUN = process.env.LATE_DELIVERY_CRON_DRY_RUN === 'true';

const runLateDeliveryCheck = async () => {
  const label = DRY_RUN ? '[LateDeliveryCron DRY-RUN]' : '[LateDeliveryCron]';
  console.log(`${label} Starting check — ${new Date().toISOString()}`);

  try {
    const overdue = await Booking.find({
      deliveryMethod: 'delivery',
      deliveryDeadline: { $lte: new Date(), $ne: null },
      status: 'confirmed',
      paymentStatus: { $in: ['paid', 'partial_paid'] },
      lateDeliveryStrike: { $ne: true },
    }).populate('renter', 'name').populate('owner', 'name');

    if (overdue.length === 0) {
      console.log(`${label} No overdue deliveries found.`);
      return { refunded: 0, errors: 0 };
    }

    console.log(`${label} Found ${overdue.length} overdue booking(s).`);

    let refunded = 0, errors = 0;

    for (const booking of overdue) {
      const bId = String(booking._id);

      try {
        const advanceAmount = Number(booking.advanceAmount) || 0;

        if (DRY_RUN) {
          console.log(`${label} [${bId}] DRY RUN — would refund Rs ${advanceAmount} and strike owner ${booking.owner?._id}.`);
          refunded++;
          continue;
        }

        // Refund the renter's advance to their wallet.
        if (advanceAmount > 0) {
          await Transaction.credit(
            booking.renter._id,
            advanceAmount,
            'refund',
            `Auto-refund — delivery deadline missed for booking #${bId}`,
            { booking: bId }
          );
        }

        // Release any escrow hold tied to this booking back to 'refunded'
        // rather than letting it sit as 'holding' forever.
        try {
          const escrow = await Escrow.findOne({ booking: bId });
          if (escrow && escrow.status === 'holding') {
            escrow.status = 'refunded';
            escrow.refundedAt = new Date();
            await escrow.save();
          }
        } catch (e) {
          console.error(`${label} [${bId}] escrow cleanup failed:`, e.message);
        }

        booking.status = 'cancelled';
        booking.paymentStatus = 'refunded';
        booking.lateDeliveryStrike = true;
        booking.cancellation = {
          cancelledBy: booking.owner._id,
          cancelledAt: new Date(),
          reason: 'Delivery deadline missed — auto-cancelled and refunded.',
          refundAmount: advanceAmount,
        };
        await booking.save();

        emitToUser(String(booking.renter._id), 'booking:auto_refunded', { bookingId: bId, amount: advanceAmount });
        Notification.notify(booking.renter._id, 'system', 'Booking refunded',
          `The owner missed the delivery window. Rs ${advanceAmount} was refunded to your wallet.`,
          { bookingId: bId }).catch(() => {});
        Notification.notify(booking.owner._id, 'system', 'Booking auto-cancelled',
          'You missed the delivery deadline — the booking was cancelled and the renter refunded. This affects your trust score.',
          { bookingId: bId }).catch(() => {});

        console.log(`${label} [${bId}] ✅ Refunded Rs ${advanceAmount}, cancelled, owner struck.`);
        refunded++;

      } catch (err) {
        console.error(`${label} [${bId}] ❌ Error: ${err.message}`);
        errors++;
      }
    }

    console.log(`${label} Done — refunded: ${refunded}, errors: ${errors}`);
    return { refunded, errors };

  } catch (err) {
    console.error(`${label} Fatal error: ${err.message}`);
    return { refunded: 0, errors: 1 };
  }
};

// ── Schedule: every 15 minutes (delivery deadlines are hours, not days, so
//    this needs to be checked more often than the hourly escrow/rider crons) ──
const CRON_SCHEDULE = process.env.LATE_DELIVERY_CRON_SCHEDULE || '*/15 * * * *';

let cronJob = null;

const startCron = () => {
  if (cronJob) return;

  if (!cron.validate(CRON_SCHEDULE)) {
    console.error(`[LateDeliveryCron] Invalid schedule "${CRON_SCHEDULE}" — cron NOT started.`);
    return;
  }

  cronJob = cron.schedule(CRON_SCHEDULE, runLateDeliveryCheck, {
    scheduled: true,
    timezone:  process.env.TZ || 'Asia/Karachi',
  });

  console.log(`[LateDeliveryCron] ✅ Scheduled — "${CRON_SCHEDULE}" (PKT) | dry-run: ${DRY_RUN}`);
};

const stopCron = () => {
  if (cronJob) { cronJob.stop(); cronJob = null; }
};

startCron();

module.exports = { runLateDeliveryCheck, startCron, stopCron };
