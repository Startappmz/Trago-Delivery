const express = require('express');
const { protect, admin } = require('../middleware/authMiddleware');
const { buildRouteQuote } = require('../utils/geoPricing');

const router = express.Router();

router.post('/quote', protect, admin, async (req, res, next) => {
  try {
    const quote = await buildRouteQuote(req.body.origin, req.body.destination);
    res.status(200).json(quote);
  } catch (error) {
    res.status(400);
    next(error);
  }
});

module.exports = router;
