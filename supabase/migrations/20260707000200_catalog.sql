-- ============================================================
-- 0002 — Catálogo: insumos, produtos, ficha técnica, alocação, kits
-- Ref.: docs/03-Banco-de-Dados.md §2.2–2.4; Calculations.md §2–§5
-- ============================================================

-- Insumos com preço derivado (Calculations.md §2):
-- comprado numa unidade (kg), consumido em outra (m²)
create table inputs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  name text not null,
  category text,
  supplier_id uuid references suppliers (id),
  status entity_status not null default 'active',
  purchase_unit text,
  purchase_price numeric,
  conversion_factor numeric not null default 1,
  consumption_unit text,
  price_with_tax numeric,                -- derivado ou digitado
  icms_rate numeric not null default 0,
  pis_cofins_rate numeric not null default 0,
  price_without_tax numeric,             -- calculado pelo motor: preço × (1 − ICMS − PIS/COFINS)
  price_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  check (icms_rate >= 0 and icms_rate < 1),
  check (pis_cofins_rate >= 0 and pis_cofins_rate < 1)
);

create table input_cost_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  input_id uuid not null references inputs (id) on delete cascade,
  old_price_with_tax numeric,
  new_price_with_tax numeric,
  old_price_without_tax numeric,
  new_price_without_tax numeric,
  changed_by uuid references profiles (id),
  changed_at timestamptz not null default now()
);

-- CMV/despesa/custo total NÃO são colunas digitáveis (ficam em product_costs)
create table products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  code text not null,
  name text not null,
  category text,
  type text,
  sterile boolean,
  size text,
  grammage text,
  status entity_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (tenant_id, code)
);

-- Ficha técnica: componente é insumo OU produto (kits em cascata, Calculations.md §4);
-- quantidade como expressão estruturada, não só o número final (Calculations.md §3)
create table product_components (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  product_id uuid not null references products (id) on delete cascade,
  component_input_id uuid references inputs (id),
  component_product_id uuid references products (id),
  quantity_type quantity_type not null,
  quantity numeric,        -- direct
  width numeric,           -- area: largura
  length numeric,          -- area: comprimento
  yield_rate numeric,      -- area: rendimento (ex.: 0,99)
  lot_size numeric,        -- lot: 1 ÷ lote
  computed_quantity numeric not null,  -- persistida p/ leitura; recalculada pelo motor
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  -- exatamente um tipo de componente
  check (num_nonnulls(component_input_id, component_product_id) = 1),
  -- produto não contém a si mesmo (ciclos indiretos: trigger anti-ciclo)
  check (component_product_id is null or component_product_id <> product_id),
  check (
    (quantity_type = 'direct' and quantity is not null and quantity > 0)
    or (quantity_type = 'area' and width > 0 and length > 0 and yield_rate > 0)
    or (quantity_type = 'lot' and lot_size > 0)
  ),
  check (computed_quantity > 0)
);

create index on product_components (product_id);
create index on product_components (component_input_id);
create index on product_components (component_product_id);

-- Custo vigente calculado (1 linha por produto); pedidos fechados não são afetados
create table product_costs (
  product_id uuid primary key references products (id) on delete cascade,
  tenant_id uuid not null references tenants (id),
  cmv numeric not null,
  calculated_at timestamptz not null default now()
);

-- Alocação de despesa com vigência mensal (Decisão D3)
create table expense_allocation_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  period date not null,                 -- 1º dia do mês
  total_expense numeric not null,
  status period_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (tenant_id, period),
  check (period = date_trunc('month', period)::date)
);

create table expense_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  period_id uuid not null references expense_allocation_periods (id) on delete cascade,
  product_id uuid not null references products (id),
  estimated_production numeric not null check (estimated_production >= 0),
  complexity_factor numeric not null check (complexity_factor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (period_id, product_id)
);
-- Peso, participação e despesa unitária são derivados pelo motor (memória de cálculo)

-- Histórico de fatores (PRD §6.4)
create table factor_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  allocation_id uuid not null references expense_allocations (id) on delete cascade,
  old_factor numeric,
  new_factor numeric,
  changed_by uuid references profiles (id),
  changed_at timestamptz not null default now()
);

-- Kits com assinatura única (dedupe — golden test T10)
create table kits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  code text,
  name text not null,
  description text,
  signature text not null,   -- composição ordenada por ID: produto_a:2|produto_b:1
  status entity_status not null default 'active',
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (tenant_id, signature)
);

create table kit_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  kit_id uuid not null references kits (id) on delete cascade,
  product_id uuid not null references products (id),
  quantity numeric not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (kit_id, product_id)
);
