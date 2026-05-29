const express = require('express');
const { body, param } = require('express-validator');
const clientController = require('../controllers/clientController');
const { protect, admin } = require('../middleware/authMiddleware');
const { validateRequest } = require('../middleware/validateRequest');

const router = express.Router();

router.post(
  '/',
  protect,
  admin,
  [
    body('nome', 'O nome do cliente é obrigatório').trim().notEmpty(),
    body('telefone', 'O telefone é obrigatório (mín. 9 dígitos)').trim().isLength({ min: 9 }),
    body('email', 'Por favor, insira um email válido').optional({ checkFalsy: true }).isEmail(),
    body('empresa').optional({ checkFalsy: true }).trim(),
    body('nuit').optional({ checkFalsy: true }).trim(),
    body('endereco').optional({ checkFalsy: true }).trim()
  ],
  validateRequest,
  clientController.createClient
);

router.get('/', protect, admin, clientController.getAllClients);

router.get(
  '/:id',
  protect,
  admin,
  [param('id', 'ID de cliente inválido').isMongoId()],
  validateRequest,
  clientController.getClientById
);

router.put(
  '/:id',
  protect,
  admin,
  [
    param('id', 'ID de cliente inválido').isMongoId(),
    body('nome', 'O nome do cliente é obrigatório').trim().notEmpty(),
    body('telefone', 'O telefone é obrigatório (mín. 9 dígitos)').trim().isLength({ min: 9 }),
    body('email', 'Por favor, insira um email válido').optional({ checkFalsy: true }).isEmail()
  ],
  validateRequest,
  clientController.updateClient
);

router.delete(
  '/:id',
  protect,
  admin,
  [param('id', 'ID de cliente inválido').isMongoId()],
  validateRequest,
  clientController.deleteClient
);

router.get(
  '/:id/statement',
  protect,
  admin,
  [
    param('id', 'ID de cliente inválido').isMongoId(),
    body('startDate').optional()
  ],
  clientController.getStatement
);

module.exports = router;