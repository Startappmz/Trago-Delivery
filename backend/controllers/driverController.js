// backend/controllers/driverController.js

const asyncHandler = require('express-async-handler');
const { isValidId } = require('../utils/id');

// IMPORTS CORRETOS (estamos dentro da pasta controllers)
const User = require('../models/User');
const DriverProfile = require('../models/DriverProfile');
const Order = require('../models/Order');
const { DRIVER_STATUS, ORDER_STATUS, FINANCIAL } = require('../utils/constants');
const { parseCommissionRate } = require('../utils/helpers');

exports.getAllDrivers = asyncHandler(async (_req, res) => {
  const drivers = await User.find({ role: 'driver' })
    .populate('profile')
    .sort({ nome: 1 })
    .lean();

  res.status(200).json({ drivers });
});

exports.getDriverById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    res.status(404);
    throw new Error('Motorista não encontrado (ID inválido).');
  }

  const driver = await User.findById(id).populate('profile');

  if (!driver || driver.role !== 'driver') {
    res.status(404);
    throw new Error('Motorista não encontrado.');
  }

  res.status(200).json({ driver });
});

exports.updateDriver = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const data = req.filtered || req.body;
  const { nome, telefone, vehicle_plate, status, commissionRate } = data;

  const user = await User.findById(id);
  if (!user || user.role !== 'driver') {
    res.status(404);
    throw new Error('Motorista não encontrado.');
  }

  user.nome = nome;
  user.telefone = telefone;
  await user.save();

  const parsedCommission = parseCommissionRate(
    commissionRate,
    FINANCIAL.DEFAULT_COMMISSION_RATE
  );

  const profile = await DriverProfile.findOneAndUpdate(
    { user: id },
    {
      vehicle_plate,
      status,
      commissionRate: parsedCommission
    },
    { new: true, upsert: true }
  );

  res.status(200).json({
    message: 'Motorista atualizado com sucesso.',
    user,
    profile
  });
});

/**
 * Lista de motoristas *disponíveis* para atribuição de encomenda.
 * Usado pelo front em: GET /api/drivers/available
 *
 * Retorna no formato:
 *   { drivers: [ { _id, nome, telefone, profile: { _id, vehicle_plate, status, commissionRate } } ] }
 */
exports.getAllDriversForAvailability = asyncHandler(async (_req, res) => {
  // Fallback seguro caso a constante mude de nome
  const ONLINE_FREE =
    (DRIVER_STATUS && DRIVER_STATUS.ONLINE_FREE) || 'online_livre';

  // Primeiro buscamos perfis com estado "online_livre"
  const profiles = await DriverProfile.find({ status: ONLINE_FREE })
    .populate('user') // para termos nome/telefone
    .lean();

  const drivers = profiles
    .filter(p => p.user && p.user.role === 'driver')
    .map(p => ({
      _id: p.user._id,
      nome: p.user.nome,
      telefone: p.user.telefone,
      profile: {
        _id: p._id,
        vehicle_plate: p.vehicle_plate,
        status: p.status,
        commissionRate: p.commissionRate
      }
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return res.status(200).json({ drivers });
});


exports.getLiveDriverLocations = asyncHandler(async (_req, res) => {
  const onlineStatuses = [
    DRIVER_STATUS.ONLINE_FREE,
    DRIVER_STATUS.ONLINE_BUSY,
    DRIVER_STATUS.PICKUP,
    DRIVER_STATUS.DELIVERY
  ];

  const profiles = await DriverProfile.find({
    status: { $in: onlineStatuses },
    'lastLocation.lat': { $exists: true, $ne: null },
    'lastLocation.lng': { $exists: true, $ne: null }
  })
    .populate('user', 'nome telefone role')
    .lean();

  const drivers = profiles
    .filter((profile) => profile.user && profile.user.role === 'driver')
    .map((profile) => ({
      driverId: profile._id,
      driverUserId: profile.user._id,
      driverName: profile.user.nome,
      telefone: profile.user.telefone,
      status: profile.status,
      lat: profile.lastLocation.lat,
      lng: profile.lastLocation.lng,
      accuracy: profile.lastLocation.accuracy,
      speed: profile.lastLocation.speed,
      updatedAt: profile.lastLocation.updatedAt
    }));

  res.status(200).json({ drivers });
});

exports.getDriverReport = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    res.status(404);
    throw new Error('Motorista não encontrado (ID inválido).');
  }

  const profile = await DriverProfile.findOne({ user: id });
  if (!profile) {
    res.status(404);
    throw new Error('Perfil de motorista não encontrado.');
  }

  const orders = await Order.find({
    assigned_to_driver: profile._id,
    status: ORDER_STATUS.COMPLETED
  })
    .sort({ timestamp_completed: -1 })
    .lean();

  res.status(200).json({
    totalOrders: orders.length,
    orders
  });
});

exports.getMyEarnings = asyncHandler(async (req, res) => {
  const profile = await DriverProfile.findOne({ user: req.user.id });

  if (!profile) {
    res.status(404);
    throw new Error('Perfil de motorista não encontrado.');
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  endOfMonth.setUTCHours(23, 59, 59, 999);

  const orders = await Order.find({
    assigned_to_driver: profile._id,
    status: ORDER_STATUS.COMPLETED,
    timestamp_completed: { $gte: startOfMonth, $lte: endOfMonth }
  })
    .sort({ timestamp_completed: -1 })
    .lean();

  const totalGanhos = orders.reduce(
    (total, order) => total + order.valor_motorista,
    0
  );

  res.status(200).json({
    commissionRate: profile.commissionRate,
    totalGanhos,
    totalOrders: orders.length,
    ordersList: orders
  });
});
