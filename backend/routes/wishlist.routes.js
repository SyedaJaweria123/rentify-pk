'use strict';
const router = require('express').Router();
const { protect } = require('../middleware/auth');
const ctrl = require('../controllers/wishlist.controller');

router.use(protect);
router.get('/',              ctrl.getWishlist);
router.post('/',             ctrl.addToWishlist);
router.delete('/:listingId', ctrl.removeFromWishlist);

module.exports = router;
