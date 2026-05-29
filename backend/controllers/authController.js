const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const DriverProfile = require('../models/DriverProfile');
const { FINANCIAL } = require('../utils/constants');
const { parseCommissionRate } = require('../utils/helpers');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

const generateToken = (user) =>
  jwt.sign(
    {
      user: {
        id: user._id.toString(),
        role: user.role,
        nome: user.nome
      }
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

const setAuthCookie = (res, token) =>
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });

exports.registerDriver = asyncHandler(async (req, res) => {
  const data = req.filtered || req.body;
  const { nome, email, telefone, password, vehicle_plate, commissionRate } = data;

  const normalizedEmail = email.toLowerCase();
  const userExists = await User.findOne({ email: normalizedEmail });

  if (userExists) {
    res.status(400);
    throw new Error('Já existe um utilizador com este email.');
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const parsedCommission = parseCommissionRate(
    commissionRate,
    FINANCIAL.DEFAULT_COMMISSION_RATE
  );

  const user = await User.create({
    nome: nome.trim(),
    email: normalizedEmail,
    telefone: telefone.trim(),
    password: hashedPassword,
    role: 'driver'
  });

  try {
    const driverProfile = await DriverProfile.create({
      user: user._id,
      vehicle_plate: vehicle_plate?.trim() || '',
      commissionRate: parsedCommission
    });

    res.status(201).json({
      message: 'Motorista registado com sucesso.',
      user: {
        _id: user._id,
        nome: user.nome,
        email: user.email,
        telefone: user.telefone,
        role: user.role
      },
      profile: driverProfile
    });
  } catch (error) {
    await user.deleteOne().catch(() => {});
    throw error;
  }
});

exports.login = asyncHandler(async (req, res) => {
  const data = req.filtered || req.body;
  const { email, password, role } = data;

  const normalizedEmail = email.toLowerCase();
  const user = await User.findOne({ email: normalizedEmail, role }).select('+password');

  if (!user) {
    res.status(401);
    throw new Error('Credenciais inválidas.');
  }

  const passwordOk = await bcrypt.compare(password, user.password);
  if (!passwordOk) {
    res.status(401);
    throw new Error('Credenciais inválidas.');
  }

  const token = generateToken(user);
  setAuthCookie(res, token);

  res.status(200).json({
    message: 'Login bem-sucedido.',
    token,
    user: {
      _id: user._id,
      nome: user.nome,
      role: user.role
    }
  });
});

exports.logout = asyncHandler(async (_req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production'
  });

  res.status(200).json({ message: 'Sessão encerrada com sucesso.' });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const data = req.filtered || req.body;
  const { senhaAntiga, senhaNova } = data;

  const user = await User.findById(req.user.id).select('+password');
  if (!user) {
    res.status(404);
    throw new Error('Utilizador não encontrado.');
  }

  const isMatch = await bcrypt.compare(senhaAntiga, user.password);
  if (!isMatch) {
    res.status(401);
    throw new Error('A senha antiga está incorreta.');
  }

  user.password = await bcrypt.hash(senhaNova, 12);
  await user.save();

  const token = generateToken(user);
  setAuthCookie(res, token);

  res.status(200).json({ message: 'Senha atualizada com sucesso.' });
});

// GET /api/auth/me
// Retorna os dados do utilizador autenticado
exports.getMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    id: req.user._id,
    nome: req.user.nome,
    email: req.user.email,
    role: req.user.role
  });
});
