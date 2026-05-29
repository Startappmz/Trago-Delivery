const asyncHandler = require('express-async-handler');
const { isValidId } = require('../utils/id');
const Client = require('../models/Client');
const Order = require('../models/Order');
const { ORDER_STATUS } = require('../utils/constants');

exports.createClient = asyncHandler(async (req, res) => {
  const data = req.filtered || req.body;
  const { nome, telefone, email, empresa, nuit, endereco } = data;

  const existingClient = await Client.findOne({ telefone });
  if (existingClient) {
    res.status(400);
    throw new Error('Um cliente com este número de telefone já existe.');
  }

  const client = await Client.create({
    nome,
    telefone,
    email,
    empresa,
    nuit,
    endereco,
    created_by_admin: req.user._id
  });

  res.status(201).json({ message: 'Cliente criado com sucesso', client });
});

exports.getAllClients = asyncHandler(async (_req, res) => {
  const clients = await Client.find().sort({ nome: 1 }).lean();
  res.status(200).json({ clients });
});

exports.getClientById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    res.status(404);
    throw new Error('Cliente não encontrado (ID inválido).');
  }

  const client = await Client.findById(id);
  if (!client) {
    res.status(404);
    throw new Error('Cliente não encontrado.');
  }

  res.status(200).json({ client });
});

exports.updateClient = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const data = req.filtered || req.body;
  const { nome, telefone, email, empresa, nuit, endereco } = data;

  const client = await Client.findById(id);
  if (!client) {
    res.status(404);
    throw new Error('Cliente não encontrado.');
  }

  if (telefone !== client.telefone) {
    const phoneInUse = await Client.findOne({ telefone });
    if (phoneInUse) {
      res.status(400);
      throw new Error('Este novo número de telefone já está em uso.');
    }
  }

  client.nome = nome;
  client.telefone = telefone;
  client.email = email;
  client.empresa = empresa;
  client.nuit = nuit;
  client.endereco = endereco;

  await client.save();

  res.status(200).json({ message: 'Cliente atualizado com sucesso', client });
});

exports.deleteClient = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const client = await Client.findById(id);
  if (!client) {
    res.status(404);
    throw new Error('Cliente não encontrado.');
  }

  const hasOrders = await Order.exists({ client: id });
  if (hasOrders) {
    res.status(400);
    throw new Error('Não é possível apagar clientes com histórico de encomendas.');
  }

  await client.deleteOne();
  res.status(200).json({ message: 'Cliente apagado com sucesso' });
});

exports.getStatement = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    res.status(400);
    throw new Error('Datas de início e fim são obrigatórias.');
  }

  const start = new Date(startDate);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setUTCHours(23, 59, 59, 999);

  const clientId = id;

  const orders = await Order.find({
    client: clientId,
    status: ORDER_STATUS.COMPLETED,
    timestamp_completed: { $gte: start, $lte: end }
  })
    .sort({ timestamp_completed: 1 })
    .lean();

  const totalValue = orders.reduce((total, order) => total + order.price, 0);

  res.status(200).json({
    totalValue,
    totalOrders: orders.length,
    ordersList: orders
  });
});