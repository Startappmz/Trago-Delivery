const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { protect, admin, driver  } = require('../middleware/authMiddleware');
const { validateRequest } = require('../middleware/validateRequest');

const router = express.Router();

const { getMe } = require('../controllers/authController');

router.get('/me', protect, getMe);

router.post(
  '/register-driver',
  protect,
  admin,
  [
    body('nome', 'O nome é obrigatório').trim().notEmpty(),
    body('email', 'Por favor, insira um email válido').isEmail(),
    body('telefone', 'O telefone é obrigatório (mín. 9 dígitos)').trim().isLength({ min: 9 }),
    body('password', 'A senha deve ter pelo menos 6 caracteres').isLength({ min: 6 }),
    body('vehicle_plate').optional({ checkFalsy: true }).trim(),
    body('commissionRate', 'A comissão deve ser um número entre 0 e 100')
      .optional({ checkFalsy: true })
      .isFloat({ min: 0, max: 100 })
  ],
  validateRequest,
  authController.registerDriver
);

router.post(
  '/login',
  [
    body('email', 'O email é obrigatório').isEmail(),
    body('password', 'A senha é obrigatória').notEmpty(),
    body('role', 'O tipo de utilizador (role) é obrigatório').isIn(['admin', 'driver'])
  ],
  validateRequest,
  authController.login
);

router.post('/logout', protect, authController.logout);

router.put(
  '/change-password',
  protect,
  [
    body('senhaAntiga', 'A senha antiga é obrigatória').notEmpty(),
    body('senhaNova', 'A nova senha deve ter pelo menos 6 caracteres').isLength({ min: 6 })
  ],
  validateRequest,
  authController.changePassword
);

module.exports = router;