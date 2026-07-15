create or replace function public.get_data_quality_summary()
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare v_tenant_id uuid:=public.current_tenant_id(); v_role public.user_role:=public.current_user_role();
begin
  if v_role not in ('admin','financeiro') then raise exception 'Sem permissão para consultar integridade'; end if;
  return jsonb_build_object(
    'products_without_components',(select count(*) from products p where p.tenant_id=v_tenant_id and p.status='active' and not exists(select 1 from product_components c where c.product_id=p.id)),
    'products_without_valid_cmv',(select count(*) from products p left join product_costs pc on pc.product_id=p.id where p.tenant_id=v_tenant_id and p.status='active' and coalesce(pc.cmv,0)<=0),
    'empty_kits',(select count(*) from kits k where k.tenant_id=v_tenant_id and k.status='active' and not exists(select 1 from kit_items i where i.kit_id=k.id)),
    'kit_items_without_cmv',(select count(*) from kit_items i left join product_costs pc on pc.product_id=i.product_id where i.tenant_id=v_tenant_id and coalesce(pc.cmv,0)<=0),
    'orders_without_items',(select count(*) from orders o where o.tenant_id=v_tenant_id and not exists(select 1 from order_items i where i.order_id=o.id)),
    'closed_orders_without_snapshot',(select count(*) from orders o where o.tenant_id=v_tenant_id and o.status='closed' and (o.closed_at is null or o.cmv_total_snapshot is null or o.gross_revenue_snapshot is null)),
    'customers_without_uf',(select count(*) from customers c where c.tenant_id=v_tenant_id and c.active and nullif(btrim(c.uf),'') is null),
    'active_products_without_open_allocation',coalesce((
      select case when ep.id is null then count(p.id) else count(p.id) filter(where ea.id is null) end
      from products p
      left join lateral(select id from expense_allocation_periods where tenant_id=v_tenant_id and status='open' order by period desc limit 1) ep on true
      left join expense_allocations ea on ea.period_id=ep.id and ea.product_id=p.id
      where p.tenant_id=v_tenant_id and p.status='active'
      group by ep.id),0),
    'checked_at',now()
  );
end $$;
revoke execute on function public.get_data_quality_summary() from public,anon;
grant execute on function public.get_data_quality_summary() to authenticated;
