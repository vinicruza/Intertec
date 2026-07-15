-- Índices das colunas referenciais: evitam varreduras em cascatas, joins e RLS.
create index if not exists audit_logs_user_id_idx on public.audit_logs(user_id);
create index if not exists customers_tenant_id_idx on public.customers(tenant_id);
create index if not exists expense_allocations_tenant_id_idx on public.expense_allocations(tenant_id);
create index if not exists factor_history_allocation_id_idx on public.factor_history(allocation_id);
create index if not exists factor_history_changed_by_idx on public.factor_history(changed_by);
create index if not exists factor_history_tenant_id_idx on public.factor_history(tenant_id);
create index if not exists input_cost_history_changed_by_idx on public.input_cost_history(changed_by);
create index if not exists input_cost_history_input_id_idx on public.input_cost_history(input_id);
create index if not exists input_cost_history_tenant_id_idx on public.input_cost_history(tenant_id);
create index if not exists inputs_supplier_id_idx on public.inputs(supplier_id);
create index if not exists inputs_tenant_id_idx on public.inputs(tenant_id);
create index if not exists kit_items_tenant_id_idx on public.kit_items(tenant_id);
create index if not exists kits_created_by_idx on public.kits(created_by);
create index if not exists margin_rules_tenant_id_idx on public.margin_rules(tenant_id);
create index if not exists order_items_tenant_id_idx on public.order_items(tenant_id);
create index if not exists orders_cancelled_by_idx on public.orders(cancelled_by);
create index if not exists orders_closed_by_idx on public.orders(closed_by);
create index if not exists orders_created_by_idx on public.orders(created_by);
create index if not exists product_components_tenant_id_idx on public.product_components(tenant_id);
create index if not exists product_costs_tenant_id_idx on public.product_costs(tenant_id);
create index if not exists profiles_tenant_id_idx on public.profiles(tenant_id);
create index if not exists real_monthly_expenses_entered_by_idx on public.real_monthly_expenses(entered_by);
create index if not exists sellers_channel_id_idx on public.sellers(channel_id);
create index if not exists sellers_tenant_id_idx on public.sellers(tenant_id);
create index if not exists suppliers_tenant_id_idx on public.suppliers(tenant_id);

-- As políticas antigas não declaravam o papel e, por isso, eram avaliadas
-- também para anon/PUBLIC. O predicado já bloqueava, mas gerava trabalho e
-- uma superfície desnecessária.
do $$
declare r record;
begin
  for r in select schemaname,tablename,policyname from pg_policies where schemaname='public'
  loop
    execute format('alter policy %I on %I.%I to authenticated',r.policyname,r.schemaname,r.tablename);
  end loop;
end $$;

-- FOR ALL também conta como SELECT e duplicava a avaliação da política de
-- leitura. Quando já existe uma política SELECT, separamos escrita por ação.
do $$
declare r record; v_check text;
begin
  for r in
    select p.tablename,p.policyname,p.qual,p.with_check
    from pg_policies p
    where p.schemaname='public' and p.cmd='ALL' and p.tablename<>'profiles'
      and exists(select 1 from pg_policies s where s.schemaname=p.schemaname and s.tablename=p.tablename and s.cmd='SELECT')
  loop
    v_check:=coalesce(r.with_check,r.qual,'false');
    execute format('drop policy %I on public.%I',r.policyname,r.tablename);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)',r.policyname||'_insert',r.tablename,v_check);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',r.policyname||'_update',r.tablename,coalesce(r.qual,'false'),v_check);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)',r.policyname||'_delete',r.tablename,coalesce(r.qual,'false'));
  end loop;
end $$;

-- Perfis precisam de uma única leitura: o próprio perfil ou, para Admin,
-- perfis do mesmo tenant. Isso evita duas políticas permissivas concorrentes.
drop policy if exists profiles_admin_all on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (
  id=(select auth.uid())
  or (tenant_id=(select public.current_tenant_id()) and (select public.current_user_role())='admin')
);
create policy profiles_admin_insert on public.profiles for insert to authenticated
with check (tenant_id=(select public.current_tenant_id()) and (select public.current_user_role())='admin');
create policy profiles_admin_update on public.profiles for update to authenticated
using (tenant_id=(select public.current_tenant_id()) and (select public.current_user_role())='admin')
with check (tenant_id=(select public.current_tenant_id()) and (select public.current_user_role())='admin');
create policy profiles_admin_delete on public.profiles for delete to authenticated
using (tenant_id=(select public.current_tenant_id()) and (select public.current_user_role())='admin');

-- Admin e Comercial tinham duas políticas UPDATE concorrentes em pedidos.
drop policy if exists orders_update_admin on public.orders;
drop policy if exists orders_update_comercial on public.orders;
create policy orders_update on public.orders for update to authenticated
using (
  tenant_id=(select public.current_tenant_id())
  and ((select public.current_user_role())='admin'
    or ((select public.current_user_role())='comercial' and status='simulation'))
)
with check (
  tenant_id=(select public.current_tenant_id())
  and (select public.current_user_role()) in ('admin','comercial')
);
