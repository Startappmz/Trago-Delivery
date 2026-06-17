// Trago Delivery · Supabase Edge Function API
// Mantém compatibilidade com as rotas /api/... do front-end antigo,
// substituindo Express/Render por Supabase Edge Functions + Postgres + Storage + Realtime.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import bcrypt from 'https://esm.sh/bcryptjs@2.4.3';
import { create, getNumericDate, verify } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';

// IMPORTANTE:
// O Dashboard da Supabase não permite criar secrets personalizadas com o prefixo SUPABASE_.
// Por isso, usamos nomes próprios do projecto: TRAGO_SUPABASE_URL e TRAGO_SUPABASE_SECRET_KEY.
const SUPABASE_URL = Deno.env.get('TRAGO_SUPABASE_URL') || Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SECRET_KEY =
  Deno.env.get('TRAGO_SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Deno.env.get('SERVICE_ROLE_KEY') ||
  '';
const JWT_SECRET = Deno.env.get('JWT_SECRET') || '';
const JWT_DAYS = Number(Deno.env.get('JWT_DAYS') || '30');
const STORAGE_BUCKET = Deno.env.get('STORAGE_BUCKET_ORDER_IMAGES') || 'order-images';
const MAX_IMAGE_BYTES = Number(Deno.env.get('UPLOAD_IMAGE_MAX_SIZE') || String(5 * 1024 * 1024));
const TRAGO_ORS_API_KEY = Deno.env.get('TRAGO_ORS_API_KEY') || '';
const ROUTE_PRICING_POLICY = Object.freeze({
  baseDistanceKm: Number(Deno.env.get('TRAGO_BASE_DISTANCE_KM') || '11.6'),
  baseFeeMzn: Number(Deno.env.get('TRAGO_BASE_DISTANCE_FEE_MZN') || '200'),
  extraKmFeeMzn: Number(Deno.env.get('TRAGO_EXTRA_KM_FEE_MZN') || '15')
});

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !JWT_SECRET) {
  console.warn('[trago-edge] Variáveis obrigatórias em falta: TRAGO_SUPABASE_URL, TRAGO_SUPABASE_SECRET_KEY, JWT_SECRET.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

type Role = 'admin' | 'driver' | 'manager';
type AnyRecord = Record<string, any>;

const DRIVER_STATUS = Object.freeze({
  ONLINE_FREE: 'online_livre',
  ONLINE_BUSY: 'online_ocupado',
  PICKUP: 'em_recolha',
  DELIVERY: 'em_entrega',
  OFFLINE: 'offline'
});

const DRIVER_TYPES = Object.freeze({
  FREELANCER: 'freelancer',
  OFFICIAL: 'official'
});

const ORDER_STATUS = Object.freeze({
  PENDING: 'pendente',
  ASSIGNED: 'atribuido',
  IN_PROGRESS: 'em_progresso',
  PICKUP_IN_PROGRESS: 'recolha_em_progresso',
  PICKUP_DONE: 'recolha_concluida',
  DELIVERY_IN_PROGRESS: 'entrega_em_progresso',
  COMPLETED: 'concluido',
  CANCELED: 'cancelado'
});

const ADMIN_ROOM = 'admin_room';
const PAYMENT_STATUS = Object.freeze({
  UNPAID: 'nao_pago',
  AWAITING_DRIVER_CONFIRMATION: 'aguardando_confirmacao_pagamento',
  PAID: 'pago',
  POSTPAID_MONTHLY: 'pos_pago_mensal'
});

const CLIENT_BILLING_TYPES = Object.freeze({
  PREPAID: 'prepaid',
  POSTPAID: 'postpaid'
});

const ALLOWED_PAYMENT_METHODS = new Set(['cash', 'mpesa', 'emola', 'mkesh', 'bank_transfer', 'pos', 'postpaid_credit']);
const ONLINE_DRIVER_STATUSES = [
  DRIVER_STATUS.ONLINE_FREE,
  DRIVER_STATUS.ONLINE_BUSY,
  DRIVER_STATUS.PICKUP,
  DRIVER_STATUS.DELIVERY
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Credentials': 'true'
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const json = (body: unknown, status = 200, extraHeaders: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders
    }
  });

const textResponse = (body: string, status = 200, headers: HeadersInit = {}) =>
  new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      ...headers
    }
  });

const normalizePath = (requestUrl: string) => {
  const url = new URL(requestUrl);
  const parts = url.pathname.split('/').filter(Boolean);
  const functionIndex = parts.findIndex((part, index) => part === 'api' && parts[index - 1] === 'v1');

  let pathParts: string[];
  if (functionIndex >= 0) {
    pathParts = parts.slice(functionIndex + 1);
  } else if (parts[0] === 'api' && parts[1] === 'api') {
    pathParts = parts.slice(1);
  } else {
    pathParts = parts;
  }

  const path = `/${pathParts.join('/')}`.replace(/\/+/g, '/');
  return path === '/' ? '/health' : path;
};

const isValidId = (id: unknown) => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id);
const generateId = () => Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => b.toString(16).padStart(2, '0')).join('');
const nowIso = () => new Date().toISOString();
const toNumber = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clean = (value: unknown) => typeof value === 'string' ? value.trim() : value;
const lowerEmail = (value: unknown) => String(value || '').trim().toLowerCase();

const paymentMethodLabel = (method: unknown) => ({
  cash: 'Dinheiro',
  mpesa: 'M-Pesa',
  emola: 'e-Mola',
  mkesh: 'mKesh',
  bank_transfer: 'Transferência bancária',
  pos: 'POS',
  postpaid_credit: 'Cliente Pós-pago / Crédito'
})[String(method || '')] || String(method || '—');

const requiresImmediatePayment = (order: AnyRecord) => String(order.payment_method || '') !== 'postpaid_credit';

const makeJwtKey = async () => crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(JWT_SECRET),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign', 'verify']
);

const generateToken = async (user: AnyRecord) => {
  const key = await makeJwtKey();
  return create(
    { alg: 'HS256', typ: 'JWT' },
    {
      user: {
        id: user.id,
        role: user.role,
        nome: user.nome
      },
      exp: getNumericDate(JWT_DAYS * 24 * 60 * 60)
    },
    key
  );
};

const readToken = (req: Request) => {
  const auth = req.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);

  const cookie = req.headers.get('cookie') || '';
  const tokenCookie = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('token='));
  return tokenCookie ? decodeURIComponent(tokenCookie.slice('token='.length)) : null;
};

const verifyToken = async (token: string) => {
  const key = await makeJwtKey();
  return verify(token, key) as Promise<AnyRecord>;
};

const requiredFields = (payload: AnyRecord, fields: string[]) => {
  for (const field of fields) {
    if (payload[field] === undefined || payload[field] === null || String(payload[field]).trim() === '') {
      throw new HttpError(400, `Campo obrigatório em falta: ${field}`);
    }
  }
};

const readBody = async (req: Request) => {
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) return req.formData();
  if (contentType.includes('application/json')) return req.json().catch(() => ({}));
  const text = await req.text().catch(() => '');
  if (!text) return {};
  try { return JSON.parse(text); } catch { return Object.fromEntries(new URLSearchParams(text)); }
};

const parseQuery = (req: Request) => Object.fromEntries(new URL(req.url).searchParams.entries());

const getPeriodRange = (periodRaw: unknown) => {
  const key = ['day', 'week', 'month'].includes(String(periodRaw || '')) ? String(periodRaw) : 'month';
  const start = new Date();
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);

  if (key === 'day') {
    start.setUTCHours(0, 0, 0, 0);
  } else if (key === 'week') {
    const day = start.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    start.setUTCDate(start.getUTCDate() + mondayOffset);
    start.setUTCHours(0, 0, 0, 0);
  } else {
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
  }

  const label = key === 'day' ? 'Hoje' : key === 'week' ? 'Esta Semana' : 'Este Mês';
  return { key, label, start, end };
};

const requireUser = async (req: Request, allowedRoles?: Role | Role[]) => {
  const token = readToken(req);
  if (!token) throw new HttpError(401, 'Não autorizado, token em falta');

  let decoded: AnyRecord;
  try {
    decoded = await verifyToken(token);
  } catch (_err) {
    throw new HttpError(401, 'Sessão inválida ou expirada');
  }

  const userId = decoded?.user?.id;
  if (!userId) throw new HttpError(401, 'Sessão inválida ou expirada');

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  if (!user) throw new HttpError(401, 'Não autorizado, utilizador inexistente');

  const roles = Array.isArray(allowedRoles) ? allowedRoles : allowedRoles ? [allowedRoles] : [];
  if (roles.length && !roles.includes(user.role)) {
    throw new HttpError(403, roles.includes('admin') ? 'Acesso restrito a administradores' : 'Acesso restrito');
  }

  return fromUser(user);
};

const fromUser = (row: AnyRecord, includePassword = false) => {
  if (!row) return null;
  const user: AnyRecord = {
    _id: row.id,
    id: row.id,
    nome: row.nome,
    email: row.email,
    telefone: row.telefone,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (includePassword) user.password = row.password;
  return user;
};

const fromClient = (row: AnyRecord) => row ? ({
  _id: row.id,
  id: row.id,
  nome: row.nome,
  telefone: row.telefone,
  email: row.email || '',
  empresa: row.empresa || '',
  nuit: row.nuit || '',
  endereco: row.endereco || '',
  billing_type: row.billing_type || CLIENT_BILLING_TYPES.PREPAID,
  credit_limit: Number(row.credit_limit || 0),
  credit_balance: Number(row.credit_balance || 0),
  credit_used: Number(row.credit_used || 0),
  credit: {
    limit: Number(row.credit_limit || 0),
    balance: Number(row.credit_balance || 0),
    used: Number(row.credit_used || 0)
  },
  created_by_admin: row.created_by_admin,
  createdAt: row.created_at,
  updatedAt: row.updated_at
}) : null;

const fromProfile = (row: AnyRecord) => row ? ({
  _id: row.id,
  id: row.id,
  user: row.user_id,
  vehicle_plate: row.vehicle_plate || '',
  vehicle_id: row.vehicle_id || null,
  driver_type: row.driver_type || DRIVER_TYPES.FREELANCER,
  driverType: row.driver_type || DRIVER_TYPES.FREELANCER,
  status: row.status,
  commissionRate: String(row.driver_type || DRIVER_TYPES.FREELANCER) === DRIVER_TYPES.OFFICIAL ? 0 : Number(row.commission_rate ?? 20),
  lastLocation: row.last_location,
  createdAt: row.created_at,
  updatedAt: row.updated_at
}) : null;

const fromOrder = (row: AnyRecord) => row ? ({
  _id: row.id,
  id: row.id,
  service_type: row.service_type,
  price: Number(row.price || 0),
  client_name: row.client_name,
  client_phone1: row.client_phone1,
  client_phone2: row.client_phone2,
  address_text: row.address_text,
  address_coords: row.address_coords,
  pickup_address_text: row.pickup_address_text,
  pickup_address_coords: row.pickup_address_coords,
  pickup_contact_name: row.pickup_contact_name || '',
  pickup_contact_phone: row.pickup_contact_phone || '',
  pickup_notes: row.pickup_notes || '',
  service_price: Number(row.service_price || 0),
  delivery_fee: Number(row.delivery_fee || 0),
  route_distance_km: row.route_distance_km != null ? Number(row.route_distance_km) : null,
  route_duration_min: row.route_duration_min != null ? Number(row.route_duration_min) : null,
  route_pricing_source: row.route_pricing_source,
  image_url: row.image_url,
  verification_code: row.verification_code,
  created_by_admin: row.created_by_admin,
  assigned_to_driver: row.assigned_to_driver,
  client: row.client,
  status: row.status,
  timestamp_started: row.timestamp_started,
  timestamp_completed: row.timestamp_completed,
  pickupStartAt: row.pickup_start_at,
  pickupCompletedAt: row.pickup_completed_at,
  deliveryStartAt: row.delivery_start_at,
  deliveryCompletedAt: row.delivery_completed_at,
  cancelledAt: row.cancelled_at,
  cancelledBy: row.cancelled_by,
  cancelReason: row.cancel_reason,
  valor_motorista: Number(row.valor_motorista || 0),
  valor_empresa: Number(row.valor_empresa || 0),
  payment_method: row.payment_method || 'cash',
  payment_status: row.payment_status || PAYMENT_STATUS.UNPAID,
  payment_confirmed_amount: row.payment_confirmed_amount != null ? Number(row.payment_confirmed_amount) : null,
  payment_confirmation_requested_at: row.payment_confirmation_requested_at,
  payment_confirmed_at: row.payment_confirmed_at,
  driver_delivery_notes: row.driver_delivery_notes || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at
}) : null;

const fromExpense = (row: AnyRecord) => row ? ({
  _id: row.id,
  id: row.id,
  category: row.category,
  description: row.description,
  amount: Number(row.amount || 0),
  date: row.date,
  employee: row.employee,
  created_by: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at
}) : null;

const fromCost = (row: AnyRecord) => row ? ({
  _id: row.id,
  id: row.id,
  category: row.category,
  description: row.description || '',
  amount: Number(row.amount || 0),
  date: row.date,
  createdBy: row.created_by,
  assignedUser: row.assigned_user,
  assignedClient: row.assigned_client,
  assignedVehicle: row.assigned_vehicle,
  createdAt: row.created_at,
  updatedAt: row.updated_at
}) : null;

const fromVehicle = (row: AnyRecord) => row ? ({
  _id: row.id,
  id: row.id,
  plate: row.plate || '',
  brand: row.brand || '',
  model: row.model || '',
  type: row.type || 'mota',
  status: row.status || 'ativo',
  notes: row.notes || '',
  created_by: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at
}) : null;

const fromTrip = (row: AnyRecord) => row ? ({
  _id: row.id,
  id: row.id,
  driver: row.driver,
  order: row.order_id,
  type: row.type,
  status: row.status,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  origin: row.origin,
  destination: row.destination,
  positions: row.positions || [],
  metrics: row.metrics || { distance: 0, duration: 0, avgSpeed: 0, maxSpeed: 0 },
  notes: row.notes || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at
}) : null;

const fromNotification = (row: AnyRecord) => row ? ({
  _id: row.id,
  id: row.id,
  scope: row.scope || 'admin',
  type: row.type || 'info',
  title: row.title || 'Notificação',
  message: row.message || '',
  orderId: row.order_id || null,
  orderCode: row.order_code || '',
  verificationCode: row.verification_code || '',
  payload: row.payload || {},
  readAt: row.read_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at
}) : null;

const selectOne = async (table: string, column: string, value: unknown) => {
  const { data, error } = await supabase.from(table).select('*').eq(column, value).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  return data;
};

const selectMany = async (table: string) => {
  const { data, error } = await supabase.from(table).select('*');
  if (error) throw new HttpError(500, error.message);
  return data || [];
};

const insertRow = async (table: string, payload: AnyRecord) => {
  const row = { id: payload.id || generateId(), ...payload };
  const { data, error } = await supabase.from(table).insert(row).select('*').single();
  if (error) throw new HttpError(400, error.message);
  return data;
};

const updateRow = async (table: string, id: string, payload: AnyRecord) => {
  const { data, error } = await supabase
    .from(table)
    .update({ ...payload, updated_at: nowIso() })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw new HttpError(400, error.message);
  if (!data) throw new HttpError(404, 'Registo não encontrado.');
  return data;
};

const deleteRow = async (table: string, id: string) => {
  const { data, error } = await supabase.from(table).delete().eq('id', id).select('*').maybeSingle();
  if (error) throw new HttpError(400, error.message);
  return data;
};

const countRows = async (table: string, mutator?: (q: any) => any) => {
  let query = supabase.from(table).select('id', { count: 'exact', head: true });
  if (mutator) query = mutator(query);
  const { count, error } = await query;
  if (error) throw new HttpError(500, error.message);
  return count || 0;
};

const getDriverProfileByUser = async (userId: string) => selectOne('driver_profiles', 'user_id', userId);

const enrichDriverUser = async (userRow: AnyRecord) => {
  const user = fromUser(userRow);
  const profileRow = await getDriverProfileByUser(userRow.id);
  user.profile = fromProfile(profileRow);
  return user;
};

const enrichProfile = async (profileRow: AnyRecord, withUser = true) => {
  const profile = fromProfile(profileRow);
  if (profile && withUser && profileRow.user_id) profile.user = fromUser(await selectOne('users', 'id', profileRow.user_id));
  return profile;
};

const enrichOrder = async (row: AnyRecord) => {
  const order = fromOrder(row);
  if (!order) return null;

  if (row.created_by_admin) order.created_by_admin = fromUser(await selectOne('users', 'id', row.created_by_admin));
  if (row.client) order.client = fromClient(await selectOne('clients', 'id', row.client));
  if (row.cancelled_by) order.cancelledBy = fromUser(await selectOne('users', 'id', row.cancelled_by));
  if (row.assigned_to_driver) {
    const profileRow = await selectOne('driver_profiles', 'id', row.assigned_to_driver);
    order.assigned_to_driver = await enrichProfile(profileRow, true);
  }
  return order;
};

const enrichCost = async (row: AnyRecord) => {
  const cost = fromCost(row);
  if (!cost) return null;
  if (row.assigned_user) cost.assignedUser = fromUser(await selectOne('users', 'id', row.assigned_user));
  if (row.assigned_client) cost.assignedClient = fromClient(await selectOne('clients', 'id', row.assigned_client));
  if (row.assigned_vehicle) cost.assignedVehicle = fromVehicle(await selectOne('vehicles', 'id', row.assigned_vehicle));
  return cost;
};

const broadcast = async (channelName: string, event: string, payload: AnyRecord) => {
  try {
    const channel = supabase.channel(channelName, { config: { broadcast: { self: false } } });
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1200);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    await channel.send({ type: 'broadcast', event, payload });
    await supabase.removeChannel(channel);
  } catch (error) {
    console.warn(`[trago-edge] Falha ao emitir Realtime ${channelName}:${event}`, error);
  }
};

const broadcastAdmin = (event: string, payload: AnyRecord = {}) => broadcast(ADMIN_ROOM, event, payload);
const broadcastDriver = (userId: string, event: string, payload: AnyRecord = {}) => broadcast(`driver:${userId}`, event, payload);

const shortOrderCode = (orderId: unknown) => {
  const raw = String(orderId || '').trim();
  return raw ? `#${raw.slice(-6).toUpperCase()}` : '—';
};

const createAdminNotification = async ({
  dedupeKey,
  type = 'info',
  title = 'Notificação',
  message = '',
  order = null,
  orderId = null,
  orderCode = '',
  verificationCode = '',
  payload = {},
  createdAt = null
}: AnyRecord) => {
  try {
    const effectiveOrderId = orderId || order?.id || null;
    const record = {
      id: generateId(),
      scope: 'admin',
      dedupe_key: String(dedupeKey || `${type}:${effectiveOrderId || Date.now()}`).slice(0, 180),
      type: String(type || 'info').slice(0, 40),
      title: String(title || 'Notificação').slice(0, 120),
      message: String(message || '').slice(0, 500),
      order_id: effectiveOrderId,
      order_code: orderCode || shortOrderCode(effectiveOrderId),
      verification_code: verificationCode || order?.verification_code || '',
      payload: payload || {},
      created_at: createdAt || nowIso()
    };
    const { error } = await supabase
      .from('system_notifications')
      .upsert(record, { onConflict: 'dedupe_key', ignoreDuplicates: true });
    if (error) console.warn('[trago-edge] Notificação não persistida:', error.message);
  } catch (error) {
    console.warn('[trago-edge] Falha ao persistir notificação:', error);
  }
};

const syncOperationalNotifications = async () => {
  try {
    const { data: pendingOrders } = await supabase
      .from('orders')
      .select('*')
      .eq('status', ORDER_STATUS.PENDING)
      .order('created_at', { ascending: false })
      .limit(25);

    for (const order of pendingOrders || []) {
      await createAdminNotification({
        dedupeKey: `new_order:${order.id}`,
        type: 'order',
        title: 'Novo pedido recebido',
        message: `Pedido ${shortOrderCode(order.id)} · ${order.client_name || 'Cliente'} aguarda atribuição.`,
        order,
        payload: { clientName: order.client_name, amount: Number(order.price || 0), paymentMethod: order.payment_method },
        createdAt: order.created_at || nowIso()
      });
    }

    const { data: paymentOrders } = await supabase
      .from('orders')
      .select('*')
      .eq('payment_status', PAYMENT_STATUS.AWAITING_DRIVER_CONFIRMATION)
      .order('payment_confirmation_requested_at', { ascending: false, nullsFirst: false })
      .limit(50);

    for (const order of paymentOrders || []) {
      await createAdminNotification({
        dedupeKey: `payment_pending:${order.id}`,
        type: 'payment',
        title: 'Pagamento por confirmar',
        message: `Pedido ${shortOrderCode(order.id)} · Código ${order.verification_code || '—'} · confirmar ${Number(order.price || 0).toFixed(2)} MZN.`,
        order,
        payload: { clientName: order.client_name, amount: Number(order.price || 0), paymentMethod: order.payment_method },
        createdAt: order.payment_confirmation_requested_at || order.updated_at || nowIso()
      });
    }
  } catch (error) {
    console.warn('[trago-edge] Falha ao sincronizar notificações operacionais:', error);
  }
};

const buildLocationPayload = (profileRow: AnyRecord, userRow: AnyRecord) => {
  const loc = profileRow.last_location || {};
  return {
    driverId: profileRow.id,
    driverUserId: profileRow.user_id,
    driverName: userRow?.nome || 'Motorista',
    telefone: userRow?.telefone,
    status: profileRow.status || DRIVER_STATUS.ONLINE_FREE,
    lat: Number(loc.lat),
    lng: Number(loc.lng),
    accuracy: loc.accuracy,
    speed: loc.speed,
    updatedAt: loc.updatedAt
  };
};

const normalizeCoordinates = (lat: unknown, lng: unknown) => {
  if (lat === undefined || lng === undefined || lat === null || lng === null || lat === '' || lng === '') return null;
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return null;
  return { lat: parsedLat, lng: parsedLng };
};

const isValidCoordinate = (coord: AnyRecord | null | undefined) => Boolean(coord && Number.isFinite(Number(coord.lat)) && Number.isFinite(Number(coord.lng)));

const calculateDeliveryFee = (distanceKm: number) => {
  const distance = Math.max(0, Number(distanceKm) || 0);
  if (distance <= ROUTE_PRICING_POLICY.baseDistanceKm) return ROUTE_PRICING_POLICY.baseFeeMzn;
  const extraKm = Math.ceil(distance - ROUTE_PRICING_POLICY.baseDistanceKm);
  return ROUTE_PRICING_POLICY.baseFeeMzn + (extraKm * ROUTE_PRICING_POLICY.extraKmFeeMzn);
};

const haversineKm = (origin: AnyRecord, destination: AnyRecord) => {
  const R = 6371;
  const dLat = (Number(destination.lat) - Number(origin.lat)) * Math.PI / 180;
  const dLng = (Number(destination.lng) - Number(origin.lng)) * Math.PI / 180;
  const lat1 = Number(origin.lat) * Math.PI / 180;
  const lat2 = Number(destination.lat) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const quoteWithOpenRouteService = async (origin: AnyRecord, destination: AnyRecord) => {
  if (!TRAGO_ORS_API_KEY) return null;
  const url = new URL('https://api.openrouteservice.org/v2/directions/driving-car');
  url.searchParams.set('api_key', TRAGO_ORS_API_KEY);
  // OpenRouteService usa longitude,latitude.
  url.searchParams.set('start', `${Number(origin.lng)},${Number(origin.lat)}`);
  url.searchParams.set('end', `${Number(destination.lng)},${Number(destination.lat)}`);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json, application/geo+json' }
  });
  if (!response.ok) return null;

  const data = await response.json();
  const summary = data?.features?.[0]?.properties?.summary;
  if (!summary || !Number.isFinite(Number(summary.distance))) return null;

  return {
    distance_km: Number(summary.distance) / 1000,
    duration_min: Number.isFinite(Number(summary.duration)) ? Math.max(1, Math.round(Number(summary.duration) / 60)) : null,
    source: 'openrouteservice'
  };
};


const routeWithOpenRouteService = async (origin: AnyRecord, destination: AnyRecord) => {
  if (!TRAGO_ORS_API_KEY) return null;
  const url = new URL('https://api.openrouteservice.org/v2/directions/driving-car');
  url.searchParams.set('api_key', TRAGO_ORS_API_KEY);
  url.searchParams.set('start', `${Number(origin.lng)},${Number(origin.lat)}`);
  url.searchParams.set('end', `${Number(destination.lng)},${Number(destination.lat)}`);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json, application/geo+json' }
  });
  if (!response.ok) return null;

  const data = await response.json();
  const feature = data?.features?.[0];
  const summary = feature?.properties?.summary;
  const geometry = feature?.geometry;
  if (!summary || !geometry || !Array.isArray(geometry.coordinates)) return null;

  return {
    geometry,
    distance_km: Number(summary.distance) / 1000,
    duration_min: Number.isFinite(Number(summary.duration)) ? Math.max(1, Math.round(Number(summary.duration) / 60)) : null,
    source: 'openrouteservice'
  };
};

const buildRouteGeometry = async (origin: AnyRecord, destination: AnyRecord) => {
  if (!isValidCoordinate(origin) || !isValidCoordinate(destination)) {
    throw new HttpError(400, 'Coordenadas de recolha e entrega são obrigatórias.');
  }

  let route: AnyRecord | null = null;
  try {
    route = await routeWithOpenRouteService(origin, destination);
  } catch (_error) {
    route = null;
  }

  if (!route) {
    const distanceKm = haversineKm(origin, destination);
    route = {
      geometry: {
        type: 'LineString',
        coordinates: [
          [Number(origin.lng), Number(origin.lat)],
          [Number(destination.lng), Number(destination.lat)]
        ]
      },
      distance_km: distanceKm,
      duration_min: Math.max(1, Math.round((distanceKm / 35) * 60)),
      source: 'haversine_fallback'
    };
  }

  return {
    origin,
    destination,
    geometry: route.geometry,
    distance_km: Number(Number(route.distance_km).toFixed(2)),
    duration_min: route.duration_min,
    delivery_fee: calculateDeliveryFee(Number(route.distance_km)),
    source: route.source
  };
};
const buildRouteQuote = async (origin: AnyRecord, destination: AnyRecord) => {
  if (!isValidCoordinate(origin) || !isValidCoordinate(destination)) {
    throw new HttpError(400, 'Coordenadas de recolha e entrega são obrigatórias.');
  }
  let quote: AnyRecord | null = null;
  try {
    quote = await quoteWithOpenRouteService(origin, destination);
  } catch (_error) {
    quote = null;
  }
  if (!quote) {
    const distanceKm = haversineKm(origin, destination);
    quote = {
      distance_km: distanceKm,
      duration_min: Math.max(1, Math.round((distanceKm / 35) * 60)),
      source: 'haversine_fallback'
    };
  }
  const deliveryFee = calculateDeliveryFee(Number(quote.distance_km));
  return {
    distance_km: Number(Number(quote.distance_km).toFixed(2)),
    duration_min: quote.duration_min,
    delivery_fee: Number(Number(deliveryFee).toFixed(2)),
    source: quote.source,
    policy: ROUTE_PRICING_POLICY
  };
};

const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const findBestDriverProfile = async (coordinates: AnyRecord | null) => {
  if (!coordinates) return null;
  const { data, error } = await supabase
    .from('driver_profiles')
    .select('*')
    .eq('status', DRIVER_STATUS.ONLINE_FREE)
    .not('last_location', 'is', null);
  if (error) throw new HttpError(500, error.message);

  let best: AnyRecord | null = null;
  let minDistance = Infinity;
  for (const profile of data || []) {
    const loc = profile.last_location;
    if (!loc || !Number.isFinite(Number(loc.lat)) || !Number.isFinite(Number(loc.lng))) continue;
    const distance = getDistanceFromLatLonInKm(coordinates.lat, coordinates.lng, Number(loc.lat), Number(loc.lng));
    if (distance < minDistance) {
      minDistance = distance;
      best = profile;
    }
  }
  return best;
};

const generateVerificationCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const uploadOrderImage = async (file: File | null) => {
  if (!file || file.size === 0) return null;
  if (file.size > MAX_IMAGE_BYTES) throw new HttpError(400, 'Imagem acima do limite permitido.');
  if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
    throw new HttpError(400, 'Formato de imagem não suportado.');
  }

  const safeName = file.name.replace(/[^a-z0-9._-]/gi, '_').toLowerCase();
  const path = `orders/${Date.now()}-${generateId()}-${safeName}`;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false
  });
  if (error) throw new HttpError(500, `Falha ao enviar imagem para Supabase Storage: ${error.message}`);

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
};

const routeAuth = async (req: Request, path: string, method: string) => {
  if (path === '/api/auth/login' && method === 'POST') {
    const body = await readBody(req) as AnyRecord;
    requiredFields(body, ['email', 'password', 'role']);
    const role = clean(body.role) as Role;
    if (!['admin', 'driver', 'manager'].includes(role)) throw new HttpError(400, 'Tipo de utilizador inválido.');

    const email = lowerEmail(body.email);
    const { data: row, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('role', role)
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!row || !bcrypt.compareSync(String(body.password), row.password)) {
      throw new HttpError(401, 'Credenciais inválidas.');
    }

    const token = await generateToken(row);
    return json({
      message: 'Login bem-sucedido.',
      token,
      user: { _id: row.id, nome: row.nome, role: row.role }
    }, 200, {
      'Set-Cookie': `token=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${JWT_DAYS * 24 * 60 * 60}; SameSite=Strict; Secure`
    });
  }

  if (path === '/api/auth/me' && method === 'GET') {
    const user = await requireUser(req);
    return json({ id: user.id, _id: user._id, nome: user.nome, email: user.email, role: user.role });
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    const user = await requireUser(req).catch(() => null);
    if (user?.role === 'driver') await setDriverOnlineState(user.id, DRIVER_STATUS.OFFLINE);
    return json({ message: 'Sessão encerrada com sucesso.' }, 200, {
      'Set-Cookie': 'token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict; Secure'
    });
  }

  if (path === '/api/auth/change-password' && method === 'PUT') {
    const user = await requireUser(req);
    const body = await readBody(req) as AnyRecord;
    requiredFields(body, ['senhaAntiga', 'senhaNova']);
    if (String(body.senhaNova).length < 6) throw new HttpError(400, 'A nova senha deve ter pelo menos 6 caracteres.');

    const row = await selectOne('users', 'id', user.id);
    if (!row || !bcrypt.compareSync(String(body.senhaAntiga), row.password)) {
      throw new HttpError(401, 'A senha antiga está incorreta.');
    }
    const hashed = bcrypt.hashSync(String(body.senhaNova), 12);
    await updateRow('users', user.id, { password: hashed });
    const token = await generateToken({ ...row, password: hashed });
    return json({ message: 'Senha atualizada com sucesso.', token });
  }

  if (path === '/api/auth/register-driver' && method === 'POST') {
    await requireUser(req, 'admin');
    const body = await readBody(req) as AnyRecord;
    requiredFields(body, ['nome', 'email', 'telefone', 'password']);
    const email = lowerEmail(body.email);
    const exists = await selectOne('users', 'email', email);
    if (exists) throw new HttpError(400, 'Já existe um utilizador com este email.');

    const userRow = await insertRow('users', {
      nome: clean(body.nome),
      email,
      telefone: clean(body.telefone),
      password: bcrypt.hashSync(String(body.password), 12),
      role: 'driver'
    });

    const driverType = String(body.driverType || body.driver_type || DRIVER_TYPES.FREELANCER) === DRIVER_TYPES.OFFICIAL
      ? DRIVER_TYPES.OFFICIAL
      : DRIVER_TYPES.FREELANCER;
    const profileRow = await insertRow('driver_profiles', {
      user_id: userRow.id,
      vehicle_plate: clean(body.vehicle_plate) || '',
      vehicle_id: isValidId(String(body.vehicleId || body.vehicle_id || '')) ? String(body.vehicleId || body.vehicle_id) : null,
      driver_type: driverType,
      commission_rate: driverType === DRIVER_TYPES.OFFICIAL ? 0 : toNumber(body.commissionRate, 20),
      status: DRIVER_STATUS.OFFLINE
    });

    return json({
      message: 'Motorista registado com sucesso.',
      user: fromUser(userRow),
      profile: fromProfile(profileRow)
    }, 201);
  }

  return null;
};

const setDriverOnlineState = async (userId: string, status: string) => {
  const profile = await getDriverProfileByUser(userId);
  if (!profile) return null;
  const updated = await updateRow('driver_profiles', profile.id, { status });
  await broadcastAdmin('driver_status_changed', { driverId: updated.id, driverUserId: userId, newStatus: updated.status });
  if (status === DRIVER_STATUS.OFFLINE) {
    const user = await selectOne('users', 'id', userId);
    await broadcastAdmin('driver_disconnected_broadcast', {
      driverId: updated.id,
      driverUserId: userId,
      driverName: user?.nome || 'Motorista'
    });
  }
  return updated;
};

const routeRealtime = async (req: Request, path: string, method: string) => {
  if (path === '/api/realtime/driver-online' && method === 'POST') {
    const user = await requireUser(req, 'driver');
    const profile = await getDriverProfileByUser(user.id);
    if (!profile) throw new HttpError(404, 'Perfil de motorista não encontrado.');
    const status = profile.status === DRIVER_STATUS.OFFLINE ? DRIVER_STATUS.ONLINE_FREE : profile.status;
    const updated = await updateRow('driver_profiles', profile.id, { status });
    await broadcastAdmin('driver_status_changed', { driverId: updated.id, driverUserId: user.id, newStatus: updated.status });
    return json({ ok: true, profile: fromProfile(updated) });
  }

  if (path === '/api/realtime/driver-offline' && method === 'POST') {
    const user = await requireUser(req, 'driver');
    const updated = await setDriverOnlineState(user.id, DRIVER_STATUS.OFFLINE);
    return json({ ok: true, profile: fromProfile(updated) });
  }

  if (path === '/api/realtime/driver-location' && method === 'POST') {
    const user = await requireUser(req, 'driver');
    const body = await readBody(req) as AnyRecord;
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new HttpError(400, 'Coordenadas inválidas.');

    const profile = await getDriverProfileByUser(user.id);
    if (!profile) throw new HttpError(404, 'Perfil de motorista não encontrado.');

    const lastLocation = {
      lat,
      lng,
      accuracy: Number.isFinite(Number(body.accuracy)) ? Number(body.accuracy) : undefined,
      speed: Number.isFinite(Number(body.speed)) ? Number(body.speed) : undefined,
      updatedAt: nowIso()
    };
    const updated = await updateRow('driver_profiles', profile.id, { last_location: lastLocation });
    await broadcastAdmin('driver_location_broadcast', buildLocationPayload(updated, user));
    return json({ ok: true });
  }

  return null;
};

const routeDrivers = async (req: Request, path: string, method: string) => {
  if (path === '/api/drivers' && method === 'GET') {
    await requireUser(req, 'admin');
    const { data, error } = await supabase.from('users').select('*').eq('role', 'driver').order('nome', { ascending: true });
    if (error) throw new HttpError(500, error.message);
    const drivers = [];
    for (const row of data || []) drivers.push(await enrichDriverUser(row));
    return json({ drivers });
  }

  if (path === '/api/drivers/available' && method === 'GET') {
    await requireUser(req, 'admin');
    const { data, error } = await supabase.from('driver_profiles').select('*').eq('status', DRIVER_STATUS.ONLINE_FREE);
    if (error) throw new HttpError(500, error.message);
    const drivers: AnyRecord[] = [];
    for (const profile of data || []) {
      const user = await selectOne('users', 'id', profile.user_id);
      if (user?.role === 'driver') {
        drivers.push({
          _id: user.id,
          nome: user.nome,
          telefone: user.telefone,
          profile: fromProfile(profile)
        });
      }
    }
    drivers.sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
    return json({ drivers });
  }

  if (path === '/api/drivers/live-locations' && method === 'GET') {
    await requireUser(req, 'admin');
    const { data, error } = await supabase.from('driver_profiles').select('*').in('status', ONLINE_DRIVER_STATUSES).not('last_location', 'is', null);
    if (error) throw new HttpError(500, error.message);
    const drivers: AnyRecord[] = [];
    for (const profile of data || []) {
      const user = await selectOne('users', 'id', profile.user_id);
      const loc = profile.last_location || {};
      if (user?.role === 'driver' && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng))) {
        drivers.push(buildLocationPayload(profile, user));
      }
    }
    return json({ drivers });
  }

  if (path === '/api/drivers/my-earnings' && method === 'GET') {
    const user = await requireUser(req, 'driver');
    const profile = await getDriverProfileByUser(user.id);
    if (!profile) throw new HttpError(404, 'Perfil de motorista não encontrado.');
    const query = parseQuery(req);
    const range = getPeriodRange(query.period || 'month');
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('assigned_to_driver', profile.id)
      .eq('status', ORDER_STATUS.COMPLETED)
      .gte('timestamp_completed', range.start.toISOString())
      .lte('timestamp_completed', range.end.toISOString())
      .order('timestamp_completed', { ascending: false });
    if (error) throw new HttpError(500, error.message);
    const orders = (data || []).map(fromOrder);
    const isOfficial = String(profile.driver_type || DRIVER_TYPES.FREELANCER) === DRIVER_TYPES.OFFICIAL;
    return json({
      commissionRate: isOfficial ? 0 : Number(profile.commission_rate || 20),
      totalGanhos: isOfficial ? 0 : orders.reduce((sum: number, order: AnyRecord) => sum + Number(order.valor_motorista || 0), 0),
      totalOrders: orders.length,
      ordersList: isOfficial ? [] : orders,
      period: { key: range.key, label: range.label, start: range.start.toISOString(), end: range.end.toISOString() }
    });
  }

  const reportMatch = path.match(/^\/api\/drivers\/([a-f0-9]{24})\/report$/i);
  if (reportMatch && method === 'GET') {
    await requireUser(req, 'admin');
    const userId = reportMatch[1];
    const profile = await getDriverProfileByUser(userId);
    if (!profile) throw new HttpError(404, 'Perfil de motorista não encontrado.');
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('assigned_to_driver', profile.id)
      .eq('status', ORDER_STATUS.COMPLETED)
      .order('timestamp_completed', { ascending: false });
    if (error) throw new HttpError(500, error.message);
    const orders = (data || []).map(fromOrder);
    return json({ totalOrders: orders.length, orders });
  }

  const idMatch = path.match(/^\/api\/drivers\/([a-f0-9]{24})$/i);
  if (idMatch && method === 'GET') {
    await requireUser(req, 'admin');
    const row = await selectOne('users', 'id', idMatch[1]);
    if (!row || row.role !== 'driver') throw new HttpError(404, 'Motorista não encontrado.');
    return json({ driver: await enrichDriverUser(row) });
  }

  if (idMatch && method === 'PUT') {
    await requireUser(req, 'admin');
    const body = await readBody(req) as AnyRecord;
    const row = await selectOne('users', 'id', idMatch[1]);
    if (!row || row.role !== 'driver') throw new HttpError(404, 'Motorista não encontrado.');
    const user = await updateRow('users', row.id, {
      nome: clean(body.nome),
      telefone: clean(body.telefone)
    });
    let profile = await getDriverProfileByUser(row.id);
    if (profile) {
      const driverType = String(body.driverType || body.driver_type || profile.driver_type || DRIVER_TYPES.FREELANCER) === DRIVER_TYPES.OFFICIAL
        ? DRIVER_TYPES.OFFICIAL
        : DRIVER_TYPES.FREELANCER;
      profile = await updateRow('driver_profiles', profile.id, {
        vehicle_plate: clean(body.vehicle_plate) || '',
        vehicle_id: isValidId(String(body.vehicleId || body.vehicle_id || '')) ? String(body.vehicleId || body.vehicle_id) : null,
        driver_type: driverType,
        status: clean(body.status) || profile.status,
        commission_rate: driverType === DRIVER_TYPES.OFFICIAL ? 0 : toNumber(body.commissionRate, 20)
      });
    } else {
      const driverType = String(body.driverType || body.driver_type || DRIVER_TYPES.FREELANCER) === DRIVER_TYPES.OFFICIAL
        ? DRIVER_TYPES.OFFICIAL
        : DRIVER_TYPES.FREELANCER;
      profile = await insertRow('driver_profiles', {
        user_id: row.id,
        vehicle_plate: clean(body.vehicle_plate) || '',
        vehicle_id: isValidId(String(body.vehicleId || body.vehicle_id || '')) ? String(body.vehicleId || body.vehicle_id) : null,
        driver_type: driverType,
        status: clean(body.status) || DRIVER_STATUS.OFFLINE,
        commission_rate: driverType === DRIVER_TYPES.OFFICIAL ? 0 : toNumber(body.commissionRate, 20)
      });
    }
    await broadcastAdmin('driver_status_changed', { driverId: profile.id, driverUserId: row.id, newStatus: profile.status });
    return json({ message: 'Motorista atualizado com sucesso.', user: fromUser(user), profile: fromProfile(profile) });
  }

  return null;
};

const routeClients = async (req: Request, path: string, method: string) => {
  if (path === '/api/clients' && method === 'GET') {
    await requireUser(req, 'admin');
    const { data, error } = await supabase.from('clients').select('*').order('nome', { ascending: true });
    if (error) throw new HttpError(500, error.message);
    return json({ clients: (data || []).map(fromClient) });
  }

  if (path === '/api/clients' && method === 'POST') {
    const user = await requireUser(req, 'admin');
    const body = await readBody(req) as AnyRecord;
    requiredFields(body, ['nome', 'telefone']);
    const exists = await selectOne('clients', 'telefone', clean(body.telefone));
    if (exists) throw new HttpError(400, 'Um cliente com este número de telefone já existe.');
    const billingType = String(body.billing_type || CLIENT_BILLING_TYPES.PREPAID) === CLIENT_BILLING_TYPES.POSTPAID
      ? CLIENT_BILLING_TYPES.POSTPAID
      : CLIENT_BILLING_TYPES.PREPAID;
    const creditLimit = billingType === CLIENT_BILLING_TYPES.POSTPAID ? Math.max(0, toNumber(body.credit_limit, 0)) : 0;
    const row = await insertRow('clients', {
      nome: clean(body.nome),
      telefone: clean(body.telefone),
      email: clean(body.email) || '',
      empresa: clean(body.empresa) || '',
      nuit: clean(body.nuit) || '',
      endereco: clean(body.endereco) || '',
      billing_type: billingType,
      credit_limit: creditLimit,
      credit_balance: creditLimit,
      credit_used: 0,
      created_by_admin: user.id
    });
    return json({ message: 'Cliente criado com sucesso', client: fromClient(row) }, 201);
  }

  const statementMatch = path.match(/^\/api\/clients\/([a-f0-9]{24})\/statement$/i);
  if (statementMatch && method === 'GET') {
    await requireUser(req, 'admin');
    const query = parseQuery(req);
    if (!query.startDate || !query.endDate) throw new HttpError(400, 'Datas de início e fim são obrigatórias.');
    const start = new Date(query.startDate); start.setUTCHours(0, 0, 0, 0);
    const end = new Date(query.endDate); end.setUTCHours(23, 59, 59, 999);
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('client', statementMatch[1])
      .eq('status', ORDER_STATUS.COMPLETED)
      .gte('timestamp_completed', start.toISOString())
      .lte('timestamp_completed', end.toISOString())
      .order('timestamp_completed', { ascending: true });
    if (error) throw new HttpError(500, error.message);
    const ordersList = (data || []).map(fromOrder);
    return json({
      totalValue: ordersList.reduce((sum: number, order: AnyRecord) => sum + Number(order.price || 0), 0),
      totalOrders: ordersList.length,
      ordersList
    });
  }

  const idMatch = path.match(/^\/api\/clients\/([a-f0-9]{24})$/i);
  if (idMatch && method === 'GET') {
    await requireUser(req, 'admin');
    const row = await selectOne('clients', 'id', idMatch[1]);
    if (!row) throw new HttpError(404, 'Cliente não encontrado.');
    return json({ client: fromClient(row) });
  }

  if (idMatch && method === 'PUT') {
    await requireUser(req, 'admin');
    const body = await readBody(req) as AnyRecord;
    const client = await selectOne('clients', 'id', idMatch[1]);
    if (!client) throw new HttpError(404, 'Cliente não encontrado.');
    if (body.telefone && String(body.telefone) !== String(client.telefone)) {
      const phoneInUse = await selectOne('clients', 'telefone', clean(body.telefone));
      if (phoneInUse) throw new HttpError(400, 'Este novo número de telefone já está em uso.');
    }
    const billingType = String(body.billing_type || client.billing_type || CLIENT_BILLING_TYPES.PREPAID) === CLIENT_BILLING_TYPES.POSTPAID
      ? CLIENT_BILLING_TYPES.POSTPAID
      : CLIENT_BILLING_TYPES.PREPAID;
    const creditUsed = billingType === CLIENT_BILLING_TYPES.POSTPAID ? Math.max(0, toNumber(client.credit_used, 0)) : 0;
    const creditLimit = billingType === CLIENT_BILLING_TYPES.POSTPAID ? Math.max(0, toNumber(body.credit_limit, client.credit_limit || 0)) : 0;
    const row = await updateRow('clients', idMatch[1], {
      nome: clean(body.nome),
      telefone: clean(body.telefone),
      email: clean(body.email) || '',
      empresa: clean(body.empresa) || '',
      nuit: clean(body.nuit) || '',
      endereco: clean(body.endereco) || '',
      billing_type: billingType,
      credit_limit: creditLimit,
      credit_balance: billingType === CLIENT_BILLING_TYPES.POSTPAID ? Math.max(creditLimit - creditUsed, 0) : 0,
      credit_used: creditUsed
    });
    return json({ message: 'Cliente atualizado com sucesso', client: fromClient(row) });
  }

  if (idMatch && method === 'DELETE') {
    await requireUser(req, 'admin');
    const orders = await countRows('orders', (q) => q.eq('client', idMatch[1]));
    if (orders > 0) throw new HttpError(400, 'Não é possível apagar clientes com histórico de encomendas.');
    await deleteRow('clients', idMatch[1]);
    return json({ message: 'Cliente apagado com sucesso' });
  }

  return null;
};



const routeVehicles = async (req: Request, path: string, method: string) => {
  if (path === '/api/vehicles' && method === 'GET') {
    await requireUser(req, 'admin');
    const { data, error } = await supabase.from('vehicles').select('*').order('plate', { ascending: true });
    if (error) throw new HttpError(500, error.message);
    return json({ vehicles: (data || []).map(fromVehicle) });
  }

  if (path === '/api/vehicles' && method === 'POST') {
    const user = await requireUser(req, 'admin');
    const body = await readBody(req) as AnyRecord;
    requiredFields(body, ['plate']);
    const normalizedPlate = String(body.plate || '').trim().toUpperCase();
    const existing = await selectOne('vehicles', 'plate', normalizedPlate);
    if (existing) throw new HttpError(400, 'Já existe um veículo com esta matrícula.');
    const row = await insertRow('vehicles', {
      plate: normalizedPlate,
      brand: clean(body.brand) || '',
      model: clean(body.model) || '',
      type: ['mota', 'carro', 'carrinha', 'outro'].includes(String(body.type || '')) ? String(body.type) : 'mota',
      status: ['ativo', 'manutencao', 'inativo'].includes(String(body.status || '')) ? String(body.status) : 'ativo',
      notes: String(body.notes || '').trim().slice(0, 500),
      created_by: user.id
    });
    return json({ message: 'Veículo registado com sucesso.', vehicle: fromVehicle(row) }, 201);
  }

  const vehicleMatch = path.match(/^\/api\/vehicles\/([a-f0-9]{24})$/i);
  if (vehicleMatch && method === 'GET') {
    await requireUser(req, 'admin');
    const row = await selectOne('vehicles', 'id', vehicleMatch[1]);
    if (!row) throw new HttpError(404, 'Veículo não encontrado.');
    return json({ vehicle: fromVehicle(row) });
  }

  if (vehicleMatch && method === 'PUT') {
    await requireUser(req, 'admin');
    const body = await readBody(req) as AnyRecord;
    requiredFields(body, ['plate']);
    const current = await selectOne('vehicles', 'id', vehicleMatch[1]);
    if (!current) throw new HttpError(404, 'Veículo não encontrado.');
    const normalizedPlate = String(body.plate || '').trim().toUpperCase();
    if (normalizedPlate !== current.plate) {
      const plateInUse = await selectOne('vehicles', 'plate', normalizedPlate);
      if (plateInUse) throw new HttpError(400, 'Esta matrícula já está em uso.');
    }
    const row = await updateRow('vehicles', current.id, {
      plate: normalizedPlate,
      brand: clean(body.brand) || '',
      model: clean(body.model) || '',
      type: ['mota', 'carro', 'carrinha', 'outro'].includes(String(body.type || '')) ? String(body.type) : 'mota',
      status: ['ativo', 'manutencao', 'inativo'].includes(String(body.status || '')) ? String(body.status) : 'ativo',
      notes: String(body.notes || '').trim().slice(0, 500)
    });
    return json({ message: 'Veículo atualizado com sucesso.', vehicle: fromVehicle(row) });
  }

  if (vehicleMatch && method === 'DELETE') {
    await requireUser(req, 'admin');
    const current = await selectOne('vehicles', 'id', vehicleMatch[1]);
    if (!current) throw new HttpError(404, 'Veículo não encontrado.');
    const hasCosts = await countRows('company_costs', (q) => q.eq('assigned_vehicle', current.id));
    if (hasCosts > 0) throw new HttpError(400, 'Não é possível apagar veículos com custos associados.');
    await deleteRow('vehicles', current.id);
    return json({ message: 'Veículo apagado com sucesso.' });
  }

  return null;
};

const routeGeo = async (req: Request, path: string, method: string) => {
  if (path === '/api/geo/quote' && method === 'POST') {
    await requireUser(req, 'admin');
    const body = await readBody(req) as AnyRecord;
    const quote = await buildRouteQuote(body.origin, body.destination);
    return json(quote);
  }

  if (path === '/api/geo/route' && method === 'POST') {
    await requireUser(req);
    const body = await readBody(req) as AnyRecord;
    const route = await buildRouteGeometry(body.origin, body.destination);
    return json(route);
  }

  return null;
};

const routeOrders = async (req: Request, path: string, method: string) => {
  if (path === '/api/orders' && method === 'POST') {
    const user = await requireUser(req, 'admin');
    const body = await readBody(req);
    const isForm = body instanceof FormData;
    const get = (key: string) => isForm ? (body as FormData).get(key) : (body as AnyRecord)[key];
    requiredFields(Object.fromEntries(['service_type', 'client_name', 'client_phone1', 'price'].map((k) => [k, get(k)])), ['service_type', 'client_name', 'client_phone1', 'price']);

    const imageFile = isForm ? ((body as FormData).get('image') || (body as FormData).get('file') || Array.from((body as FormData).values()).find((value) => value instanceof File)) as File | null : null;
    const imageUrl = await uploadOrderImage(imageFile);
    const coordinates = normalizeCoordinates(get('lat'), get('lng'));
    const pickupCoordinates = normalizeCoordinates(get('pickup_lat'), get('pickup_lng'));
    const baseServicePrice = toNumber(get('service_price') ?? get('price'), 0);
    let routeQuote: AnyRecord = {
      distance_km: toNumber(get('route_distance_km'), 0),
      duration_min: toNumber(get('route_duration_min'), 0),
      delivery_fee: toNumber(get('delivery_fee'), 0),
      source: 'frontend'
    };
    if (pickupCoordinates && coordinates) {
      routeQuote = await buildRouteQuote(pickupCoordinates, coordinates);
    }
    const totalOrderPrice = baseServicePrice + toNumber(routeQuote.delivery_fee, 0);
    const autoAssign = String(get('autoAssign') || '').toLowerCase() === 'true';
    const bestProfile = autoAssign ? await findBestDriverProfile(coordinates) : null;
    const rawPayment = String(get('payment_method') || '').trim();
    let paymentMethod = ALLOWED_PAYMENT_METHODS.has(rawPayment) ? rawPayment : 'cash';
    const linkedClientId = isValidId(String(get('clientId') || '')) ? String(get('clientId')) : null;
    const linkedClient = linkedClientId ? await selectOne('clients', 'id', linkedClientId) : null;

    if (linkedClient?.billing_type === CLIENT_BILLING_TYPES.POSTPAID) {
      paymentMethod = 'postpaid_credit';
      const availableCredit = toNumber(linkedClient.credit_balance, 0);
      if (availableCredit < totalOrderPrice) {
        throw new HttpError(400, `Crédito insuficiente para cliente pós-pago. Disponível: ${availableCredit.toFixed(2)} MZN.`);
      }
      await updateRow('clients', linkedClient.id, {
        credit_balance: availableCredit - totalOrderPrice,
        credit_used: toNumber(linkedClient.credit_used, 0) + totalOrderPrice
      });
    } else if (paymentMethod === 'postpaid_credit') {
      paymentMethod = 'cash';
    }

    const orderRow = await insertRow('orders', {
      service_type: clean(get('service_type')),
      price: toNumber(totalOrderPrice, 0),
      service_price: baseServicePrice,
      delivery_fee: toNumber(routeQuote.delivery_fee, 0),
      route_distance_km: toNumber(routeQuote.distance_km, 0),
      route_duration_min: routeQuote.duration_min || null,
      route_pricing_source: routeQuote.source || 'fallback',
      client_name: clean(get('client_name')),
      client_phone1: clean(get('client_phone1')),
      client_phone2: clean(get('client_phone2')) || '',
      pickup_address_text: clean(get('pickup_address_text')) || '',
      pickup_address_coords: pickupCoordinates,
      address_text: clean(get('address_text')) || '',
      address_coords: coordinates,
      pickup_contact_name: clean(get('pickup_contact_name')) || '',
      pickup_contact_phone: clean(get('pickup_contact_phone')) || '',
      pickup_notes: clean(get('pickup_notes')) || '',
      client: linkedClientId,
      image_url: imageUrl,
      verification_code: generateVerificationCode(),
      created_by_admin: user.id,
      assigned_to_driver: bestProfile?.id || null,
      status: bestProfile ? ORDER_STATUS.ASSIGNED : ORDER_STATUS.PENDING,
      payment_method: paymentMethod,
      payment_status: paymentMethod === 'postpaid_credit' ? PAYMENT_STATUS.POSTPAID_MONTHLY : PAYMENT_STATUS.UNPAID
    });

    await createAdminNotification({
      dedupeKey: `new_order:${orderRow.id}`,
      type: 'order',
      title: 'Novo pedido recebido',
      message: `Pedido ${shortOrderCode(orderRow.id)} · ${orderRow.client_name || 'Cliente'} · ${paymentMethodLabel(orderRow.payment_method)}.`,
      order: orderRow,
      payload: { clientName: orderRow.client_name, amount: Number(orderRow.price || 0), paymentMethod: orderRow.payment_method },
      createdAt: orderRow.created_at || nowIso()
    });

    const order = fromOrder(orderRow);
    if (bestProfile) {
      await broadcastDriver(bestProfile.user_id, 'nova_entrega_atribuida', {
        orderId: orderRow.id,
        clientName: orderRow.client_name,
        serviceType: orderRow.service_type,
        paymentMethod: orderRow.payment_method
      });
    } else {
      await broadcastAdmin('order_pending', { orderId: orderRow.id });
    }
    await broadcastAdmin('orders_changed', { orderId: orderRow.id, action: 'created' });
    return json({ message: 'Encomenda criada com sucesso!', order }, 201);
  }

  if (path === '/api/orders/my-deliveries' && method === 'GET') {
    const user = await requireUser(req, 'driver');
    const profile = await getDriverProfileByUser(user.id);
    if (!profile) throw new HttpError(404, 'Perfil de motorista não encontrado.');
    const activeStatuses = [ORDER_STATUS.ASSIGNED, ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.PICKUP_IN_PROGRESS, ORDER_STATUS.PICKUP_DONE, ORDER_STATUS.DELIVERY_IN_PROGRESS];
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('assigned_to_driver', profile.id)
      .in('status', activeStatuses)
      .order('created_at', { ascending: false });
    if (error) throw new HttpError(500, error.message);
    return json({ orders: (data || []).map(fromOrder) });
  }

  if (path === '/api/orders/payment-pending' && method === 'GET') {
    const user = await requireUser(req, ['admin', 'driver']);
    let q = supabase
      .from('orders')
      .select('*')
      .eq('payment_status', PAYMENT_STATUS.AWAITING_DRIVER_CONFIRMATION)
      .order('payment_confirmation_requested_at', { ascending: false, nullsFirst: false });

    if (user.role === 'driver') {
      const profile = await getDriverProfileByUser(user.id);
      if (!profile) throw new HttpError(404, 'Perfil de motorista não encontrado.');
      q = q.eq('assigned_to_driver', profile.id);
    }

    const { data, error } = await q;
    if (error) throw new HttpError(500, error.message);
    return json({ total: (data || []).length, orders: (data || []).map(fromOrder) });
  }

  const paymentPreviewMatch = path.match(/^\/api\/orders\/([a-f0-9]{24})\/payment-preview$/i);
  if (paymentPreviewMatch && method === 'POST') {
    const user = await requireUser(req, 'driver');
    const body = await readBody(req) as AnyRecord;
    requiredFields(body, ['verification_code']);

    const profile = await getDriverProfileByUser(user.id);
    if (!profile) throw new HttpError(404, 'Perfil de motorista não encontrado.');

    const order = await selectOne('orders', 'id', paymentPreviewMatch[1]);
    if (!order) throw new HttpError(404, 'Encomenda não encontrada.');
    if (String(order.assigned_to_driver || '') !== String(profile.id)) throw new HttpError(403, 'Não autorizado para esta encomenda.');

    if (String(order.verification_code || '').toUpperCase() !== String(body.verification_code || '').toUpperCase()) {
      throw new HttpError(400, 'Código de verificação incorreto.');
    }
    if (order.status !== ORDER_STATUS.DELIVERY_IN_PROGRESS) {
      throw new HttpError(400, 'Esta encomenda não está na fase de entrega para confirmação de pagamento.');
    }

    const requiresPayment = requiresImmediatePayment(order);
    const updated = requiresPayment
      ? await updateRow('orders', order.id, {
        payment_status: PAYMENT_STATUS.AWAITING_DRIVER_CONFIRMATION,
        payment_confirmation_requested_at: nowIso()
      })
      : await updateRow('orders', order.id, {
        payment_confirmation_requested_at: nowIso()
      });

    if (requiresPayment) {
      const payload = {
        id: updated.id,
        clientName: updated.client_name,
        driverId: profile.id,
        amount: toNumber(updated.price, 0),
        paymentMethod: updated.payment_method,
        orderCode: shortOrderCode(updated.id),
        verificationCode: updated.verification_code
      };
      await createAdminNotification({
        dedupeKey: `payment_pending:${updated.id}`,
        type: 'payment',
        title: 'Pagamento por confirmar',
        message: `Pedido ${shortOrderCode(updated.id)} · Código ${updated.verification_code || '—'} · confirmar ${Number(updated.price || 0).toFixed(2)} MZN.`,
        order: updated,
        payload,
        createdAt: updated.payment_confirmation_requested_at || nowIso()
      });
      await broadcastAdmin('payment_confirmation_pending', payload);
      await broadcastDriver(profile.user_id, 'payment_confirmation_pending', payload);
    }

    return json({
      orderId: updated.id,
      totalToPay: toNumber(updated.price, 0),
      paymentMethod: updated.payment_method,
      paymentMethodLabel: paymentMethodLabel(updated.payment_method),
      requiresImmediatePayment: requiresPayment,
      paymentStatus: updated.payment_status,
      message: requiresPayment
        ? 'Código validado. Confirme o valor recebido para finalizar.'
        : 'Código validado. Cliente pós-pago: sem cobrança no acto.'
    });
  }

  if (path === '/api/orders/active' && method === 'GET') {
    await requireUser(req, 'admin');
    const activeStatuses = [ORDER_STATUS.PENDING, ORDER_STATUS.ASSIGNED, ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.PICKUP_IN_PROGRESS, ORDER_STATUS.PICKUP_DONE, ORDER_STATUS.DELIVERY_IN_PROGRESS];
    const { data, error } = await supabase.from('orders').select('*').in('status', activeStatuses).order('created_at', { ascending: false });
    if (error) throw new HttpError(500, error.message);
    const orders = [];
    for (const row of data || []) orders.push(await enrichOrder(row));
    return json({ orders });
  }

  if (path === '/api/orders/history' && method === 'GET') {
    await requireUser(req, 'admin');
    const query = parseQuery(req);
    const range = getPeriodRange(query.period || 'month');
    let q = supabase
      .from('orders')
      .select('*')
      .in('status', [ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELED])
      .gte('timestamp_completed', range.start.toISOString())
      .lte('timestamp_completed', range.end.toISOString());
    const { data, error } = await q.order('timestamp_completed', { ascending: false, nullsFirst: false });
    if (error) throw new HttpError(500, error.message);
    const orders = [];
    for (const row of data || []) orders.push(await enrichOrder(row));
    return json({ orders, period: { key: range.key, label: range.label, start: range.start.toISOString(), end: range.end.toISOString() } });
  }

  if (path === '/api/orders' && method === 'GET') {
    await requireUser(req, 'admin');
    const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (error) throw new HttpError(500, error.message);
    const orders = [];
    for (const row of data || []) orders.push(await enrichOrder(row));
    return json({ orders });
  }

  const assignMatch = path.match(/^\/api\/orders\/([a-f0-9]{24})\/assign$/i);
  if (assignMatch && method === 'PUT') {
    await requireUser(req, 'admin');
    const body = await readBody(req) as AnyRecord;
    const order = await selectOne('orders', 'id', assignMatch[1]);
    if (!order) throw new HttpError(404, 'Encomenda não encontrada.');
    if ([ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.PICKUP_IN_PROGRESS, ORDER_STATUS.DELIVERY_IN_PROGRESS].includes(order.status)) {
      throw new HttpError(400, 'Não é possível reatribuir uma encomenda em progresso.');
    }
    const driverId = String(body.driverId || '');
    const newProfile = await selectOne('driver_profiles', 'id', driverId);
    if (!newProfile) throw new HttpError(404, 'Perfil de motorista não encontrado.');

    if (order.assigned_to_driver && order.assigned_to_driver !== driverId) {
      const oldProfile = await selectOne('driver_profiles', 'id', order.assigned_to_driver);
      if (oldProfile) await broadcastDriver(oldProfile.user_id, 'entrega_cancelada', { orderId: order.id });
    }

    const updated = await updateRow('orders', order.id, { assigned_to_driver: driverId, status: ORDER_STATUS.ASSIGNED });
    await broadcastDriver(newProfile.user_id, 'nova_entrega_atribuida', {
      orderId: updated.id,
      clientName: updated.client_name,
      serviceType: updated.service_type,
      paymentMethod: updated.payment_method
    });
    await broadcastAdmin('orders_changed', { orderId: updated.id, action: 'assigned' });
    return json({ message: 'Encomenda atribuída com sucesso.', order: fromOrder(updated) });
  }

  const phaseMatch = path.match(/^\/api\/orders\/([a-f0-9]{24})\/(pickup-start|pickup-complete|delivery-start|delivery-complete|start|complete|cancel)$/i);
  if (phaseMatch) return handleOrderAction(req, phaseMatch[1], phaseMatch[2], method);

  const idMatch = path.match(/^\/api\/orders\/([a-f0-9]{24})$/i);
  if (idMatch && method === 'GET') {
    await requireUser(req, 'admin');
    const row = await selectOne('orders', 'id', idMatch[1]);
    if (!row) throw new HttpError(404, 'Encomenda não encontrada.');
    return json({ order: await enrichOrder(row) });
  }

  return null;
};

const handleOrderAction = async (req: Request, orderId: string, action: string, method: string) => {
  const isCancel = action === 'cancel';
  if (isCancel && method !== 'POST') return null;
  if (!isCancel && method !== 'POST') return null;

  if (isCancel) {
    const user = await requireUser(req, 'admin');
    const body = await readBody(req) as AnyRecord;
    const order = await selectOne('orders', 'id', orderId);
    if (!order) throw new HttpError(404, 'Encomenda não encontrada.');
    if ([ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELED].includes(order.status)) throw new HttpError(400, 'Esta encomenda já foi concluída ou cancelada.');
    const updated = await updateRow('orders', order.id, {
      status: ORDER_STATUS.CANCELED,
      cancelled_at: nowIso(),
      cancelled_by: user.id,
      cancel_reason: String(body.reason || 'Cancelado pelo administrador').slice(0, 500)
    });
    if (order.assigned_to_driver) {
      const profile = await selectOne('driver_profiles', 'id', order.assigned_to_driver);
      if (profile) {
        await updateRow('driver_profiles', profile.id, { status: DRIVER_STATUS.ONLINE_FREE });
        await broadcastDriver(profile.user_id, 'entrega_cancelada', { orderId: order.id });
      }
    }
    await broadcastAdmin('order_canceled', { id: updated.id, reason: updated.cancel_reason });
    return json({ message: 'Encomenda cancelada com sucesso.', order: fromOrder(updated) });
  }

  const user = await requireUser(req, 'driver');
  const profile = await getDriverProfileByUser(user.id);
  if (!profile) throw new HttpError(404, 'Perfil de motorista não encontrado.');
  const order = await selectOne('orders', 'id', orderId);
  if (!order) throw new HttpError(404, 'Encomenda não encontrada.');
  if (String(order.assigned_to_driver || '') !== String(profile.id)) throw new HttpError(403, 'Não autorizado para esta encomenda.');

  const now = nowIso();
  let orderUpdate: AnyRecord = {};
  let profileStatus = profile.status;
  let message = '';
  let event = '';

  if (action === 'pickup-start' || action === 'start') {
    if (![ORDER_STATUS.ASSIGNED, ORDER_STATUS.PENDING, ORDER_STATUS.PICKUP_IN_PROGRESS].includes(order.status)) throw new HttpError(400, 'Esta encomenda não está disponível para iniciar a recolha.');
    orderUpdate = { status: ORDER_STATUS.PICKUP_IN_PROGRESS, pickup_start_at: order.pickup_start_at || now, timestamp_started: order.timestamp_started || now };
    profileStatus = DRIVER_STATUS.PICKUP;
    message = 'Recolha iniciada.';
    event = 'pickup_started';
  } else if (action === 'pickup-complete') {
    if (![ORDER_STATUS.ASSIGNED, ORDER_STATUS.PICKUP_IN_PROGRESS, ORDER_STATUS.IN_PROGRESS].includes(order.status)) throw new HttpError(400, 'Esta encomenda não está numa fase válida para concluir a recolha.');
    orderUpdate = { status: ORDER_STATUS.PICKUP_DONE, pickup_start_at: order.pickup_start_at || order.timestamp_started || now, pickup_completed_at: now };
    profileStatus = DRIVER_STATUS.ONLINE_BUSY;
    message = 'Recolha concluída.';
    event = 'pickup_completed';
  } else if (action === 'delivery-start') {
    if (!order.pickup_completed_at) throw new HttpError(400, 'Ainda não foi registada a conclusão da recolha desta encomenda.');
    if (![ORDER_STATUS.PICKUP_DONE, ORDER_STATUS.DELIVERY_IN_PROGRESS, ORDER_STATUS.IN_PROGRESS].includes(order.status)) throw new HttpError(400, 'Esta encomenda não está numa fase válida para iniciar a entrega.');
    orderUpdate = { status: ORDER_STATUS.DELIVERY_IN_PROGRESS, delivery_start_at: order.delivery_start_at || now };
    profileStatus = DRIVER_STATUS.DELIVERY;
    message = 'Entrega iniciada.';
    event = 'delivery_started';
  } else if (action === 'delivery-complete' || action === 'complete') {
    const body = await readBody(req) as AnyRecord;
    requiredFields(body, ['verification_code']);
    if (String(order.verification_code).toUpperCase() !== String(body.verification_code).toUpperCase()) throw new HttpError(400, 'Código de verificação incorreto.');

    const totalPrice = toNumber(order.price, 0);
    const requiresPayment = requiresImmediatePayment(order);
    let paymentUpdate: AnyRecord;

    if (requiresPayment) {
      const confirmed = toNumber(body.payment_amount_confirmed, NaN);
      if (Number.isNaN(confirmed)) throw new HttpError(400, 'Introduza o valor recebido para confirmar o pagamento.');
      if (Math.round(confirmed * 100) !== Math.round(totalPrice * 100)) {
        await updateRow('orders', order.id, {
          payment_status: PAYMENT_STATUS.AWAITING_DRIVER_CONFIRMATION,
          payment_confirmation_requested_at: order.payment_confirmation_requested_at || now
        });
        throw new HttpError(400, `Valor divergente. O valor correto a confirmar é ${totalPrice.toFixed(2)} MZN.`);
      }
      paymentUpdate = {
        payment_status: PAYMENT_STATUS.PAID,
        payment_confirmed_amount: confirmed,
        payment_confirmed_at: now
      };
    } else {
      paymentUpdate = {
        payment_status: PAYMENT_STATUS.POSTPAID_MONTHLY,
        payment_confirmed_amount: 0,
        payment_confirmed_at: now
      };
    }

    const driverType = profile.driver_type || DRIVER_TYPES.FREELANCER;
    const commission = driverType === DRIVER_TYPES.OFFICIAL ? 0 : toNumber(profile.commission_rate, 20);
    const driverValue = totalPrice * (commission / 100);
    orderUpdate = {
      status: ORDER_STATUS.COMPLETED,
      timestamp_started: order.timestamp_started || order.pickup_start_at || now,
      pickup_start_at: order.pickup_start_at || order.timestamp_started || now,
      pickup_completed_at: order.pickup_completed_at || now,
      delivery_start_at: order.delivery_start_at || now,
      delivery_completed_at: now,
      timestamp_completed: now,
      valor_motorista: driverValue,
      valor_empresa: totalPrice - driverValue,
      driver_delivery_notes: String(body.driver_delivery_notes || '').trim().slice(0, 1000),
      ...paymentUpdate
    };
    profileStatus = DRIVER_STATUS.ONLINE_FREE;
    message = requiresPayment ? 'Entrega finalizada e pagamento confirmado!' : 'Entrega finalizada. Cliente pós-pago para fecho mensal.';
    event = 'delivery_completed';
  }

  const updatedOrder = await updateRow('orders', order.id, orderUpdate);
  const updatedProfile = await updateRow('driver_profiles', profile.id, { status: profileStatus });
  if (event === 'delivery_completed') {
    await createAdminNotification({
      dedupeKey: `delivery_completed:${updatedOrder.id}`,
      type: 'success',
      title: 'Entrega finalizada',
      message: `Pedido ${shortOrderCode(updatedOrder.id)} · Código ${updatedOrder.verification_code || '—'} · finalizado por ${user.nome || 'motorista'}.`,
      order: updatedOrder,
      payload: { driverName: user.nome, amount: Number(updatedOrder.price || 0), paymentMethod: updatedOrder.payment_method },
      createdAt: updatedOrder.timestamp_completed || nowIso()
    });
  }
  await broadcastAdmin(event, { id: updatedOrder.id, driverName: user.nome, orderCode: shortOrderCode(updatedOrder.id), verificationCode: updatedOrder.verification_code });
  await broadcastAdmin('driver_status_changed', { driverId: updatedProfile.id, driverUserId: user.id, newStatus: updatedProfile.status });
  return json({ message, order: fromOrder(updatedOrder) });
};

const routeNotifications = async (req: Request, path: string, method: string) => {
  if (!path.startsWith('/api/notifications')) return null;
  await requireUser(req, 'admin');

  if (path === '/api/notifications' && method === 'GET') {
    await syncOperationalNotifications();
    const query = parseQuery(req);
    const limit = Math.min(Math.max(Number(query.limit || 80), 1), 150);
    let q = supabase
      .from('system_notifications')
      .select('*')
      .eq('scope', 'admin')
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    const { data, error } = await q;
    if (error) throw new HttpError(500, error.message);
    return json({ notifications: (data || []).map(fromNotification), totalUnread: (data || []).length });
  }

  if (path === '/api/notifications/mark-all-read' && method === 'POST') {
    const { data, error } = await supabase
      .from('system_notifications')
      .update({ read_at: nowIso(), updated_at: nowIso() })
      .eq('scope', 'admin')
      .is('read_at', null)
      .select('id');
    if (error) throw new HttpError(500, error.message);
    return json({ message: 'Notificações marcadas como lidas.', updatedCount: data?.length || 0 });
  }

  const readMatch = path.match(/^\/api\/notifications\/([a-f0-9]{24})\/read$/i);
  if (readMatch && ['POST', 'PUT', 'PATCH'].includes(method)) {
    const { data, error } = await supabase
      .from('system_notifications')
      .update({ read_at: nowIso(), updated_at: nowIso() })
      .eq('id', readMatch[1])
      .eq('scope', 'admin')
      .select('*')
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!data) throw new HttpError(404, 'Notificação não encontrada.');
    return json({ message: 'Notificação marcada como lida.', notification: fromNotification(data) });
  }

  return null;
};

const routeStats = async (req: Request, path: string, method: string) => {
  if (!path.startsWith('/api/stats') || method !== 'GET') return null;
  await requireUser(req, 'admin');

  if (path === '/api/stats/overview') {
    const start = new Date(); start.setUTCHours(0, 0, 0, 0);
    const end = new Date(); end.setUTCHours(23, 59, 59, 999);
    const transitStatuses = [ORDER_STATUS.ASSIGNED, ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.PICKUP_IN_PROGRESS, ORDER_STATUS.PICKUP_DONE, ORDER_STATUS.DELIVERY_IN_PROGRESS];
    const [pendentes, emTransito, concluidasHoje, motoristasOnline] = await Promise.all([
      countRows('orders', (q) => q.eq('status', ORDER_STATUS.PENDING)),
      countRows('orders', (q) => q.in('status', transitStatuses)),
      countRows('orders', (q) => q.eq('status', ORDER_STATUS.COMPLETED).gte('timestamp_completed', start.toISOString()).lte('timestamp_completed', end.toISOString())),
      countRows('driver_profiles', (q) => q.in('status', ONLINE_DRIVER_STATUSES))
    ]);
    return json({ pendentes, emTransito, concluidasHoje, motoristasOnline });
  }

  if (path === '/api/stats/services') {
    const serviceNames: AnyRecord = { rapido: 'Delivery Rápido', doc: 'Doc.', farma: 'Farmácia', carga: 'Cargas', restaurante_comida: 'Comida de Restaurante', mercadoria_cp: 'Mercadoria C/P', refeicao_restaurante_p: 'Refeição Restaurante P', outros: 'Outros' };
    const { data, error } = await supabase.from('orders').select('service_type,price').eq('status', ORDER_STATUS.COMPLETED);
    if (error) throw new HttpError(500, error.message);
    const byService: AnyRecord = {};
    for (const row of data || []) {
      const key = row.service_type || 'outros';
      byService[key] = byService[key] || { totalValue: 0, totalOrders: 0 };
      byService[key].totalValue += Number(row.price || 0);
      byService[key].totalOrders += 1;
    }
    const keys = Object.keys(serviceNames);
    return json({ labels: keys.map((k) => serviceNames[k]), dataValues: keys.map((k) => byService[k]?.totalValue || 0), adesaoValues: keys.map((k) => byService[k]?.totalOrders || 0) });
  }

  if (path === '/api/stats/financials') {
    const query = parseQuery(req);
    const range = getPeriodRange(query.period || 'month');
    const { data, error } = await supabase.from('orders').select('*').eq('status', ORDER_STATUS.COMPLETED).gte('timestamp_completed', range.start.toISOString()).lte('timestamp_completed', range.end.toISOString());
    if (error) throw new HttpError(500, error.message);
    const rows = data || [];
    const totals = rows.reduce((acc: AnyRecord, row: AnyRecord) => {
      acc.totalReceita += Number(row.price || 0);
      acc.totalGanhosMotorista += Number(row.valor_motorista || 0);
      acc.totalLucroEmpresa += Number(row.valor_empresa || 0);
      acc.byDriver[row.assigned_to_driver] = (acc.byDriver[row.assigned_to_driver] || 0) + Number(row.valor_motorista || 0);
      return acc;
    }, { totalReceita: 0, totalGanhosMotorista: 0, totalLucroEmpresa: 0, byDriver: {} });
    const [topProfileId, topValue] = Object.entries(totals.byDriver).sort((a: any, b: any) => b[1] - a[1])[0] || [null, 0];
    let topDriver = { nome: 'N/A', totalGanhos: 0 };
    if (topProfileId) {
      const profile = await selectOne('driver_profiles', 'id', topProfileId);
      const user = profile ? await selectOne('users', 'id', profile.user_id) : null;
      topDriver = { nome: user?.nome || 'N/A', totalGanhos: Number(topValue || 0) };
    }
    return json({
      totalReceita: totals.totalReceita,
      totalGanhosMotorista: totals.totalGanhosMotorista,
      totalLucroEmpresa: totals.totalLucroEmpresa,
      topDriver,
      period: { key: range.key, label: range.label, start: range.start.toISOString(), end: range.end.toISOString() }
    });
  }

  return null;
};

const routeSimpleFinancials = async (req: Request, path: string, method: string) => {
  // Managers
  if (path === '/api/managers' && method === 'GET') {
    await requireUser(req, 'admin');
    const { data, error } = await supabase.from('users').select('*').eq('role', 'manager').order('nome', { ascending: true });
    if (error) throw new HttpError(500, error.message);
    return json({ managers: (data || []).map(fromUser) });
  }
  if (path === '/api/managers' && method === 'POST') {
    await requireUser(req, 'admin');
    const body = await readBody(req) as AnyRecord;
    requiredFields(body, ['nome', 'email', 'telefone', 'password']);
    const exists = await selectOne('users', 'email', lowerEmail(body.email));
    if (exists) throw new HttpError(400, 'Já existe um utilizador com este email.');
    const row = await insertRow('users', { nome: clean(body.nome), email: lowerEmail(body.email), telefone: clean(body.telefone), password: bcrypt.hashSync(String(body.password), 12), role: 'manager' });
    return json({ message: 'Gestor criado com sucesso.', manager: fromUser(row) }, 201);
  }
  const managerMatch = path.match(/^\/api\/managers\/([a-f0-9]{24})$/i);
  if (managerMatch && method === 'GET') {
    await requireUser(req, 'admin');
    const row = await selectOne('users', 'id', managerMatch[1]);
    if (!row || row.role !== 'manager') throw new HttpError(404, 'Gestor não encontrado.');
    return json({ manager: fromUser(row) });
  }
  if (managerMatch && method === 'PUT') {
    await requireUser(req, 'admin');
    const body = await readBody(req) as AnyRecord;
    const row = await selectOne('users', 'id', managerMatch[1]);
    if (!row || row.role !== 'manager') throw new HttpError(404, 'Gestor não encontrado.');
    const updated = await updateRow('users', row.id, { nome: clean(body.nome), telefone: clean(body.telefone), email: lowerEmail(body.email) });
    return json({ message: 'Gestor atualizado com sucesso.', manager: fromUser(updated) });
  }
  if (managerMatch && method === 'DELETE') {
    await requireUser(req, 'admin');
    await deleteRow('users', managerMatch[1]);
    return json({ message: 'Gestor apagado com sucesso.' });
  }

  // Expenses
  if (path === '/api/expenses' && method === 'GET') {
    await requireUser(req, ['admin', 'manager']);
    const query = parseQuery(req);
    let q = supabase.from('expenses').select('*');
    if (query.category) q = q.eq('category', query.category);
    if (query.startDate) q = q.gte('date', new Date(query.startDate).toISOString());
    if (query.endDate) { const end = new Date(query.endDate); end.setUTCHours(23, 59, 59, 999); q = q.lte('date', end.toISOString()); }
    const { data, error } = await q.order('date', { ascending: false });
    if (error) throw new HttpError(500, error.message);
    return json({ expenses: (data || []).map(fromExpense) });
  }
  if (path === '/api/expenses' && method === 'POST') {
    const user = await requireUser(req, ['admin', 'manager']);
    const body = await readBody(req) as AnyRecord;
    requiredFields(body, ['category', 'description', 'amount', 'date']);
    const row = await insertRow('expenses', { category: clean(body.category), description: clean(body.description), amount: toNumber(body.amount), date: new Date(body.date).toISOString(), employee: isValidId(String(body.employee || '')) ? String(body.employee) : null, created_by: user.id });
    return json({ message: 'Despesa criada com sucesso.', expense: fromExpense(row) }, 201);
  }
  if (path === '/api/expenses/summary' && method === 'GET') {
    await requireUser(req, ['admin', 'manager']);
    const { data, error } = await supabase.from('expenses').select('category,amount');
    if (error) throw new HttpError(500, error.message);
    const summary: AnyRecord = {};
    for (const row of data || []) summary[row.category] = (summary[row.category] || 0) + Number(row.amount || 0);
    return json({ summary });
  }
  const expenseMatch = path.match(/^\/api\/expenses\/([a-f0-9]{24})$/i);
  if (expenseMatch && method === 'PUT') {
    await requireUser(req, ['admin', 'manager']);
    const body = await readBody(req) as AnyRecord;
    const row = await updateRow('expenses', expenseMatch[1], { category: clean(body.category), description: clean(body.description), amount: toNumber(body.amount), date: new Date(body.date).toISOString(), employee: isValidId(String(body.employee || '')) ? String(body.employee) : null });
    return json({ message: 'Despesa atualizada com sucesso.', expense: fromExpense(row) });
  }
  if (expenseMatch && method === 'DELETE') {
    await requireUser(req, ['admin', 'manager']);
    await deleteRow('expenses', expenseMatch[1]);
    return json({ message: 'Despesa apagada com sucesso.' });
  }

  // Costs
  if (path.startsWith('/api/costs') && method === 'GET') {
    await requireUser(req, 'admin');
    if (path === '/api/costs/dashboard-summary') return costsDashboardSummary(req);
    const query = parseQuery(req);
    let q = supabase.from('company_costs').select('*');
    if (query.category) q = q.eq('category', query.category);
    if (query.startDate) q = q.gte('date', new Date(query.startDate).toISOString());
    if (query.endDate) { const end = new Date(query.endDate); end.setUTCHours(23, 59, 59, 999); q = q.lte('date', end.toISOString()); }
    const { data, error } = await q.order('date', { ascending: false });
    if (error) throw new HttpError(500, error.message);
    const costs = [];
    for (const row of data || []) costs.push(await enrichCost(row));
    return json({ costs });
  }
  if (path === '/api/costs' && method === 'POST') {
    const user = await requireUser(req, 'admin');
    const body = await readBody(req) as AnyRecord;
    requiredFields(body, ['category', 'amount']);
    const row = await insertRow('company_costs', {
      category: clean(body.category),
      description: clean(body.description) || '',
      amount: toNumber(body.amount),
      date: body.date ? new Date(body.date).toISOString() : nowIso(),
      created_by: user.id,
      assigned_user: isValidId(String(body.assignedUserId || body.assignedUser || '')) ? String(body.assignedUserId || body.assignedUser) : null,
      assigned_client: isValidId(String(body.assignedClientId || body.assignedClient || '')) ? String(body.assignedClientId || body.assignedClient) : null,
      assigned_vehicle: isValidId(String(body.assignedVehicleId || body.assignedVehicle || '')) ? String(body.assignedVehicleId || body.assignedVehicle) : null
    });
    return json({ message: 'Custo criado com sucesso.', cost: await enrichCost(row) }, 201);
  }

  return null;
};

const costsDashboardSummary = async (req: Request) => {
  const query = parseQuery(req);
  const months = Math.min(Math.max(Number(query.months || 6), 1), 24);
  const from = new Date();
  from.setUTCMonth(from.getUTCMonth() - (months - 1));
  from.setUTCDate(1); from.setUTCHours(0, 0, 0, 0);

  const { data: costs, error: costError } = await supabase.from('company_costs').select('*').gte('date', from.toISOString());
  if (costError) throw new HttpError(500, costError.message);
  const { data: orders, error: orderError } = await supabase.from('orders').select('*').eq('status', ORDER_STATUS.COMPLETED).gte('timestamp_completed', from.toISOString());
  if (orderError) throw new HttpError(500, orderError.message);

  const totalCosts = (costs || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalRevenue = (orders || []).reduce((sum, row) => sum + Number(row.price || 0), 0);
  return json({
    totalCosts,
    totalRevenue,
    netProfit: totalRevenue - totalCosts,
    costsByCategory: (costs || []).reduce((acc: AnyRecord, row: AnyRecord) => {
      acc[row.category] = (acc[row.category] || 0) + Number(row.amount || 0);
      return acc;
    }, {})
  });
};

const routeAdmin = async (req: Request, path: string, method: string) => {
  if (path === '/api/admin/orders/history' && method === 'DELETE') {
    await requireUser(req, 'admin');
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 30);
    const { data, error } = await supabase
      .from('orders')
      .delete()
      .in('status', [ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELED])
      .lt('timestamp_completed', cutoff.toISOString())
      .select('id');
    if (error) throw new HttpError(500, error.message);
    await broadcastAdmin('orders_changed', { action: 'history_deleted' });
    return json({ message: 'Histórico antigo apagado com sucesso.', deletedCount: data?.length || 0 });
  }

  if (path === '/api/admin/export-financial' && method === 'GET') {
    await requireUser(req, 'admin');
    const query = parseQuery(req);
    let q = supabase.from('orders').select('*').eq('status', ORDER_STATUS.COMPLETED);
    if (query.startDate) q = q.gte('timestamp_completed', new Date(query.startDate).toISOString());
    if (query.endDate) { const end = new Date(query.endDate); end.setUTCHours(23, 59, 59, 999); q = q.lte('timestamp_completed', end.toISOString()); }
    const { data, error } = await q.order('timestamp_completed', { ascending: false });
    if (error) throw new HttpError(500, error.message);
    const header = ['ID', 'Cliente', 'Serviço', 'Preço', 'Motorista', 'Empresa', 'Pagamento', 'Concluído Em'];
    const lines = [header.join(',')].concat((data || []).map((row) => [row.id, row.client_name, row.service_type, row.price, row.valor_motorista, row.valor_empresa, row.payment_method, row.timestamp_completed].map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')));
    return textResponse(lines.join('\n'), 200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="trago-financeiro.csv"' });
  }

  return null;
};

const routeTrips = async (req: Request, path: string, method: string) => {
  const historyMatch = path.match(/^\/api\/trips\/driver\/([a-f0-9]{24})\/history$/i);
  if (historyMatch && method === 'GET') {
    await requireUser(req, 'admin');
    const profile = await getDriverProfileByUser(historyMatch[1]);
    if (!profile) throw new HttpError(404, 'Perfil de motorista não encontrado.');
    const { data, error } = await supabase.from('trips').select('*').eq('driver', profile.id).order('started_at', { ascending: false });
    if (error) throw new HttpError(500, error.message);
    return json({ trips: (data || []).map(fromTrip) });
  }
  return null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const path = normalizePath(req.url);
  const method = req.method.toUpperCase();

  try {
    if (path === '/health') return json({ status: 'ok', runtime: 'supabase-edge-functions', storageBucket: STORAGE_BUCKET });

    const handlers = [routeAuth, routeRealtime, routeGeo, routeDrivers, routeClients, routeVehicles, routeOrders, routeNotifications, routeStats, routeSimpleFinancials, routeAdmin, routeTrips];
    for (const handler of handlers) {
      const response = await handler(req, path, method);
      if (response) return response;
    }

    return json({ message: `Rota não encontrada: ${method} ${path}` }, 404);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Erro interno do servidor.';
    console.error(`[trago-edge] ${method} ${path}`, error);
    return json({ message }, status);
  }
});
