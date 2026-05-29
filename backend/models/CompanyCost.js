const { createModel } = require('../lib/supabaseModel');

const COMPANY_COST_CATEGORIES = [
  'salarios',
  'renda',
  'manutencao',
  'comunicacao',
  'marketing',
  'combustivel',
  'diversos'
];

const CompanyCost = createModel({
  name: 'CompanyCost',
  table: 'company_costs',
  collection: 'companycosts',
  mapping: {
    _id: 'id',
    id: 'id',
    category: 'category',
    description: 'description',
    amount: 'amount',
    date: 'date',
    createdBy: 'created_by',
    assignedUser: 'assigned_user',
    assignedClient: 'assigned_client',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  defaults: {
    description: '',
    amount: 0,
    assignedUser: null,
    assignedClient: null
  },
  relations: {
    createdBy: {
      model: () => require('./User'),
      localField: 'createdBy',
      foreignField: '_id',
      single: true
    },
    assignedUser: {
      model: () => require('./User'),
      localField: 'assignedUser',
      foreignField: '_id',
      single: true
    },
    assignedClient: {
      model: () => require('./Client'),
      localField: 'assignedClient',
      foreignField: '_id',
      single: true
    }
  }
});

CompanyCost.CATEGORIES = COMPANY_COST_CATEGORIES;

module.exports = CompanyCost;
module.exports.COMPANY_COST_CATEGORIES = COMPANY_COST_CATEGORIES;
