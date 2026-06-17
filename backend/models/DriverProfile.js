const { createModel } = require('../lib/supabaseModel');
const { DRIVER_STATUS, DRIVER_TYPES, FINANCIAL } = require('../utils/constants');

const DriverProfile = createModel({
  name: 'DriverProfile',
  table: 'driver_profiles',
  collection: 'driverprofiles',
  mapping: {
    _id: 'id',
    id: 'id',
    user: 'user_id',
    vehicle_plate: 'vehicle_plate',
    vehicle: 'vehicle_id',
    driverType: 'driver_type',
    status: 'status',
    commissionRate: 'commission_rate',
    lastLocation: 'last_location',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  defaults: {
    status: DRIVER_STATUS.OFFLINE,
    driverType: DRIVER_TYPES.FREELANCER,
    commissionRate: FINANCIAL.DEFAULT_COMMISSION_RATE,
    vehicle_plate: '',
    vehicle: null,
    lastLocation: null
  },
  relations: {
    user: {
      model: () => require('./User'),
      localField: 'user',
      foreignField: '_id',
      single: true
    },
    vehicle: {
      model: () => require('./Vehicle'),
      localField: 'vehicle',
      foreignField: '_id',
      single: true
    }
  }
});

module.exports = DriverProfile;
