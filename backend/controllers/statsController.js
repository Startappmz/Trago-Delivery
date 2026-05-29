const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const DriverProfile = require('../models/DriverProfile');
const { ORDER_STATUS, DRIVER_STATUS } = require('../utils/constants');

exports.getOverviewStats = asyncHandler(async (_req, res) => {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);

  const transitStatuses = [
    ORDER_STATUS.ASSIGNED,
    ORDER_STATUS.IN_PROGRESS,
    ORDER_STATUS.PICKUP_IN_PROGRESS,
    ORDER_STATUS.PICKUP_DONE,
    ORDER_STATUS.DELIVERY_IN_PROGRESS
  ];

  const onlineDriverStatuses = [
    DRIVER_STATUS.ONLINE_FREE,
    DRIVER_STATUS.ONLINE_BUSY,
    DRIVER_STATUS.PICKUP,
    DRIVER_STATUS.DELIVERY
  ];

  const [pendentes, emTransito, concluidasHoje, motoristasOnline] = await Promise.all([
    Order.countDocuments({ status: ORDER_STATUS.PENDING }),
    Order.countDocuments({ status: { $in: transitStatuses } }),
    Order.countDocuments({
      status: ORDER_STATUS.COMPLETED,
      timestamp_completed: { $gte: start, $lte: end }
    }),
    DriverProfile.countDocuments({
      status: { $in: onlineDriverStatuses }
    })
  ]);

  res.status(200).json({
    pendentes,
    emTransito,
    concluidasHoje,
    motoristasOnline
  });
});

exports.getServicePerformanceStats = asyncHandler(async (_req, res) => {
  const serviceNames = {
    rapido: 'Delivery Rápido',
    doc: 'Doc.',
    farma: 'Farmácia',
    carga: 'Cargas',
    outros: 'Outros'
  };

  const stats = await Order.aggregate([
    { $match: { status: ORDER_STATUS.COMPLETED } },
    {
      $group: {
        _id: '$service_type',
        totalValue: { $sum: { $ifNull: ['$price', 0] } },
        totalOrders: { $sum: 1 }
      }
    }
  ]);

  const statsByService = stats.reduce((acc, item) => {
    if (item && item._id) {
      acc[item._id] = {
        totalValue: Number(item.totalValue || 0),
        totalOrders: Number(item.totalOrders || 0)
      };
    }
    return acc;
  }, {});

  const keys = Object.keys(serviceNames);

  res.status(200).json({
    labels: keys.map((key) => serviceNames[key]),
    dataValues: keys.map((key) => statsByService[key]?.totalValue || 0),
    adesaoValues: keys.map((key) => statsByService[key]?.totalOrders || 0)
  });
});

exports.getFinancialStats = asyncHandler(async (_req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  endOfMonth.setUTCHours(23, 59, 59, 999);

  const query = {
    status: ORDER_STATUS.COMPLETED,
    timestamp_completed: { $gte: startOfMonth, $lte: endOfMonth }
  };

  const [financialStats] = await Order.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalReceita: { $sum: '$price' },
        totalGanhosMotorista: { $sum: '$valor_motorista' },
        totalLucroEmpresa: { $sum: '$valor_empresa' }
      }
    }
  ]);

  const [topDriver] = await Order.aggregate([
    { $match: query },
    {
      $group: {
        _id: '$assigned_to_driver',
        totalGanhos: { $sum: '$valor_motorista' }
      }
    },
    { $sort: { totalGanhos: -1 } },
    { $limit: 1 },
    {
      $lookup: {
        from: 'driverprofiles',
        localField: '_id',
        foreignField: '_id',
        as: 'profile'
      }
    },
    { $unwind: '$profile' },
    {
      $lookup: {
        from: 'users',
        localField: 'profile.user',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: '$user' },
    {
      $project: {
        _id: 0,
        nome: '$user.nome',
        totalGanhos: '$totalGanhos'
      }
    }
  ]);

  res.status(200).json({
    totalReceita: financialStats?.totalReceita || 0,
    totalGanhosMotorista: financialStats?.totalGanhosMotorista || 0,
    totalLucroEmpresa: financialStats?.totalLucroEmpresa || 0,
    topDriver: topDriver || { nome: 'N/A', totalGanhos: 0 }
  });
});