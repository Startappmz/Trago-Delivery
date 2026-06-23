const { createModel } = require('../lib/supabaseModel');

const Restaurant = createModel({
  name: 'Restaurant',
  table: 'restaurants',
  collection: 'restaurants',
  mapping: {
    _id: 'id',
    id: 'id',
    name: 'name',
    email: 'email',
    phone: 'phone',
    password_hash: 'password_hash',
    address_text: 'address_text',
    address_coords: 'address_coords',
    logo_url: 'logo_url',
    cover_url: 'cover_url',
    status: 'status',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  defaults: {
    phone: '',
    address_text: '',
    logo_url: '',
    cover_url: '',
    status: 'active'
  }
});

module.exports = Restaurant;
