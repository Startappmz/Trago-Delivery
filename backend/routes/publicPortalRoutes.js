const express = require('express');
const controller = require('../controllers/publicPortalController');

const router = express.Router();

router.get('/public/restaurants', controller.listPublicRestaurants);
router.post('/public/geo/quote', controller.createPublicRouteQuote);
router.post('/public/ratings', controller.createPublicRating);
router.post('/public/restaurants/register', controller.registerRestaurant);
router.post('/public/restaurants/login', controller.loginRestaurant);
router.post('/public/orders', controller.createPublicOrder);

router.get('/restaurant/profile', controller.getRestaurantProfile);
router.put('/restaurant/profile', controller.updateRestaurantProfile);
router.get('/restaurant/menu', controller.getRestaurantMenu);
router.post('/restaurant/menu', controller.createRestaurantMenuItem);
router.put('/restaurant/menu/:id', controller.updateRestaurantMenuItem);
router.delete('/restaurant/menu/:id', controller.deleteRestaurantMenuItem);
router.get('/restaurant/orders', controller.getRestaurantOrders);

module.exports = router;
