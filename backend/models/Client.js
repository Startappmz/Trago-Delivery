const { createModel } = require('../lib/supabaseModel');
const { CLIENT_BILLING_TYPES } = require('../utils/constants');

const Client = createModel({
  name: 'Client',
  table: 'clients',
  collection: 'clients',
  mapping: {
    _id: 'id',
    id: 'id',
    nome: 'nome',
    telefone: 'telefone',
    email: 'email',
    empresa: 'empresa',
    nuit: 'nuit',
    endereco: 'endereco',
    billing_type: 'billing_type',
    credit_limit: 'credit_limit',
    credit_balance: 'credit_balance',
    credit_used: 'credit_used',
    created_by_admin: 'created_by_admin',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  defaults: {
    email: '',
    empresa: '',
    nuit: '',
    endereco: '',
    billing_type: CLIENT_BILLING_TYPES.PREPAID,
    credit_limit: 0,
    credit_balance: 0,
    credit_used: 0
  },
  relations: {
    created_by_admin: {
      model: () => require('./User'),
      localField: 'created_by_admin',
      foreignField: '_id',
      single: true
    }
  }
});

module.exports = Client;
