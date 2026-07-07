-- ============================================================
-- 0005 — RLS: permissões por perfil
-- Ref.: docs/03-Banco-de-Dados.md §4 (matriz de permissões)
-- Perfis: admin | financeiro | comercial | producao
-- Regra de ouro: Comercial NÃO acessa custos de insumos.
-- ============================================================

-- Funções auxiliares (security definer: leem profiles ignorando RLS)
create or replace function public.current_user_role()
returns user_role language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() and active $$;

create or replace function public.current_tenant_id()
returns uuid language sql stable security definer set search_path = public as
$$ select tenant_id from profiles where id = auth.uid() and active $$;

-- Habilita RLS em todas as tabelas (sem policy = sem acesso)
do $$
declare t text;
begin
  foreach t in array array[
    'tenants','profiles','channels','sellers','suppliers','customers',
    'inputs','input_cost_history','products','product_components','product_costs',
    'expense_allocation_periods','expense_allocations','factor_history',
    'kits','kit_items','orders','order_items','real_monthly_expenses',
    'icsm_rates','difal_rates','portal_freight_rates','margin_rules','audit_logs'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- tenants: leitura para qualquer usuário ativo; escrita só service role
create policy tenants_select on tenants for select
  using (id = current_tenant_id());

-- profiles: cada um vê o próprio; admin vê e gerencia todos
create policy profiles_select_own on profiles for select
  using (id = auth.uid());
create policy profiles_admin_all on profiles for all
  using (tenant_id = current_tenant_id() and current_user_role() = 'admin')
  with check (tenant_id = current_tenant_id() and current_user_role() = 'admin');

-- ---- Insumos e histórico: Comercial SEM ACESSO; Produção leitura ----
create policy inputs_select on inputs for select
  using (tenant_id = current_tenant_id()
         and current_user_role() in ('admin','financeiro','producao'));
create policy inputs_write on inputs for all
  using (tenant_id = current_tenant_id()
         and current_user_role() in ('admin','financeiro'))
  with check (tenant_id = current_tenant_id()
         and current_user_role() in ('admin','financeiro'));

create policy input_history_select on input_cost_history for select
  using (tenant_id = current_tenant_id()
         and current_user_role() in ('admin','financeiro','producao'));

-- ---- Produtos, ficha e custo: todos leem; escrita admin/financeiro ----
-- (Comercial lê o CMV do produto para simular, mas não os preços dos insumos)
create policy products_select on products for select
  using (tenant_id = current_tenant_id() and current_user_role() is not null);
create policy products_write on products for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('admin','financeiro'))
  with check (tenant_id = current_tenant_id() and current_user_role() in ('admin','financeiro'));

create policy components_select on product_components for select
  using (tenant_id = current_tenant_id() and current_user_role() is not null);
create policy components_write on product_components for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('admin','financeiro'))
  with check (tenant_id = current_tenant_id() and current_user_role() in ('admin','financeiro'));

create policy product_costs_select on product_costs for select
  using (tenant_id = current_tenant_id() and current_user_role() is not null);
create policy product_costs_write on product_costs for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('admin','financeiro'))
  with check (tenant_id = current_tenant_id() and current_user_role() in ('admin','financeiro'));

-- ---- Alocação e DRE: só admin/financeiro ----
do $$
declare t text;
begin
  foreach t in array array[
    'expense_allocation_periods','expense_allocations','factor_history','real_monthly_expenses'
  ] loop
    execute format(
      'create policy %s_fin on %I for all
       using (tenant_id = current_tenant_id() and current_user_role() in (''admin'',''financeiro''))
       with check (tenant_id = current_tenant_id() and current_user_role() in (''admin'',''financeiro''))',
      t, t);
  end loop;
end $$;

-- ---- Kits: todos leem; admin/financeiro/comercial escrevem ----
create policy kits_select on kits for select
  using (tenant_id = current_tenant_id() and current_user_role() is not null);
create policy kits_write on kits for all
  using (tenant_id = current_tenant_id()
         and current_user_role() in ('admin','financeiro','comercial'))
  with check (tenant_id = current_tenant_id()
         and current_user_role() in ('admin','financeiro','comercial'));

create policy kit_items_select on kit_items for select
  using (tenant_id = current_tenant_id() and current_user_role() is not null);
create policy kit_items_write on kit_items for all
  using (tenant_id = current_tenant_id()
         and current_user_role() in ('admin','financeiro','comercial'))
  with check (tenant_id = current_tenant_id()
         and current_user_role() in ('admin','financeiro','comercial'));

-- ---- Pedidos: comercial CRUD (só simulação); reabrir = só admin; financeiro lê ----
create policy orders_select on orders for select
  using (tenant_id = current_tenant_id()
         and current_user_role() in ('admin','financeiro','comercial'));
create policy orders_insert on orders for insert
  with check (tenant_id = current_tenant_id()
         and current_user_role() in ('admin','comercial'));
create policy orders_update_admin on orders for update
  using (tenant_id = current_tenant_id() and current_user_role() = 'admin')
  with check (tenant_id = current_tenant_id());
-- comercial só altera pedidos em simulação (fechar = ok; reabrir = bloqueado)
create policy orders_update_comercial on orders for update
  using (tenant_id = current_tenant_id()
         and current_user_role() = 'comercial' and status = 'simulation')
  with check (tenant_id = current_tenant_id());
create policy orders_delete on orders for delete
  using (tenant_id = current_tenant_id()
         and current_user_role() in ('admin','comercial') and status = 'simulation');

create policy order_items_select on order_items for select
  using (tenant_id = current_tenant_id()
         and current_user_role() in ('admin','financeiro','comercial'));
create policy order_items_write on order_items for all
  using (tenant_id = current_tenant_id()
         and current_user_role() in ('admin','comercial'))
  with check (tenant_id = current_tenant_id()
         and current_user_role() in ('admin','comercial'));

-- ---- Cadastros comerciais ----
create policy sellers_select on sellers for select
  using (tenant_id = current_tenant_id() and current_user_role() is not null);
create policy sellers_write on sellers for all
  using (tenant_id = current_tenant_id() and current_user_role() = 'admin')
  with check (tenant_id = current_tenant_id() and current_user_role() = 'admin');

create policy suppliers_select on suppliers for select
  using (tenant_id = current_tenant_id()
         and current_user_role() in ('admin','financeiro','producao'));
create policy suppliers_write on suppliers for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('admin','financeiro'))
  with check (tenant_id = current_tenant_id() and current_user_role() in ('admin','financeiro'));

create policy customers_select on customers for select
  using (tenant_id = current_tenant_id()
         and current_user_role() in ('admin','financeiro','comercial'));
create policy customers_write on customers for all
  using (tenant_id = current_tenant_id()
         and current_user_role() in ('admin','financeiro','comercial'))
  with check (tenant_id = current_tenant_id()
         and current_user_role() in ('admin','financeiro','comercial'));

-- ---- Parâmetros: todos os envolvidos leem; só admin escreve ----
do $$
declare t text;
begin
  foreach t in array array[
    'channels','icsm_rates','difal_rates','portal_freight_rates','margin_rules'
  ] loop
    execute format(
      'create policy %s_select on %I for select
       using (tenant_id = current_tenant_id()
              and current_user_role() in (''admin'',''financeiro'',''comercial''))', t, t);
    execute format(
      'create policy %s_admin_write on %I for all
       using (tenant_id = current_tenant_id() and current_user_role() = ''admin'')
       with check (tenant_id = current_tenant_id() and current_user_role() = ''admin'')', t, t);
  end loop;
end $$;

-- ---- Auditoria: admin/financeiro leem; escrita só via triggers (security definer) ----
create policy audit_select on audit_logs for select
  using (tenant_id = current_tenant_id()
         and current_user_role() in ('admin','financeiro'));
