const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Order = require('../models/Order');
const Client = require('../models/Client');
const DriverProfile = require('../models/DriverProfile');
const Restaurant = require('../models/Restaurant');
const RestaurantMenuItem = require('../models/RestaurantMenuItem');
const RestaurantRating = require('../models/RestaurantRating');
const { PAYMENT_METHODS, PAYMENT_STATUS, ORDER_STATUS, DRIVER_STATUS, ADMIN_ROOM } = require('../utils/constants');
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

const isValidCoordinate = (value) => value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value));
const normalizePhone = (value) => String(value || '').replace(/\D/g, '');

const publicClient = (client) => {
  if (!client) return null;
  return {
    _id: client._id,
    id: client._id || client.id,
    nome: client.nome,
    telefone: client.telefone || '',
    email: client.email || '',
    endereco: client.endereco || '',
    auth_provider: client.auth_provider || '',
    avatar_url: client.avatar_url || '',
    createdAt: client.createdAt,
    updatedAt: client.updatedAt
  };
};

const haversineKm = (origin, destination) => {
  if (!origin || !destination) return Infinity;
  const R = 6371;
  const dLat = (Number(destination.lat) - Number(origin.lat)) * Math.PI / 180;
  const dLng = (Number(destination.lng) - Number(origin.lng)) * Math.PI / 180;
  const lat1 = Number(origin.lat) * Math.PI / 180;
  const lat2 = Number(destination.lat) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const compactAddress = (label) => {
  const parts = String(label || '').split(',').map((part) => part.trim()).filter(Boolean);
  return parts.slice(0, 3).join(', ') || String(label || 'Endereço');
};


const paymentMethodLabel = (method) => ({
  [PAYMENT_METHODS.CASH]: 'Dinheiro',
  [PAYMENT_METHODS.MPESA]: 'M-Pesa',
  [PAYMENT_METHODS.EMOLA]: 'e-Mola',
  [PAYMENT_METHODS.MKESH]: 'mKesh',
  [PAYMENT_METHODS.BANK_TRANSFER]: 'Transferência Bancária',
  [PAYMENT_METHODS.POS]: 'POS',
  [PAYMENT_METHODS.POSTPAID_CREDIT]: 'Cliente Pós-pago'
}[method] || method || '—');

const publicRestaurant = (restaurant, ratingStats = null) => {
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
    updatedAt: restaurant.updatedAt,
    average_rating: ratingStats ? Number(ratingStats.average.toFixed(1)) : Number(restaurant.average_rating || 0),
    rating_count: ratingStats ? ratingStats.count : Number(restaurant.rating_count || 0)
  };
};

const publicMenuItem = (item, ratingStats = null) => ({
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
  updatedAt: item.updatedAt,
  average_rating: ratingStats ? Number(ratingStats.average.toFixed(1)) : Number(item.average_rating || 0),
  rating_count: ratingStats ? ratingStats.count : Number(item.rating_count || 0)
});

const generateRestaurantToken = (restaurant) => jwt.sign({
  restaurant: {
    id: restaurant._id || restaurant.id,
    name: restaurant.name,
    email: restaurant.email
  },
  scope: 'restaurant'
}, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });


const getRatingStats = async () => {
  const empty = { restaurant: new Map(), menu: new Map() };
  let ratings = [];
  try {
    ratings = await RestaurantRating.find({}).lean();
  } catch (_error) {
    return empty;
  }

  const add = (map, key, value) => {
    if (!key) return;
    const current = map.get(String(key)) || { total: 0, count: 0, average: 0 };
    current.total += Number(value || 0);
    current.count += 1;
    current.average = current.count ? current.total / current.count : 0;
    map.set(String(key), current);
  };

  ratings.forEach((rating) => {
    add(empty.restaurant, rating.restaurant_id, rating.rating);
    if (rating.menu_item_id) add(empty.menu, rating.menu_item_id, rating.rating);
  });

  return empty;
};

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
  const menuItems = await RestaurantMenuItem.find({ available: true }).sort({ createdAt: -1, category: 1, name: 1 }).lean();
  const ratingStats = await getRatingStats();

  const payload = restaurants.map((restaurant) => {
    const restaurantId = String(restaurant._id || restaurant.id);
    const safeRestaurant = publicRestaurant(restaurant, ratingStats.restaurant.get(restaurantId));
    delete safeRestaurant.email;
    return {
      ...safeRestaurant,
      menuItems: menuItems
        .filter((item) => String(item.restaurant_id || item.restaurant) === restaurantId)
        .map((item) => publicMenuItem(item, ratingStats.menu.get(String(item._id || item.id))))
    };
  }).filter((restaurant) => restaurant.menuItems.length > 0);

  res.json({ restaurants: payload });
});

exports.createPublicRouteQuote = asyncHandler(async (req, res) => {
  const { origin, destination } = req.body || {};
  const quote = await buildRouteQuote(origin, destination);
  res.json(quote);
});

exports.createPublicRating = asyncHandler(async (req, res) => {
  const data = req.body || {};
  const ratingValue = Math.max(1, Math.min(5, Math.round(Number(data.rating || 0))));
  if (!ratingValue) {
    res.status(400);
    throw new Error('A avaliação deve estar entre 1 e 5 estrelas.');
  }

  let restaurantId = clean(data.restaurant_id) || '';
  const menuItemId = clean(data.menu_item_id) || '';
  const customerSessionId = clean(data.customer_session_id) || clean(data.client_id) || req.ip || 'anonymous';

  if (!restaurantId && !menuItemId) {
    res.status(400);
    throw new Error('Indique o restaurante ou o prato a avaliar.');
  }

  if (menuItemId) {
    const menuItem = await RestaurantMenuItem.findById(menuItemId).lean();
    if (!menuItem) {
      res.status(404);
      throw new Error('Prato não encontrado.');
    }
    restaurantId = restaurantId || String(menuItem.restaurant_id || menuItem.restaurant || '');
  }

  const restaurant = await Restaurant.findById(restaurantId).lean();
  if (!restaurant || restaurant.status !== 'active') {
    res.status(404);
    throw new Error('Restaurante não encontrado.');
  }

  const existing = await RestaurantRating.findOne({
    restaurant_id: restaurantId,
    menu_item_id: menuItemId,
    customer_session_id: customerSessionId
  });

  let rating;
  if (existing) {
    existing.rating = ratingValue;
    existing.comment = clean(data.comment) || '';
    rating = await existing.save();
  } else {
    rating = await RestaurantRating.create({
      restaurant_id: restaurantId,
      menu_item_id: menuItemId,
      customer_session_id: customerSessionId,
      rating: ratingValue,
      comment: clean(data.comment) || ''
    });
  }

  res.status(existing ? 200 : 201).json({ message: 'Avaliação guardada com sucesso.', rating });
});


exports.registerPublicClient = asyncHandler(async (req, res) => {
  const { name, phone, email, address_text } = req.body || {};
  const cleanedName = clean(name);
  const cleanedPhone = clean(phone);
  const normalizedPhone = normalizePhone(cleanedPhone);
  const normalizedEmail = lowerEmail(email);

  if (!cleanedName || normalizedPhone.length < 8 || !normalizedEmail) {
    res.status(400);
    throw new Error('Nome, contacto válido e email são obrigatórios para registar o cliente.');
  }

  let client = await Client.findOne({ telefone: cleanedPhone });
  if (!client && normalizedPhone !== cleanedPhone) client = await Client.findOne({ telefone: normalizedPhone });
  if (!client && normalizedEmail) client = await Client.findOne({ email: normalizedEmail });

  if (client) {
    client.nome = cleanedName;
    client.telefone = client.telefone || cleanedPhone;
    client.email = normalizedEmail || client.email || '';
    client.endereco = clean(address_text) || client.endereco || '';
    client.auth_provider = client.auth_provider || 'local';
    client.last_login_at = new Date();
    await client.save();
  } else {
    client = await Client.create({
      nome: cleanedName,
      telefone: cleanedPhone,
      email: normalizedEmail,
      endereco: clean(address_text) || '',
      auth_provider: 'local',
      last_login_at: new Date()
    });
  }

  res.status(200).json({ message: 'Cliente registado com sucesso.', client: publicClient(client) });
});

exports.googleClientAuth = asyncHandler(async (req, res) => {
  const { id_token } = req.body || {};
  if (!id_token) {
    res.status(400);
    throw new Error('Token Google em falta.');
  }

  const verifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(id_token)}`;
  const googleResponse = await fetch(verifyUrl, { method: 'GET' });
  const profile = await googleResponse.json().catch(() => ({}));
  if (!googleResponse.ok || !profile.email || !profile.sub) {
    res.status(401);
    throw new Error('Não foi possível validar a conta Google.');
  }

  const expectedAudience = process.env.GOOGLE_CLIENT_ID || process.env.TRAGO_GOOGLE_CLIENT_ID || '';
  if (expectedAudience && profile.aud !== expectedAudience) {
    res.status(401);
    throw new Error('Client ID Google inválido para este projecto.');
  }

  const email = lowerEmail(profile.email);
  const subject = String(profile.sub);
  let client = await Client.findOne({ auth_provider: 'google', auth_subject: subject });
  if (!client) client = await Client.findOne({ email });

  if (client) {
    client.nome = clean(profile.name) || client.nome || email.split('@')[0];
    client.email = email;
    client.auth_provider = 'google';
    client.auth_subject = subject;
    client.avatar_url = clean(profile.picture) || client.avatar_url || '';
    client.last_login_at = new Date();
    await client.save();
  } else {
    client = await Client.create({
      nome: clean(profile.name) || email.split('@')[0],
      telefone: `google_${subject.slice(-12)}`,
      email,
      auth_provider: 'google',
      auth_subject: subject,
      avatar_url: clean(profile.picture) || '',
      last_login_at: new Date()
    });
  }

  res.json({
    message: 'Cliente autenticado com Google.',
    client: publicClient(client),
    google: {
      name: profile.name || '',
      email,
      picture: profile.picture || ''
    }
  });
});

exports.searchPublicAddresses = asyncHandler(async (req, res) => {
  const query = clean(req.query.q) || '';
  const limit = Math.max(1, Math.min(12, Number(req.query.limit || 8)));
  if (query.length < 3) return res.json({ suggestions: [] });

  const googleKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || '';
  if (googleKey) {
    try {
      const autoUrl = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
      autoUrl.searchParams.set('input', query);
      autoUrl.searchParams.set('components', 'country:mz');
      autoUrl.searchParams.set('language', 'pt');
      autoUrl.searchParams.set('key', googleKey);
      const autoResponse = await fetch(autoUrl.toString());
      const autoData = await autoResponse.json().catch(() => ({}));
      const predictions = Array.isArray(autoData.predictions) ? autoData.predictions.slice(0, limit) : [];
      const suggestions = [];
      for (const item of predictions) {
        const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
        detailsUrl.searchParams.set('place_id', item.place_id);
        detailsUrl.searchParams.set('fields', 'formatted_address,geometry,name,place_id');
        detailsUrl.searchParams.set('language', 'pt');
        detailsUrl.searchParams.set('key', googleKey);
        const detailsResponse = await fetch(detailsUrl.toString());
        const details = await detailsResponse.json().catch(() => ({}));
        const result = details.result || {};
        const location = result.geometry?.location;
        suggestions.push({
          label: result.formatted_address || item.description,
          short_label: result.name || compactAddress(item.description),
          lat: location?.lat,
          lng: location?.lng,
          provider: 'google_places',
          external_id: item.place_id
        });
      }
      return res.json({ suggestions: suggestions.filter((item) => isValidCoordinate(item.lat) && isValidCoordinate(item.lng)) });
    } catch (_error) {
      // Continua para fallback OpenStreetMap/Nominatim.
    }
  }

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('q', query);
  url.searchParams.set('countrycodes', 'mz');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('accept-language', 'pt');
  url.searchParams.set('viewbox', '32.20,-25.60,33.10,-26.25');
  url.searchParams.set('bounded', '0');

  const response = await fetch(url.toString(), {
    headers: { 'User-Agent': 'TragoDelivery/1.0 contact@tragodelivery.local' }
  });
  const data = await response.json().catch(() => []);
  const suggestions = (Array.isArray(data) ? data : []).slice(0, limit).map((item) => ({
    label: item.display_name,
    short_label: compactAddress(item.display_name),
    lat: Number(item.lat),
    lng: Number(item.lon),
    provider: 'openstreetmap_nominatim',
    external_id: item.osm_id ? String(item.osm_id) : ''
  })).filter((item) => isValidCoordinate(item.lat) && isValidCoordinate(item.lng));

  res.json({ suggestions });
});

const findNearestFreeDriver = async (targetCoords, radiusKm = 5) => {
  if (!targetCoords) return { driver: null, candidates: [], checked: 0 };
  const profiles = await DriverProfile.find({
    status: DRIVER_STATUS.ONLINE_FREE,
    'lastLocation.lat': { $exists: true, $ne: null },
    'lastLocation.lng': { $exists: true, $ne: null }
  }).populate('user', 'nome telefone role').lean();

  const candidates = profiles
    .filter((profile) => profile.user && profile.user.role === 'driver')
    .map((profile) => {
      const coords = { lat: Number(profile.lastLocation?.lat), lng: Number(profile.lastLocation?.lng) };
      return { profile, distance_km: haversineKm(targetCoords, coords) };
    })
    .filter((entry) => Number.isFinite(entry.distance_km) && entry.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km);

  return { driver: candidates[0] || null, candidates, checked: profiles.length };
};

exports.assignPublicOrderWithRadar = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error('Pedido não encontrado.');
  }

  if (order.assigned_to_driver) {
    const profile = await DriverProfile.findById(order.assigned_to_driver).populate('user', 'nome telefone role').lean();
    return res.json({
      assigned: true,
      already_assigned: true,
      order,
      driver: profile ? {
        id: profile._id,
        name: profile.user?.nome || 'Motorista Trago',
        phone: profile.user?.telefone || '',
        distance_km: 0
      } : null
    });
  }

  const target = order.pickup_address_coords || order.address_coords || null;
  if (!target || !isValidCoordinate(target.lat) || !isValidCoordinate(target.lng)) {
    return res.json({ assigned: false, reason: 'missing_coordinates', candidates_checked: 0 });
  }

  const { driver, candidates, checked } = await findNearestFreeDriver({ lat: Number(target.lat), lng: Number(target.lng) }, 5);
  if (!driver) {
    return res.json({ assigned: false, reason: 'no_free_driver_in_5km', candidates_checked: checked, in_radius: candidates.length });
  }

  order.assigned_to_driver = driver.profile._id;
  order.status = ORDER_STATUS.ASSIGNED;
  await order.save();

  const reservedProfile = await DriverProfile.findById(driver.profile._id);
  if (reservedProfile) {
    reservedProfile.status = DRIVER_STATUS.ONLINE_BUSY;
    await reservedProfile.save();
  }

  const io = req.app.get('socketio');
  if (io && driver.profile.user?._id) {
    io.to(String(driver.profile.user._id)).emit('nova_entrega_atribuida', {
      orderId: order._id,
      clientName: order.client_name,
      serviceType: order.service_type,
      paymentMethod: order.payment_method
    });
    io.to(ADMIN_ROOM).emit('orders_changed', { orderId: order._id, action: 'assigned_by_client_radar' });
    io.to(ADMIN_ROOM).emit('driver_status_changed', {
      driverId: driver.profile._id,
      driverUserId: driver.profile.user._id,
      newStatus: DRIVER_STATUS.ONLINE_BUSY
    });
  }

  res.json({
    assigned: true,
    order,
    driver: {
      id: driver.profile._id,
      name: driver.profile.user?.nome || 'Motorista Trago',
      phone: driver.profile.user?.telefone || '',
      distance_km: Number(driver.distance_km.toFixed(2))
    }
  });
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
  let linkedClientId = null;
  if (data.customer_session_id) {
    const possibleClient = await Client.findById(data.customer_session_id).lean();
    if (possibleClient) linkedClientId = possibleClient._id;
  }
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
    client: linkedClientId,
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
  const { name, phone, address_text, address_coords, logo_url, cover_url } = req.body || {};
  restaurant.name = clean(name) || restaurant.name;
  restaurant.phone = clean(phone) || restaurant.phone;
  restaurant.address_text = clean(address_text) || '';
  restaurant.address_coords = address_coords && Number.isFinite(Number(address_coords.lat)) && Number.isFinite(Number(address_coords.lng))
    ? { lat: Number(address_coords.lat), lng: Number(address_coords.lng) }
    : restaurant.address_coords || null;
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
