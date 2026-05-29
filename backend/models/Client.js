const { createModel } = require('../lib/supabaseModel');

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
    created_by_admin: 'created_by_admin',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  defaults: {
    email: '',
    empresa: '',
    nuit: '',
    endereco: ''
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
