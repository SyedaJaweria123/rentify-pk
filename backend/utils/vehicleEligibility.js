'use strict';
/**
 * Vehicle Eligibility — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * A bike literally cannot carry a furniture set. Since listings don't carry
 * a size/weight field, category is the best available signal for which
 * delivery vehicles are physically plausible for an item — so the renter is
 * never shown (or allowed to pick) an option that couldn't actually work.
 *
 * This is intentionally conservative: when a category is genuinely mixed
 * (e.g. "Electronics" spans a phone charger and a washing machine), all
 * three vehicles stay available rather than guessing wrong and blocking a
 * valid delivery.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const ALL_VEHICLES = ['bike', 'car', 'van'];

// Categories where only a van is physically realistic — large, bulky, or
// the item is itself a vehicle that needs proper transport.
const VAN_ONLY = ['Furniture', 'Vehicles'];

// Categories that are typically too large/heavy for a bike, but a car can
// usually still manage them.
const CAR_AND_VAN = ['Home Appliances', 'Party & Events', 'Musical Instruments'];

/**
 * Get the delivery vehicles physically plausible for a listing's category.
 * @param {string} category
 * @returns {('bike'|'car'|'van')[]}
 */
function getAllowedVehicles(category) {
  if (VAN_ONLY.includes(category)) return ['van'];
  if (CAR_AND_VAN.includes(category)) return ['car', 'van'];
  return ALL_VEHICLES; // default: everything else is small/mixed enough to allow all three
}

/** Pick a sensible default vehicle for a category — the smallest allowed one. */
function getDefaultVehicle(category) {
  return getAllowedVehicles(category)[0];
}

module.exports = { ALL_VEHICLES, VAN_ONLY, CAR_AND_VAN, getAllowedVehicles, getDefaultVehicle };
