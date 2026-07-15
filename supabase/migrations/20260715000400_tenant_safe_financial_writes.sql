create or replace function public.save_real_monthly_expense(p_period date, p_amount numeric)
returns void
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare v_tenant_id uuid:=public.current_tenant_id(); v_role public.user_role:=public.current_user_role();
begin
  if v_role not in ('admin','financeiro') then raise exception 'Sem permissão para informar despesa real'; end if;
  if p_period <> date_trunc('month',p_period)::date then raise exception 'Período deve ser o primeiro dia do mês'; end if;
  if p_amount < 0 then raise exception 'Despesa não pode ser negativa'; end if;
  insert into public.real_monthly_expenses(tenant_id,period,amount,entered_by,source,updated_at)
  values(v_tenant_id,p_period,p_amount,auth.uid(),'manual',now())
  on conflict(tenant_id,period) do update
  set amount=excluded.amount,entered_by=excluded.entered_by,source=excluded.source,updated_at=now();
end $$;

create or replace function public.create_expense_allocation_period(p_period date, p_total_expense numeric)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare v_tenant_id uuid:=public.current_tenant_id(); v_role public.user_role:=public.current_user_role(); v_id uuid;
begin
  if v_role not in ('admin','financeiro') then raise exception 'Sem permissão para criar período de alocação'; end if;
  if p_period <> date_trunc('month',p_period)::date then raise exception 'Período deve ser o primeiro dia do mês'; end if;
  if p_total_expense < 0 then raise exception 'Despesa total não pode ser negativa'; end if;
  insert into public.expense_allocation_periods(tenant_id,period,total_expense)
  values(v_tenant_id,p_period,p_total_expense) returning id into v_id;
  return v_id;
end $$;

create or replace function public.add_expense_allocation(
  p_period_id uuid,p_product_id uuid,p_estimated_production numeric,p_complexity_factor numeric)
returns void
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare v_tenant_id uuid:=public.current_tenant_id(); v_role public.user_role:=public.current_user_role();
begin
  if v_role not in ('admin','financeiro') then raise exception 'Sem permissão para incluir alocação'; end if;
  if p_estimated_production <= 0 then raise exception 'Produção estimada deve ser positiva'; end if;
  if p_complexity_factor <= 0 then raise exception 'Fator de complexidade deve ser positivo'; end if;
  if not exists(select 1 from public.expense_allocation_periods where id=p_period_id and tenant_id=v_tenant_id and status='open') then
    raise exception 'Período aberto não encontrado';
  end if;
  if not exists(select 1 from public.products where id=p_product_id and tenant_id=v_tenant_id and status='active') then
    raise exception 'Produto ativo não encontrado';
  end if;
  insert into public.expense_allocations(tenant_id,period_id,product_id,estimated_production,complexity_factor)
  values(v_tenant_id,p_period_id,p_product_id,p_estimated_production,p_complexity_factor);
end $$;

revoke execute on function public.save_real_monthly_expense(date,numeric) from public,anon;
revoke execute on function public.create_expense_allocation_period(date,numeric) from public,anon;
revoke execute on function public.add_expense_allocation(uuid,uuid,numeric,numeric) from public,anon;
grant execute on function public.save_real_monthly_expense(date,numeric) to authenticated;
grant execute on function public.create_expense_allocation_period(date,numeric) to authenticated;
grant execute on function public.add_expense_allocation(uuid,uuid,numeric,numeric) to authenticated;
