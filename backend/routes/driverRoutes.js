// backend/routes/driverRoutes.js

const express = require('express');
const { body, param } = require('express-validator');
const driverController = require('../controllers/driverController');
const { protect, admin, driver } = require('../middleware/authMiddleware');
const { validateRequest } = require('../middleware/validateRequest');
const { DRIVER_STATUS, DRIVER_TYPES } = require('../utils/constants');

const router = express.Router();

/**
 * GET /api/drivers
 * Lista todos os motoristas (ecrã de gestão) – ADMIN
 */
router.get('/', protect, admin, driverController.getAllDrivers);

/**
 * GET /api/drivers/available
 * Motoristas DISPONÍVEIS (online_livre) para atribuir encomendas – ADMIN
 * Usado no modal "Atribuir motorista"
 */
router.get(
  '/available',
  protect,
  admin,
  driverController.getAllDriversForAvailability
);

/**
 * GET /api/drivers/my-earnings
 * Ganhos do motorista autenticado – DRIVER
 * Usado no painel do motorista (driver.js → loadMyEarnings)
 */
router.get(
  '/my-earnings',
  protect,
  driver,
  driverController.getMyEarnings
);


/**
 * GET /api/drivers/live-locations
 * Localizações dos motoristas online para fallback do mapa em tempo real – ADMIN
 */
router.get(
  '/live-locations',
  protect,
  admin,
  driverController.getLiveDriverLocations
);

/**
 * GET /api/drivers/:id/report
 * Relatório de entregas concluídas de um motorista – ADMIN
 * Usado no modal "Relatório do Motorista"
 */
router.get(
  '/:id/report',
  protect,
  admin,
  [param('id', 'ID de motorista inválido').isMongoId()],
  validateRequest,
  driverController.getDriverReport
);

/**
 * GET /api/drivers/:id
 * Detalhes de um motorista – ADMIN
 * Usado no modal de edição de motorista
 */
router.get(
  '/:id',
  protect,
  admin,
  [param('id', 'ID de motorista inválido').isMongoId()],
  validateRequest,
  driverController.getDriverById
);

/**
 * PUT /api/drivers/:id
 * Atualizar motorista (nome, telefone, matrícula, status, comissão) – ADMIN
 * Usado no formulário "Editar motorista"
 */
router.put(
  '/:id',
  protect,
  admin,
  [
    param('id', 'ID de motorista inválido').isMongoId(),
    body('nome')
      .trim()
      .notEmpty()
      .withMessage('Nome é obrigatório.'),
    body('telefone')
      .trim()
      .notEmpty()
      .withMessage('Telefone é obrigatório.'),
    body('vehicle_plate')
      .optional({ checkFalsy: true })
      .trim(),
    body('vehicleId')
      .optional({ checkFalsy: true })
      .isMongoId()
      .withMessage('ID de veículo inválido.'),
    body('driverType')
      .optional({ checkFalsy: true })
      .isIn(Object.values(DRIVER_TYPES))
      .withMessage('Tipo de motorista inválido.'),
    body('status')
      .optional({ checkFalsy: true })
      .isIn(Object.values(DRIVER_STATUS))
      .withMessage('Status inválido.'),
    body('commissionRate')
      .optional({ checkFalsy: true })
      .isFloat({ min: 0, max: 100 })
      .withMessage('Comissão deve estar entre 0 e 100.')
  ],
  validateRequest,
  driverController.updateDriver
);

module.exports = router;
