'use strict';
/**
 * Cart Routes — Rentify PK
 * All cart actions require a logged-in renter — a cart is always
 * scoped to req.user._id, so one user can never see or modify another
 * user's cart (enforced in every controller query, not just here).
 */
const router = require('express').Router();
const { protect } = require('../middleware/auth');
const ctrl = require('../controllers/cart.controller');

router.use(protect);

router.get('/',            ctrl.getCart);
router.post('/',            ctrl.addToCart);
router.post('/checkout',   ctrl.checkout);
router.patch('/:itemId',   ctrl.updateCartItem);
router.delete('/:itemId',  ctrl.removeFromCart);
router.delete('/',          ctrl.clearCart);

module.exports = router;
