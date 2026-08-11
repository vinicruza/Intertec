-- Correção operacional autorizada em 11/08/2026.
--
-- O pedido ORC-2026-0010 foi fechado com o produto placeholder "Kit
-- Aleatório", sem composição. A composição correta já existia no kit
-- KC0020 ("kit exclusivo"). Esta migration troca o item para o kit correto,
-- grava a composição na ficha e recalcula os snapshots financeiros afetados.

do $$
declare
  v_order_id uuid;
  v_item_id uuid;
  v_tenant_id uuid;
  v_old_product_id uuid;
  v_old_kit_id uuid;
  v_old_cmv_unit numeric;
  v_old_composition jsonb;
  v_old_cmv_total numeric;
  v_old_margin numeric;
  v_old_result numeric;
  v_old_totals jsonb;
  v_net_revenue numeric;
  v_quantity numeric;
  v_kit_id uuid := 'bcb184a5-9032-45b8-a712-55aa7d3535df'::uuid;
  v_kit_code text;
  v_kit_name text;
  v_composition jsonb;
  v_cmv_unit numeric;
  v_cmv_total numeric;
  v_margin numeric;
begin
  select o.id, o.tenant_id, oi.id, oi.product_id, oi.kit_id, oi.cmv_unit_snapshot,
         oi.kit_composition_snapshot, o.cmv_total_snapshot, o.contribution_margin_snapshot,
         o.result_after_allocation_snapshot, o.totals_display, o.net_revenue_snapshot, oi.quantity
    into v_order_id, v_tenant_id, v_item_id, v_old_product_id, v_old_kit_id, v_old_cmv_unit,
         v_old_composition, v_old_cmv_total, v_old_margin,
         v_old_result, v_old_totals, v_net_revenue, v_quantity
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
   where o.quote_number = 'ORC-2026-0010'
     and oi.product_id = '41eef11d-52b7-4f6b-b4d7-367f4658e909'::uuid;

  if v_item_id is null then
    return;
  end if;

  select k.code, k.name,
         jsonb_agg(jsonb_build_object(
           'produtoId', ki.product_id,
           'nome', p.name,
           'quantidade', ki.quantity,
           'cmvUnitario', pc.cmv
         ) order by p.name),
         sum(ki.quantity * pc.cmv)
    into v_kit_code, v_kit_name, v_composition, v_cmv_unit
    from public.kits k
    join public.kit_items ki on ki.kit_id = k.id
    join public.products p on p.id = ki.product_id
    join public.product_costs pc on pc.product_id = ki.product_id
   where k.id = v_kit_id
   group by k.code, k.name;

  if v_composition is null or v_cmv_unit is null then
    raise exception 'Kit KC0020 sem composição/custo para correção';
  end if;

  v_cmv_total := v_cmv_unit * v_quantity;
  v_margin := v_net_revenue - v_cmv_total;

  alter table public.order_items disable trigger trg_order_items_immutable;
  alter table public.orders disable trigger trg_orders_immutable;

  update public.order_items
     set product_id = null,
         kit_id = v_kit_id,
         cmv_unit_snapshot = v_cmv_unit,
         expense_unit_snapshot = 0,
         kit_composition_snapshot = v_composition,
         item_code_snapshot = v_kit_code,
         item_name_snapshot = '[Kit] ' || v_kit_name,
         updated_at = now()
   where id = v_item_id;

  update public.orders
     set cmv_total_snapshot = v_cmv_total,
         contribution_margin_snapshot = v_margin,
         result_after_allocation_snapshot = v_margin,
         totals_display = v_old_totals || jsonb_build_object(
           'cmv', to_char(round(v_cmv_total, 2), 'FM9999999990.00'),
           'margem_contribuicao', to_char(round(v_margin, 2), 'FM9999999990.00'),
           'resultado_apos_rateio', to_char(round(v_margin, 2), 'FM9999999990.00')
         ),
         updated_at = now()
   where id = v_order_id;

  alter table public.orders enable trigger trg_orders_immutable;
  alter table public.order_items enable trigger trg_order_items_immutable;

  insert into public.audit_logs (tenant_id, entity, entity_id, action, old_value, new_value, user_id)
  values (
    v_tenant_id,
    'orders',
    v_order_id,
    'manual_fix_kit_aleatorio',
    jsonb_build_object(
      'quote_number', 'ORC-2026-0010',
      'order_item_id', v_item_id,
      'product_id', v_old_product_id,
      'kit_id', v_old_kit_id,
      'cmv_unit_snapshot', v_old_cmv_unit,
      'kit_composition_snapshot', v_old_composition,
      'cmv_total_snapshot', v_old_cmv_total,
      'contribution_margin_snapshot', v_old_margin,
      'result_after_allocation_snapshot', v_old_result,
      'totals_display', v_old_totals
    ),
    jsonb_build_object(
      'quote_number', 'ORC-2026-0010',
      'order_item_id', v_item_id,
      'product_id', null,
      'kit_id', v_kit_id,
      'kit_code', v_kit_code,
      'kit_name', v_kit_name,
      'cmv_unit_snapshot', v_cmv_unit,
      'kit_composition_snapshot', v_composition,
      'cmv_total_snapshot', v_cmv_total,
      'contribution_margin_snapshot', v_margin,
      'result_after_allocation_snapshot', v_margin
    ),
    null
  );
exception when others then
  alter table public.orders enable trigger trg_orders_immutable;
  alter table public.order_items enable trigger trg_order_items_immutable;
  raise;
end $$;
