const { createModel } = require('../lib/supabaseModel');
const { DRIVER_STATUS, FINANCIAL } = require('../utils/constants');

const DriverProfile = createModel({
  name: 'DriverProfile',
  table: 'driver_profiles',
  collection: 'driverprofiles',
  mapping: {
    _id: 'id',
    id: 'id',
    user: 'user_id',
    vehicle_plate: 'vehicle_plate',
    status: 'status',
    commissionRate: 'commission_rate',
    lastLocation: 'last_location',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  defaults: {
    status: DRIVER_STATUS.OFFLINE,
    commissionRate: FINANCIAL.DEFAULT_COMMISSION_RATE,
    vehicle_plate: '',
    lastLocation: null
  },
  relations: {
    user: {
      model: () => require('./User'),
      localField: 'user',
      foreignField: '_id',
      single: true
    }
  }
});

module.exports = DriverProfile;
