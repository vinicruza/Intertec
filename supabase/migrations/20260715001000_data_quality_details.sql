create or replace function public.get_data_quality_details()
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare v_tenant_id uuid:=public.current_tenant_id(); v_role public.user_role:=public.current_user_role(); v_period_id uuid; v_period date;
begin
  if v_role not in ('admin','financeiro') then raise exception 'Sem permissão para consultar integridade'; end if;
  select id,period into v_period_id,v_period from public.expense_allocation_periods
   where tenant_id=v_tenant_id and status='open' order by period desc limit 1;
  return jsonb_build_object(
    'open_period_id',v_period_id,
    'open_period',v_period,
    'products_without_components',coalesce((
      select jsonb_agg(jsonb_build_object('id',p.id,'code',p.code,'name',p.name) order by p.name)
      from public.products p where p.tenant_id=v_tenant_id and p.status='active'
       and not exists(select 1 from public.product_components c where c.product_id=p.id)
    ),'[]'::jsonb),
    'products_without_allocation',coalesce((
      select jsonb_agg(jsonb_build_object('id',p.id,'code',p.code,'name',p.name) order by p.name)
      from public.products p left join public.expense_allocations ea on ea.period_id=v_period_id and ea.product_id=p.id
      where p.tenant_id=v_tenant_id and p.status='active' and ea.id is null
    ),'[]'::jsonb)
  );
end $$;
revoke execute on function public.get_data_quality_details() from public,anon;
grant execute on function public.get_data_quality_details() to authenticated;
