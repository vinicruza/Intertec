-- ============================================================
-- 0003 — Pedidos (snapshot D7), DRE e tabelas de parâmetros
-- Ref.: docs/03-Banco-de-Dados.md §2.5–2.6; Calculations.md §6–§7
-- ============================================================

create table orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  status order_status not null default 'simulation',
  customer_id uuid references customers (id),
  uf char(2),
  seller_id uuid references sellers (id),
  channel_id uuid references channels (id),  -- copiado do vendedor no momento
  freight numeric default 0,
  freight_paid_by_customer boolean not null default false,
  commission_rate numeric,                   -- default do canal; override auditado
  -- Snapshot dos totais (precisão total), preenchido no fechamento (D7):
  gross_revenue_snapshot numeric,
  tax_snapshot numeric,             -- imposto sobre a receita (ICSM da UF)
  freight_tax_snapshot numeric,     -- imposto sobre o frete
  difal_snapshot numeric,
  commission_amount_snapshot numeric,
  net_revenue_snapshot numeric,
  cmv_total_snapshot numeric,
  expense_total_snapshot numeric,   -- despesa alocada (informativo — D1)
  contribution_margin_snapshot numeric,   -- métrica oficial
  result_after_allocation_snapshot numeric,
  totals_display jsonb,             -- mesmos totais arredondados a 2 casas (PRD §8)
  closed_at timestamptz,
  closed_by uuid references profiles (id),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index on orders (tenant_id, status);
create index on orders (closed_at);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  order_id uuid not null references orders (id) on delete cascade,
  product_id uuid references products (id),
  kit_id uuid references kits (id),
  quantity numeric not null check (quantity > 0),
  unit_price numeric not null check (unit_price >= 0),
  -- Snapshot por item, imutável após fechamento (D7):
  cmv_unit_snapshot numeric,
  expense_unit_snapshot numeric,
  tax_rate_snapshot numeric,
  difal_rate_snapshot numeric,
  commission_rate_snapshot numeric,
  freight_share_snapshot numeric,
  kit_composition_snapshot jsonb,   -- composição do kit expandida no momento da venda
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  -- exatamente um: produto OU kit
  check (num_nonnulls(product_id, kit_id) = 1)
);

create index on order_items (order_id);

-- Despesa fixa REAL do mês para o DRE (D3: nunca somar rateios como despesa do mês)
create table real_monthly_expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  period date not null,
  amount numeric not null,
  entered_by uuid references profiles (id),
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (tenant_id, period),
  check (period = date_trunc('month', period)::date)
);

-- Parâmetros por UF (o PRD agrupa como tax_tables; detalhamos em 3 tabelas)
create table icsm_rates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  uf char(2) not null,
  icms_rate numeric not null check (icms_rate >= 0 and icms_rate < 1),
  pis_cofins_rate numeric not null check (pis_cofins_rate >= 0 and pis_cofins_rate < 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (tenant_id, uf)
);

create table difal_rates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  uf char(2) not null,
  fcp_rate numeric,      -- "Pobreza"
  base_rate numeric,     -- "Alíquota"
  final_rate numeric not null check (final_rate >= 0 and final_rate < 1),  -- migrada como está (D5)
  flagged_for_review boolean not null default false,  -- AL, MA, PI, RN: confirmar com o contador
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (tenant_id, uf)
);

create table portal_freight_rates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  uf char(2) not null,
  freight_percent numeric not null check (freight_percent >= 0 and freight_percent < 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (tenant_id, uf)
);

-- Faixas de status de margem, editáveis pelo Admin (PRD §5.5)
create table margin_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  label text not null,
  min_rate numeric,      -- null = sem piso
  max_rate numeric,      -- null = sem teto
  color text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Auditoria (PRD §8): preço de insumo, fator, canal, override de comissão, reabertura
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  entity text not null,
  entity_id uuid,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  user_id uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index on audit_logs (tenant_id, entity, entity_id);
