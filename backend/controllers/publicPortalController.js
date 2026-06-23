const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant');
const RestaurantMenuItem = require('../models/RestaurantMenuItem');
const { PAYMENT_METHODS, PAYMENT_STATUS, ORDER_STATUS, ADMIN_ROOM } = require('../utils/constants');
const { buildRouteQuote } = require('../utils/geoPricing');
const { createAdminNotification, shortOrderCode } = require('../utils/notifications');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

const generateVerificationCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 5; i += 1) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
};

const normalizeCoordinates = (lat, lng) => {
  if (lat === undefined || lng === undefined || lat === null || lng === null || lat === '' || lng === '') return null;
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return null;
  return { lat: parsedLat, lng: parsedLng };
};

const clean = (value) => (typeof value === 'string' ? value.trim() : value);
const toNumber = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const lowerEmail = (value) => String(value || '').trim().toLowerCase();

const paymentMethodLabel = (method) => ({
  [PAYMENT_METHODS.CASH]: 'Dinheiro',
  [PAYMENT_METHODS.MPESA]: 'M-Pesa',
  [PAYMENT_METHODS.EMOLA]: 'e-Mola',
  [PAYMENT_METHODS.MKESH]: 'mKesh',
  [PAYMENT_METHODS.BANK_TRANSFER]: 'Transferência Bancária',
  [PAYMENT_METHODS.POS]: 'POS',
  [PAYMENT_METHODS.POSTPAID_CREDIT]: 'Cliente Pós-pago'
}[method] || method || '—');

const publicRestaurant = (restaurant) => {
  if (!restaurant) return null;
  return {
    _id: restaurant._id,
    id: restaurant._id || restaurant.id,
    name: restaurant.name,
    email: restaurant.email,
    phone: restaurant.phone || '',
    address_text: restaurant.address_text || '',
    address_coords: restaurant.address_coords || null,
    logo_url: restaurant.logo_url || '',
    cover_url: restaurant.cover_url || '',
    status: restaurant.status || 'active',
    createdAt: restaurant.createdAt,
    updatedAt: restaurant.updatedAt
  };
};

const publicMenuItem = (item) => ({
  _id: item._id,
  id: item._id || item.id,
  restaurant_id: item.restaurant_id || item.restaurant,
  name: item.name,
  category: item.category || 'Geral',
  description: item.description || '',
  price: Number(item.price || 0),
  image_url: item.image_url || '',
  available: item.available !== false,
  prep_time_min: item.prep_time_min || null,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt
});

const generateRestaurantToken = (restaurant) => jwt.sign({
  restaurant: {
    id: restaurant._id || restaurant.id,
    name: restaurant.name,
    email: restaurant.email
  },
  scope: 'restaurant'
}, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

const extractToken = (req) => {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  return null;
};

const requireRestaurant = async (req) => {
  const token = extractToken(req);
  if (!token) {
    const error = new Error('Sessão do restaurante em falta.');
    error.statusCode = 401;
    throw error;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const restaurantId = decoded?.restaurant?.id;
    if (!restaurantId) throw new Error('Token inválido');
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant || restaurant.status !== 'active') {
      const error = new Error('Restaurante inexistente ou inactivo.');
      error.statusCode = 401;
      throw error;
    }
    return restaurant;
  } catch (error) {
    error.statusCode = error.statusCode || 401;
    error.message = error.message || 'Sessão do restaurante inválida ou expirada.';
    throw error;
  }
};

exports.listPublicRestaurants = asyncHandler(async (_req, res) => {
  const restaurants = await Restaurant.find({ status: 'active' }).sort({ createdAt: -1 }).lean();
  const menuItems = await RestaurantMenuItem.find({ available: true }).sort({ category: 1, name: 1 }).lean();

  const payload = restaurants.map((restaurant) => {
    const safeRestaurant = publicRestaurant(restaurant);
    delete safeRestaurant.email;
    return {
      ...safeRestaurant,
      menuItems: menuItems
        .filter((item) => String(item.restaurant_id || item.restaurant) === String(restaurant._id || restaurant.id))
        .map(publicMenuItem)
    };
  }).filter((restaurant) => restaurant.menuItems.length > 0);

  res.json({ restaurants: payload });
});

exports.registerRestaurant = asyncHandler(async (req, res) => {
  const { name, email, phone, address_text, password } = req.body || {};
  if (!name || !email || !phone || !password) {
    res.status(400);
    throw new Error('Nome, email, telefone e password são obrigatórios.');
  }
  if (String(password).length < 6) {
    res.status(400);
    throw new Error('A password deve ter pelo menos 6 caracteres.');
  }
  const normalizedEmail = lowerEmail(email);
  const existing = await Restaurant.findOne({ email: normalizedEmail }).lean();
  if (existing) {
    res.status(400);
    throw new Error('Já existe um restaurante com este email.');
  }
  const restaurant = await Restaurant.create({
    name: clean(name),
    email: normalizedEmail,
    phone: clean(phone),
    address_text: clean(address_text) || '',
    password_hash: await bcrypt.hash(password, 12),
    status: 'active'
  });
  res.status(201).json({ restaurant: publicRestaurant(restaurant), token: generateRestaurantToken(restaurant) });
});

exports.loginRestaurant = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400);
    throw new Error('Email e password são obrigatórios.');
  }
  const restaurant = await Restaurant.findOne({ email: lowerEmail(email) });
  if (!restaurant || restaurant.status !== 'active' || !await bcrypt.compare(password, restaurant.password_hash || '')) {
    res.status(401);
    throw new Error('Credenciais inválidas.');
  }
  res.json({ restaurant: publicRestaurant(restaurant), token: generateRestaurantToken(restaurant) });
});

exports.createPublicOrder = asyncHandler(async (req, res) => {
  const data = req.body || {};
  const required = ['service_type', 'client_name', 'client_phone1', 'price'];
  for (const field of required) {
    if (data[field] === undefined || data[field] === null || String(data[field]).trim() === '') {
      res.status(400);
      throw new Error(`Campo obrigatório em falta: ${field}`);
    }
  }

  const coordinates = normalizeCoordinates(data.lat, data.lng);
  const pickupCoordinates = normalizeCoordinates(data.pickup_lat, data.pickup_lng);
  const baseServicePrice = toNumber(data.service_price ?? data.price, 0);
  let routeQuote = {
    distance_km: toNumber(data.route_distance_km, 0),
    duration_min: toNumber(data.route_duration_min, 0) || null,
    delivery_fee: toNumber(data.delivery_fee, 0),
    source: 'frontend_public'
  };

  if (pickupCoordinates && coordinates) {
    routeQuote = await buildRouteQuote(pickupCoordinates, coordinates);
  }

  const totalOrderPrice = baseServicePrice + toNumber(routeQuote.delivery_fee, 0);
  const allowedPaymentMethods = new Set(Object.values(PAYMENT_METHODS));
  const rawPayment = String(data.payment_method || '').trim();
  const paymentMethod = allowedPaymentMethods.has(rawPayment) && rawPayment !== PAYMENT_METHODS.POSTPAID_CREDIT
    ? rawPayment
    : PAYMENT_METHODS.CASH;

  const order = await Order.create({
    service_type: clean(data.service_type),
    price: Number(totalOrderPrice) || 0,
    service_price: Number(baseServicePrice) || 0,
    delivery_fee: Number(routeQuote.delivery_fee || 0),
    route_distance_km: Number(routeQuote.distance_km || 0),
    route_duration_min: routeQuote.duration_min || null,
    route_pricing_source: routeQuote.source || 'fallback_public',
    client_name: clean(data.client_name),
    client_phone1: clean(data.client_phone1),
    client_phone2: clean(data.client_phone2) || '',
    pickup_address_text: clean(data.pickup_address_text) || '',
    pickup_address_coords: pickupCoordinates,
    pickup_contact_name: clean(data.pickup_contact_name) || '',
    pickup_contact_phone: clean(data.pickup_contact_phone) || '',
    pickup_notes: clean(data.pickup_notes) || '',
    address_text: clean(data.address_text) || '',
    address_coords: coordinates,
    image_url: clean(data.image_url) || null,
    verification_code: generateVerificationCode(),
    created_by_admin: null,
    assigned_to_driver: null,
    client: null,
    status: ORDER_STATUS.PENDING,
    payment_method: paymentMethod,
    payment_status: PAYMENT_STATUS.UNPAID
  });

  await createAdminNotification({
    dedupeKey: `new_order:${order._id}`,
    type: 'order',
    title: data.public_source === 'client_food' ? 'Novo pedido de comida' : 'Novo pedido do cliente',
    message: `Pedido ${shortOrderCode(order._id)} · ${order.client_name || 'Cliente'} · ${paymentMethodLabel(order.payment_method)}.`,
    order,
    payload: {
      clientName: order.client_name,
      amount: Number(order.price || 0),
      paymentMethod: order.payment_method,
      publicSource: data.public_source || 'client',
      restaurantId: data.restaurant_id || null,
      foodItems: data.food_items || []
    },
    createdAt: order.createdAt || new Date()
  });

  const io = req.app.get('socketio');
  if (io) {
    io.to(ADMIN_ROOM).emit('order_pending', { orderId: order._id, clientName: order.client_name, source: data.public_source || 'client' });
    io.to(ADMIN_ROOM).emit('orders_changed', { orderId: order._id, action: 'created' });
  }

  res.status(201).json({ message: 'Pedido criado com sucesso.', order });
});

exports.getRestaurantProfile = asyncHandler(async (req, res) => {
  const restaurant = await requireRestaurant(req);
  res.json({ restaurant: publicRestaurant(restaurant) });
});

exports.updateRestaurantProfile = asyncHandler(async (req, res) => {
  const restaurant = await requireRestaurant(req);
  const { name, phone, address_text, logo_url, cover_url } = req.body || {};
  restaurant.name = clean(name) || restaurant.name;
  restaurant.phone = clean(phone) || restaurant.phone;
  restaurant.address_text = clean(address_text) || '';
  restaurant.logo_url = clean(logo_url) || '';
  restaurant.cover_url = clean(cover_url) || '';
  await restaurant.save();
  res.json({ restaurant: publicRestaurant(restaurant) });
});

exports.getRestaurantMenu = asyncHandler(async (req, res) => {
  const restaurant = await requireRestaurant(req);
  const items = await RestaurantMenuItem.find({ restaurant_id: restaurant._id }).sort({ category: 1, name: 1 }).lean();
  res.json({ items: items.map(publicMenuItem) });
});

exports.createRestaurantMenuItem = asyncHandler(async (req, res) => {
  const restaurant = await requireRestaurant(req);
  const { name, category, description, price, image_url, available, prep_time_min } = req.body || {};
  if (!name || !category || Number(price) <= 0) {
    res.status(400);
    throw new Error('Nome, categoria e preço válido são obrigatórios.');
  }
  const item = await RestaurantMenuItem.create({
    restaurant_id: restaurant._id,
    name: clean(name),
    category: clean(category) || 'Geral',
    description: clean(description) || '',
    price: toNumber(price, 0),
    image_url: clean(image_url) || '',
    available: available !== false,
    prep_time_min: prep_time_min ? Number(prep_time_min) : null
  });
  res.status(201).json({ item: publicMenuItem(item) });
});

exports.updateRestaurantMenuItem = asyncHandler(async (req, res) => {
  const restaurant = await requireRestaurant(req);
  const item = await RestaurantMenuItem.findById(req.params.id);
  if (!item || String(item.restaurant_id || item.restaurant) !== String(restaurant._id)) {
    res.status(404);
    throw new Error('Comida não encontrada neste restaurante.');
  }
  const { name, category, description, price, image_url, available, prep_time_min } = req.body || {};
  item.name = clean(name) || item.name;
  item.category = clean(category) || item.category || 'Geral';
  item.description = clean(description) || '';
  item.price = toNumber(price, item.price || 0);
  item.image_url = clean(image_url) || '';
  item.available = available !== false;
  item.prep_time_min = prep_time_min ? Number(prep_time_min) : null;
  await item.save();
  res.json({ item: publicMenuItem(item) });
});

exports.deleteRestaurantMenuItem = asyncHandler(async (req, res) => {
  const restaurant = await requireRestaurant(req);
  const item = await RestaurantMenuItem.findById(req.params.id);
  if (!item || String(item.restaurant_id || item.restaurant) !== String(restaurant._id)) {
    res.status(404);
    throw new Error('Comida não encontrada neste restaurante.');
  }
  await item.deleteOne();
  res.json({ message: 'Comida eliminada com sucesso.' });
});

exports.getRestaurantOrders = asyncHandler(async (req, res) => {
  const restaurant = await requireRestaurant(req);
  const all = await Order.find({ service_type: 'restaurante_comida' }).sort({ createdAt: -1 }).lean();
  const restaurantPhone = String(restaurant.phone || '').replace(/\D/g, '');
  const orders = all.filter((order) => {
    const orderPhone = String(order.pickup_contact_phone || '').replace(/\D/g, '');
    const samePhone = restaurantPhone && orderPhone && restaurantPhone === orderPhone;
    const sameName = String(order.pickup_contact_name || '').trim().toLowerCase() === String(restaurant.name || '').trim().toLowerCase();
    return samePhone || sameName;
  });
  res.json({ orders });
});
