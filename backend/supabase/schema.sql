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

create table if not exists public.driver_profiles (
  id text primary key default public.trago_generate_id(),
  user_id text not null unique references public.users(id) on delete cascade,
  vehicle_plate text default '',
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
  payment_method text not null default 'cash' check (payment_method in ('cash', 'mpesa', 'emola', 'mkesh', 'bank_transfer')),
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
  category text not null check (category in ('salarios', 'renda', 'diversos', 'manutencao', 'comunicacao', 'marketing', 'combustivel')),
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
  category text not null check (category in ('salarios', 'renda', 'manutencao', 'comunicacao', 'marketing', 'combustivel', 'diversos')),
  description text default '',
  amount numeric(12,2) not null default 0 check (amount >= 0),
  date timestamptz not null default now(),
  created_by text references public.users(id) on delete set null,
  assigned_user text references public.users(id) on delete set null,
  assigned_client text references public.clients(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_cost_single_assignment check (
    assigned_user is null or assigned_client is null
  )
);

create index if not exists idx_users_role_nome on public.users(role, nome);
create index if not exists idx_driver_profiles_status on public.driver_profiles(status);
create index if not exists idx_orders_status_created on public.orders(status, created_at desc);
create index if not exists idx_orders_driver_status on public.orders(assigned_to_driver, status);
create index if not exists idx_orders_client_completed on public.orders(client, status, timestamp_completed desc);
create index if not exists idx_orders_payment_method on public.orders(payment_method);
create index if not exists idx_trips_driver_started on public.trips(driver, started_at desc);
create index if not exists idx_expenses_date_category on public.expenses(date desc, category);
create index if not exists idx_company_costs_date_category on public.company_costs(date desc, category);

-- Triggers de updated_at
drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at before update on public.users
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
alter table public.driver_profiles enable row level security;
alter table public.clients enable row level security;
alter table public.orders enable row level security;
alter table public.trips enable row level security;
alter table public.expenses enable row level security;
alter table public.company_costs enable row level security;
