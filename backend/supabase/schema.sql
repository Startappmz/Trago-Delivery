-- Trago Delivery · Supabase/Postgres schema
-- Execute este ficheiro no Supabase Dashboard > SQL Editor > New query.
-- IDs mantidos em formato texto de 24 caracteres hexadecimais para preservar
-- compatibilidade com o front-end e com validações herdadas do projecto.

create extension if not exists pgcrypto;

create or replace function public.trago_generate_id()
returns text
language sql
as $$
  select substr(encode(gen_random_bytes(12), 'hex'), 1, 24);
$$;

create or replace function public.trago_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.users (
  id text primary key default public.trago_generate_id(),
  nome text not null,
  email text not null unique,
  telefone text not null,
  password text not null,
  role text not null check (role in ('admin', 'driver', 'manager')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id text primary key default public.trago_generate_id(),
  plate text not null unique,
  brand text,
  model text,
  type text not null default 'mota' check (type in ('mota', 'carro', 'carrinha', 'outro')),
  status text not null default 'ativo' check (status in ('ativo', 'manutencao', 'inativo')),
  notes text,
  created_by text references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_profiles (
  id text primary key default public.trago_generate_id(),
  user_id text not null unique references public.users(id) on delete cascade,
  vehicle_plate text default '',
  vehicle_id text references public.vehicles(id) on delete set null,
  driver_type text not null default 'freelancer' check (driver_type in ('freelancer', 'official')),
  status text not null default 'offline' check (status in ('online_livre', 'online_ocupado', 'em_recolha', 'em_entrega', 'offline')),
  commission_rate numeric(5,2) not null default 20 check (commission_rate >= 0 and commission_rate <= 100),
  last_location jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id text primary key default public.trago_generate_id(),
  nome text not null,
  telefone text not null unique,
  email text,
  empresa text,
  nuit text,
  endereco text,
  billing_type text not null default 'prepaid' check (billing_type in ('prepaid', 'postpaid')),
  credit_limit numeric(12,2) not null default 0 check (credit_limit >= 0),
  credit_balance numeric(12,2) not null default 0 check (credit_balance >= 0),
  credit_used numeric(12,2) not null default 0 check (credit_used >= 0),
  created_by_admin text references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id text primary key default public.trago_generate_id(),
  service_type text not null,
  price numeric(12,2) not null default 0,
  client_name text not null,
  client_phone1 text not null,
  client_phone2 text,
  address_text text,
  address_coords jsonb,
  pickup_address_text text,
  pickup_contact_name text,
  pickup_contact_phone text,
  pickup_notes text,
  pickup_address_coords jsonb,
  service_price numeric(12,2) not null default 0,
  delivery_fee numeric(12,2) not null default 0,
  route_distance_km numeric(10,2),
  route_duration_min numeric(10,2),
  route_pricing_source text,
  image_url text,
  verification_code text not null,
  created_by_admin text references public.users(id) on delete set null,
  assigned_to_driver text references public.driver_profiles(id) on delete set null,
  client text references public.clients(id) on delete set null,
  status text not null default 'pendente' check (status in (
    'pendente',
    'atribuido',
    'em_progresso',
    'recolha_em_progresso',
    'recolha_concluida',
    'entrega_em_progresso',
    'concluido',
    'cancelado'
  )),
  timestamp_started timestamptz,
  timestamp_completed timestamptz,
  pickup_start_at timestamptz,
  pickup_completed_at timestamptz,
  delivery_start_at timestamptz,
  delivery_completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by text references public.users(id) on delete set null,
  cancel_reason text,
  valor_motorista numeric(12,2) not null default 0,
  valor_empresa numeric(12,2) not null default 0,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'mpesa', 'emola', 'mkesh', 'bank_transfer', 'pos', 'postpaid_credit')),
  payment_status text not null default 'nao_pago' check (payment_status in ('nao_pago', 'aguardando_confirmacao_pagamento', 'pago', 'pos_pago_mensal')),
  payment_confirmed_amount numeric(12,2),
  payment_confirmation_requested_at timestamptz,
  payment_confirmed_at timestamptz,
  driver_delivery_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


create table if not exists public.system_notifications (
  id text primary key default public.trago_generate_id(),
  scope text not null default 'admin' check (scope in ('admin')),
  dedupe_key text not null unique,
  type text not null default 'info' check (type in ('info', 'order', 'payment', 'success', 'warning', 'error')),
  title text not null,
  message text not null default '',
  order_id text references public.orders(id) on delete set null,
  order_code text,
  verification_code text,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trips (
  id text primary key default public.trago_generate_id(),
  driver text not null references public.driver_profiles(id) on delete cascade,
  order_id text references public.orders(id) on delete set null,
  type text not null check (type in ('coleta', 'entrega', 'retorno_central', 'pausa', 'outro')),
  status text not null default 'em_andamento' check (status in ('em_andamento', 'concluida', 'cancelada')),
  started_at timestamptz not null,
  finished_at timestamptz,
  origin jsonb,
  destination jsonb,
  positions jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{"distance":0,"duration":0,"avgSpeed":0,"maxSpeed":0}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id text primary key default public.trago_generate_id(),
  category text not null check (category in ('manutencao', 'combustivel', 'emprestimo', 'credito', 'taxa_trans_levant', 'consumiveis', 'despesas_aplicativo', 'diversos')),
  description text not null,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  date timestamptz not null,
  employee text references public.users(id) on delete set null,
  created_by text references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_costs (
  id text primary key default public.trago_generate_id(),
  category text not null check (category in ('manutencao', 'combustivel', 'emprestimo', 'credito', 'taxa_trans_levant', 'consumiveis', 'despesas_aplicativo', 'diversos')),
  description text default '',
  amount numeric(12,2) not null default 0 check (amount >= 0),
  date timestamptz not null default now(),
  created_by text references public.users(id) on delete set null,
  assigned_user text references public.users(id) on delete set null,
  assigned_client text references public.clients(id) on delete set null,
  assigned_vehicle text references public.vehicles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_cost_single_assignment check (
    ((assigned_user is not null)::int + (assigned_client is not null)::int + (assigned_vehicle is not null)::int) <= 1
  )
);

create index if not exists idx_users_role_nome on public.users(role, nome);
create index if not exists idx_system_notifications_scope_read_created on public.system_notifications(scope, read_at, created_at desc);
create index if not exists idx_system_notifications_order on public.system_notifications(order_id);
create index if not exists idx_system_notifications_dedupe on public.system_notifications(dedupe_key);
create index if not exists idx_vehicles_plate on public.vehicles(plate);
create index if not exists idx_driver_profiles_status on public.driver_profiles(status);
create index if not exists idx_driver_profiles_vehicle on public.driver_profiles(vehicle_id);
create index if not exists idx_driver_profiles_type on public.driver_profiles(driver_type);
create index if not exists idx_orders_status_created on public.orders(status, created_at desc);
create index if not exists idx_orders_driver_status on public.orders(assigned_to_driver, status);
create index if not exists idx_orders_client_completed on public.orders(client, status, timestamp_completed desc);
create index if not exists idx_orders_payment_method on public.orders(payment_method);
create index if not exists idx_orders_payment_status on public.orders(payment_status);
create index if not exists idx_clients_billing_type on public.clients(billing_type);
create index if not exists idx_orders_route_distance on public.orders(route_distance_km);
create index if not exists idx_trips_driver_started on public.trips(driver, started_at desc);
create index if not exists idx_expenses_date_category on public.expenses(date desc, category);
create index if not exists idx_company_costs_date_category on public.company_costs(date desc, category);
create index if not exists idx_company_costs_vehicle on public.company_costs(assigned_vehicle);

-- Triggers de updated_at
drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at before update on public.users
for each row execute function public.trago_touch_updated_at();

drop trigger if exists trg_vehicles_updated_at on public.vehicles;
create trigger trg_vehicles_updated_at before update on public.vehicles
for each row execute function public.trago_touch_updated_at();

drop trigger if exists trg_driver_profiles_updated_at on public.driver_profiles;
create trigger trg_driver_profiles_updated_at before update on public.driver_profiles
for each row execute function public.trago_touch_updated_at();

drop trigger if exists trg_clients_updated_at on public.clients;
create trigger trg_clients_updated_at before update on public.clients
for each row execute function public.trago_touch_updated_at();

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at before update on public.orders
for each row execute function public.trago_touch_updated_at();

drop trigger if exists trg_system_notifications_updated_at on public.system_notifications;
create trigger trg_system_notifications_updated_at before update on public.system_notifications
for each row execute function public.trago_touch_updated_at();

drop trigger if exists trg_trips_updated_at on public.trips;
create trigger trg_trips_updated_at before update on public.trips
for each row execute function public.trago_touch_updated_at();

drop trigger if exists trg_expenses_updated_at on public.expenses;
create trigger trg_expenses_updated_at before update on public.expenses
for each row execute function public.trago_touch_updated_at();

drop trigger if exists trg_company_costs_updated_at on public.company_costs;
create trigger trg_company_costs_updated_at before update on public.company_costs
for each row execute function public.trago_touch_updated_at();

-- Como o backend usa SUPABASE_SECRET_KEY no servidor, a chave secreta bypassa RLS.
-- Mantemos RLS activa por segurança caso alguém tente usar chave pública no front-end.
alter table public.users enable row level security;
alter table public.vehicles enable row level security;
alter table public.driver_profiles enable row level security;
alter table public.clients enable row level security;
alter table public.orders enable row level security;
alter table public.system_notifications enable row level security;
alter table public.trips enable row level security;
alter table public.expenses enable row level security;
alter table public.company_costs enable row level security;

-- Restauração profissional de password por email (admin/motorista)
create table if not exists public.password_reset_codes (
  id text primary key default public.trago_generate_id(),
  user_id text not null references public.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'driver')),
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_password_reset_codes_email_role
on public.password_reset_codes(email, role);

create index if not exists idx_password_reset_codes_user_active
on public.password_reset_codes(user_id, role, created_at desc)
where used_at is null;

create index if not exists idx_password_reset_codes_expires_at
on public.password_reset_codes(expires_at);

drop trigger if exists trg_password_reset_codes_touch_updated_at on public.password_reset_codes;
create trigger trg_password_reset_codes_touch_updated_at
before update on public.password_reset_codes
for each row execute function public.trago_touch_updated_at();


-- -----------------------------------------------------------------------------
-- Portais Cliente/Restaurante
-- -----------------------------------------------------------------------------
-- Trago Delivery · Portais Cliente/Restaurante
-- Execute no Supabase SQL Editor antes de usar login-restaurante.html/restaurante.html.

create extension if not exists pgcrypto;

create table if not exists public.restaurants (
  id text primary key default public.trago_generate_id(),
  name text not null,
  email text not null unique,
  phone text not null default '',
  password_hash text not null,
  address_text text not null default '',
  address_coords jsonb,
  logo_url text not null default '',
  cover_url text not null default '',
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_menu_items (
  id text primary key default public.trago_generate_id(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  name text not null,
  category text not null default 'Geral',
  description text not null default '',
  price numeric(12,2) not null default 0 check (price >= 0),
  image_url text not null default '',
  available boolean not null default true,
  prep_time_min integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_restaurants_status_name on public.restaurants(status, name);
create index if not exists idx_restaurants_email on public.restaurants(email);
create index if not exists idx_menu_restaurant_category on public.restaurant_menu_items(restaurant_id, category, name);
create index if not exists idx_menu_available on public.restaurant_menu_items(available);

drop trigger if exists trg_restaurants_updated_at on public.restaurants;
create trigger trg_restaurants_updated_at before update on public.restaurants
for each row execute function public.trago_touch_updated_at();

drop trigger if exists trg_restaurant_menu_items_updated_at on public.restaurant_menu_items;
create trigger trg_restaurant_menu_items_updated_at before update on public.restaurant_menu_items
for each row execute function public.trago_touch_updated_at();

alter table public.restaurants enable row level security;
alter table public.restaurant_menu_items enable row level security;


-- Portal Cliente v2: avaliações de pratos/restaurantes
create table if not exists public.restaurant_ratings (
  id text primary key default public.trago_generate_id(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  menu_item_id text not null default '',
  customer_session_id text not null default '',
  rating integer not null check (rating between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, menu_item_id, customer_session_id)
);
create index if not exists idx_restaurant_ratings_restaurant on public.restaurant_ratings(restaurant_id);
create index if not exists idx_restaurant_ratings_menu_item on public.restaurant_ratings(menu_item_id);
create index if not exists idx_restaurant_ratings_score on public.restaurant_ratings(rating);
alter table public.restaurant_ratings enable row level security;
