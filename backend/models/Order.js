const { createModel } = require('../lib/supabaseModel');
const { ORDER_STATUS } = require('../utils/constants');

const Order = createModel({
  name: 'Order',
  table: 'orders',
  collection: 'orders',
  mapping: {
    _id: 'id',
    id: 'id',
    service_type: 'service_type',
    price: 'price',
    client_name: 'client_name',
    client_phone1: 'client_phone1',
    client_phone2: 'client_phone2',
    address_text: 'address_text',
    address_coords: 'address_coords',
    pickup_address_text: 'pickup_address_text',
    pickup_address_coords: 'pickup_address_coords',
    service_price: 'service_price',
    delivery_fee: 'delivery_fee',
    route_distance_km: 'route_distance_km',
    route_duration_min: 'route_duration_min',
    route_pricing_source: 'route_pricing_source',
    image_url: 'image_url',
    verification_code: 'verification_code',
    created_by_admin: 'created_by_admin',
    assigned_to_driver: 'assigned_to_driver',
    client: 'client',
    status: 'status',
    timestamp_started: 'timestamp_started',
    timestamp_completed: 'timestamp_completed',
    pickupStartAt: 'pickup_start_at',
    pickupCompletedAt: 'pickup_completed_at',
    deliveryStartAt: 'delivery_start_at',
    deliveryCompletedAt: 'delivery_completed_at',
    cancelledAt: 'cancelled_at',
    cancelledBy: 'cancelled_by',
    cancelReason: 'cancel_reason',
    valor_motorista: 'valor_motorista',
    valor_empresa: 'valor_empresa',
    payment_method: 'payment_method',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  defaults: {
    status: ORDER_STATUS.PENDING,
    price: 0,
    service_price: 0,
    delivery_fee: 0,
    route_distance_km: 0,
    valor_motorista: 0,
    valor_empresa: 0,
    payment_method: 'cash'
  },
  relations: {
    created_by_admin: {
      model: () => require('./User'),
      localField: 'created_by_admin',
      foreignField: '_id',
      single: true
    },
    assigned_to_driver: {
      model: () => require('./DriverProfile'),
      localField: 'assigned_to_driver',
      foreignField: '_id',
      single: true
    },
    client: {
      model: () => require('./Client'),
      localField: 'client',
      foreignField: '_id',
      single: true
    },
    cancelledBy: {
      model: () => require('./User'),
      localField: 'cancelledBy',
      foreignField: '_id',
      single: true
    }
  }
});

module.exports = Order;
