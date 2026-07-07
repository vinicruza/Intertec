-- ============================================================
-- 0001 — Núcleo: extensões, enums e tabelas base
-- Ref.: docs/03-Banco-de-Dados.md §2.1
-- Convenções: uuid como PK; numeric SEM precisão fixada para
-- dinheiro/alíquotas/quantidades (nunca float); tenant_id em tudo.
-- ============================================================

create extension if not exists pgcrypto;

-- Enums
create type user_role as enum ('admin', 'financeiro', 'comercial', 'producao');
create type entity_status as enum ('active', 'inactive');
create type tax_source as enum ('icsm_table');
create type freight_model as enum ('manual', 'uf_percent');
create type quantity_type as enum ('direct', 'area', 'lot');
create type period_status as enum ('open', 'closed');
create type order_status as enum ('simulation', 'closed');

-- Multi-tenant preparado, não implementado (PRD §8): 1 linha fixa na v1
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Espelha auth.users do Supabase
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  tenant_id uuid not null references tenants (id),
  full_name text not null,
  role user_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Canais parametrizam o cálculo (Decisão D4)
create table channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  name text not null,
  applies_difal boolean not null default true,          -- Revendas: false
  tax_source tax_source not null default 'icsm_table',
  default_commission_rate numeric not null default 0.025,
  freight_model freight_model not null default 'manual', -- marketplace: uf_percent
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (tenant_id, name),
  check (default_commission_rate >= 0 and default_commission_rate < 1)
);

-- Vendedor é entidade separada, vinculada a canal (resolve bug nº 8 da planilha)
create table sellers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  name text not null,
  channel_id uuid not null references channels (id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  name text not null,
  contact_info text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  name text not null,
  uf char(2),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
