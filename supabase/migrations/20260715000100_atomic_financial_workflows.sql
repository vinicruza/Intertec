-- Operações financeiras críticas devem ser atômicas: ou toda a alteração é
-- persistida, ou nenhuma parte dela é. As funções usam SECURITY INVOKER para
-- manter as políticas RLS como fonte de autorização.

create or replace function public.save_kit_with_items(
  p_kit_id uuid,
  p_code text,
  p_name text,
  p_description text,
  p_signature text,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_kit_id uuid := p_kit_id;
  v_existing record;
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem tenant ativo';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Nome do kit é obrigatório';
  end if;
  if nullif(btrim(p_signature), '') is null then
    raise exception 'Assinatura do kit é obrigatória';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Kit deve possuir ao menos um item';
  end if;

  select id, name into v_existing
    from public.kits
   where tenant_id = v_tenant_id
     and signature = p_signature
     and (p_kit_id is null or id <> p_kit_id)
   limit 1;
  if found then
    return jsonb_build_object(
      'tipo', 'duplicado',
      'kitExistente', jsonb_build_object('id', v_existing.id, 'name', v_existing.name)
    );
  end if;

  if v_kit_id is null then
    insert into public.kits (tenant_id, code, name, description, signature)
    values (v_tenant_id, nullif(btrim(p_code), ''), btrim(p_name),
            nullif(btrim(p_description), ''), p_signature)
    returning id into v_kit_id;
  else
    update public.kits
       set code = coalesce(nullif(btrim(p_code), ''), code),
           name = btrim(p_name),
           description = nullif(btrim(p_description), ''),
           signature = p_signature
     where id = v_kit_id and tenant_id = v_tenant_id;
    if not found then raise exception 'Kit não encontrado'; end if;
    delete from public.kit_items where kit_id = v_kit_id;
  end if;

  insert into public.kit_items (tenant_id, kit_id, product_id, quantity)
  select v_tenant_id, v_kit_id, x.product_id, x.quantity
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric);

  if (select count(*) from public.kit_items where kit_id = v_kit_id)
       <> jsonb_array_length(p_items) then
    raise exception 'Nem todos os itens do kit foram persistidos';
  end if;

  return jsonb_build_object('tipo', case when p_kit_id is null then 'criado' else 'atualizado' end,
                            'id', v_kit_id);
exception
  when unique_violation then
    select id, name into v_existing
      from public.kits
     where tenant_id = v_tenant_id and signature = p_signature
     limit 1;
    if found then
      return jsonb_build_object('tipo', 'duplicado',
        'kitExistente', jsonb_build_object('id', v_existing.id, 'name', v_existing.name));
    end if;
    raise;
end;
$$;

create or replace function public.close_order_with_snapshots(
  p_order_id uuid,
  p_order_snapshot jsonb,
  p_item_snapshots jsonb,
  p_freight numeric,
  p_commission_rate numeric
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_order public.orders%rowtype;
  v_item jsonb;
  v_updated integer := 0;
  v_expected integer;
begin
  select * into v_order
    from public.orders
   where id = p_order_id and tenant_id = v_tenant_id
   for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_order.status = 'closed' then raise exception 'Pedido já está fechado'; end if;
  if jsonb_typeof(p_item_snapshots) <> 'array' then
    raise exception 'Snapshots dos itens devem ser uma lista';
  end if;

  select count(*) into v_expected from public.order_items where order_id = p_order_id;
  if v_expected = 0 or v_expected <> jsonb_array_length(p_item_snapshots) then
    raise exception 'Snapshot incompleto: quantidade de itens divergente';
  end if;

  for v_item in select value from jsonb_array_elements(p_item_snapshots)
  loop
    update public.order_items
       set cmv_unit_snapshot = (v_item->>'cmv_unit_snapshot')::numeric,
           expense_unit_snapshot = (v_item->>'expense_unit_snapshot')::numeric,
           tax_rate_snapshot = (v_item->>'tax_rate_snapshot')::numeric,
           difal_rate_snapshot = (v_item->>'difal_rate_snapshot')::numeric,
           commission_rate_snapshot = (v_item->>'commission_rate_snapshot')::numeric,
           freight_share_snapshot = (v_item->>'freight_share_snapshot')::numeric,
           kit_composition_snapshot = v_item->'kit_composition_snapshot'
     where id = (v_item->>'orderItemId')::uuid
       and order_id = p_order_id and tenant_id = v_tenant_id;
    if not found then raise exception 'Item de pedido inválido no snapshot'; end if;
    v_updated := v_updated + 1;
  end loop;

  if v_updated <> v_expected then raise exception 'Snapshot incompleto'; end if;

  update public.orders
     set gross_revenue_snapshot = (p_order_snapshot->>'gross_revenue_snapshot')::numeric,
         tax_snapshot = (p_order_snapshot->>'tax_snapshot')::numeric,
         freight_tax_snapshot = (p_order_snapshot->>'freight_tax_snapshot')::numeric,
         difal_snapshot = (p_order_snapshot->>'difal_snapshot')::numeric,
         commission_amount_snapshot = (p_order_snapshot->>'commission_amount_snapshot')::numeric,
         net_revenue_snapshot = (p_order_snapshot->>'net_revenue_snapshot')::numeric,
         cmv_total_snapshot = (p_order_snapshot->>'cmv_total_snapshot')::numeric,
         expense_total_snapshot = (p_order_snapshot->>'expense_total_snapshot')::numeric,
         contribution_margin_snapshot = (p_order_snapshot->>'contribution_margin_snapshot')::numeric,
         result_after_allocation_snapshot = (p_order_snapshot->>'result_after_allocation_snapshot')::numeric,
         totals_display = p_order_snapshot->'totals_display',
         freight = p_freight,
         commission_rate = p_commission_rate,
         status = 'closed'
   where id = p_order_id and tenant_id = v_tenant_id;
end;
$$;

-- Um fechamento nunca é desfeito. Uma correção nasce como nova simulação e
-- mantém vínculo auditável com o pedido fechado de origem.
alter table public.orders
  add column if not exists revised_from_order_id uuid references public.orders(id);
alter table public.orders
  add column if not exists revision_reason text;
create index if not exists orders_revised_from_order_id_idx
  on public.orders(revised_from_order_id);

create or replace function public.copy_order_as_simulation(p_order_id uuid, p_reason text default 'duplicate')
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_source public.orders%rowtype;
  v_new_id uuid;
begin
  select * into v_source from public.orders
   where id = p_order_id and tenant_id = v_tenant_id;
  if not found then raise exception 'Pedido não encontrado'; end if;

  insert into public.orders
    (tenant_id, status, customer_id, uf, seller_id, channel_id, freight,
     freight_paid_by_customer, commission_rate, created_by, revised_from_order_id, revision_reason)
  values
    (v_tenant_id, 'simulation', v_source.customer_id, v_source.uf, v_source.seller_id,
     v_source.channel_id, v_source.freight, v_source.freight_paid_by_customer,
     v_source.commission_rate, auth.uid(),
     case when v_source.status = 'closed' then v_source.id else v_source.revised_from_order_id end,
     nullif(btrim(p_reason), ''))
  returning id into v_new_id;

  insert into public.order_items
    (tenant_id, order_id, product_id, kit_id, quantity, unit_price)
  select v_tenant_id, v_new_id, product_id, kit_id, quantity, unit_price
    from public.order_items where order_id = p_order_id;

  return v_new_id;
end;
$$;

create or replace function public.log_order_revision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_status text;
begin
  if new.revised_from_order_id is null then return new; end if;
  select status::text into v_source_status
    from public.orders
   where id = new.revised_from_order_id and tenant_id = new.tenant_id;
  insert into public.audit_logs
    (tenant_id, entity, entity_id, action, old_value, new_value, user_id)
  values
    (new.tenant_id, 'orders', new.revised_from_order_id,
     coalesce(new.revision_reason, 'revision_created'),
     jsonb_build_object('source_status', v_source_status),
     jsonb_build_object('new_order_id', new.id), auth.uid());
  return new;
end;
$$;

drop trigger if exists trg_orders_revision_audit on public.orders;
create trigger trg_orders_revision_audit
after insert on public.orders
for each row when (new.revised_from_order_id is not null)
execute function public.log_order_revision();
revoke execute on function public.log_order_revision() from public, anon, authenticated;

create or replace function public.protect_closed_order()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.status = 'closed' then
    raise exception 'Pedido fechado é imutável; crie uma revisão vinculada ao original';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- Funções antigas de sequência continuam apenas por compatibilidade, mas com
-- search_path fixo para eliminar resolução insegura de objetos.
alter function public.next_product_code() set search_path = public, pg_temp;
alter function public.next_kit_code() set search_path = public, pg_temp;

revoke execute on function public.save_kit_with_items(uuid,text,text,text,text,jsonb) from public, anon;
revoke execute on function public.close_order_with_snapshots(uuid,jsonb,jsonb,numeric,numeric) from public, anon;
revoke execute on function public.copy_order_as_simulation(uuid,text) from public, anon;
grant execute on function public.save_kit_with_items(uuid,text,text,text,text,jsonb) to authenticated;
grant execute on function public.close_order_with_snapshots(uuid,jsonb,jsonb,numeric,numeric) to authenticated;
grant execute on function public.copy_order_as_simulation(uuid,text) to authenticated;

-- Recalcula custos em ordem de dependência dentro da transação corrente. O
-- custo digitado nunca é aceito: a fonte é ficha técnica + custo dos insumos.
create or replace function public.recalculate_product_costs()
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_before integer;
  v_after integer := 0;
  v_total integer;
begin
  if public.current_user_role() not in ('admin','financeiro') then
    raise exception 'Sem permissão para recalcular CMV';
  end if;
  create temporary table if not exists tmp_product_costs(
    product_id uuid primary key,
    cmv numeric not null
  ) on commit drop;
  truncate tmp_product_costs;

  select count(distinct product_id) into v_total
    from public.product_components where tenant_id = v_tenant_id;

  loop
    v_before := v_after;
    insert into tmp_product_costs(product_id, cmv)
    select pc.product_id,
           sum(pc.computed_quantity * coalesce(i.price_without_tax, child.cmv))
      from public.product_components pc
      left join public.inputs i on i.id = pc.component_input_id and i.tenant_id = v_tenant_id
      left join tmp_product_costs child on child.product_id = pc.component_product_id
     where pc.tenant_id = v_tenant_id
       and not exists (select 1 from tmp_product_costs done where done.product_id = pc.product_id)
     group by pc.product_id
    having bool_and(
      (pc.component_input_id is not null and i.price_without_tax is not null and i.price_without_tax > 0)
      or (pc.component_product_id is not null and child.cmv is not null and child.cmv > 0)
    )
    on conflict (product_id) do nothing;
    get diagnostics v_after = row_count;
    select count(*) into v_after from tmp_product_costs;
    exit when v_after = v_before;
  end loop;

  if v_after <> v_total then
    raise exception 'CMV não recalculado: existem componentes sem custo ou dependência inválida (% de % produtos)', v_after, v_total;
  end if;

  insert into public.product_costs(product_id, tenant_id, cmv, calculated_at)
  select product_id, v_tenant_id, cmv, now() from tmp_product_costs
  on conflict (product_id) do update set cmv = excluded.cmv, calculated_at = excluded.calculated_at;
  return v_after;
end;
$$;

create or replace function public.save_product_with_components(
  p_product_id uuid,
  p_product jsonb,
  p_components jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_product_id uuid := p_product_id;
begin
  if jsonb_typeof(p_components) <> 'array' or jsonb_array_length(p_components) = 0 then
    raise exception 'Produto deve possuir ao menos um componente';
  end if;
  if v_product_id is null then
    insert into public.products(tenant_id, code, name, category, type, sterile, size, grammage)
    values (v_tenant_id, nullif(btrim(p_product->>'code'), ''), btrim(p_product->>'name'),
      nullif(btrim(p_product->>'category'), ''), nullif(btrim(p_product->>'type'), ''),
      coalesce((p_product->>'sterile')::boolean,false), nullif(btrim(p_product->>'size'), ''),
      nullif(btrim(p_product->>'grammage'), '')) returning id into v_product_id;
  else
    update public.products set
      name=btrim(p_product->>'name'), category=nullif(btrim(p_product->>'category'), ''),
      type=nullif(btrim(p_product->>'type'), ''), sterile=coalesce((p_product->>'sterile')::boolean,false),
      size=nullif(btrim(p_product->>'size'), ''), grammage=nullif(btrim(p_product->>'grammage'), '')
    where id=v_product_id and tenant_id=v_tenant_id;
    if not found then raise exception 'Produto não encontrado'; end if;
    delete from public.product_components where product_id=v_product_id;
  end if;

  insert into public.product_components
    (tenant_id,product_id,component_input_id,component_product_id,quantity_type,
     quantity,width,length,yield_rate,lot_size,computed_quantity)
  select v_tenant_id,v_product_id,x.component_input_id,x.component_product_id,
    x.quantity_type::public.quantity_type,x.quantity,x.width,x.length,x.yield_rate,x.lot_size,x.computed_quantity
  from jsonb_to_recordset(p_components) x(
    component_input_id uuid,component_product_id uuid,quantity_type text,quantity numeric,
    width numeric,length numeric,yield_rate numeric,lot_size numeric,computed_quantity numeric);
  perform public.recalculate_product_costs();
  return v_product_id;
end;
$$;

create or replace function public.save_input_and_recalculate(p_input_id uuid, p_input jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_input_id uuid := p_input_id;
begin
  if v_input_id is null then
    insert into public.inputs(tenant_id,name,category,purchase_unit,purchase_price,conversion_factor,
      consumption_unit,icms_rate,pis_cofins_rate,price_with_tax,price_without_tax,price_updated_at)
    values(v_tenant_id,btrim(p_input->>'name'),nullif(btrim(p_input->>'category'),''),
      nullif(btrim(p_input->>'purchase_unit'),''),(p_input->>'purchase_price')::numeric,
      (p_input->>'conversion_factor')::numeric,nullif(btrim(p_input->>'consumption_unit'),''),
      (p_input->>'icms_rate')::numeric,(p_input->>'pis_cofins_rate')::numeric,
      (p_input->>'price_with_tax')::numeric,(p_input->>'price_without_tax')::numeric,now())
    returning id into v_input_id;
  else
    update public.inputs set name=btrim(p_input->>'name'),category=nullif(btrim(p_input->>'category'),''),
      purchase_unit=nullif(btrim(p_input->>'purchase_unit'),''),purchase_price=(p_input->>'purchase_price')::numeric,
      conversion_factor=(p_input->>'conversion_factor')::numeric,consumption_unit=nullif(btrim(p_input->>'consumption_unit'),''),
      icms_rate=(p_input->>'icms_rate')::numeric,pis_cofins_rate=(p_input->>'pis_cofins_rate')::numeric,
      price_with_tax=(p_input->>'price_with_tax')::numeric,price_without_tax=(p_input->>'price_without_tax')::numeric
    where id=v_input_id and tenant_id=v_tenant_id;
    if not found then raise exception 'Insumo não encontrado'; end if;
  end if;
  perform public.recalculate_product_costs();
  return v_input_id;
end;
$$;

create or replace function public.create_order_with_items(p_order jsonb, p_items jsonb)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_tenant_id uuid:=public.current_tenant_id(); v_order_id uuid; v_customer_id uuid;
begin
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Pedido sem itens'; end if;
  v_customer_id:=nullif(p_order->>'customer_id','')::uuid;
  if v_customer_id is null and nullif(btrim(p_order->>'customer_name'),'') is not null then
    insert into public.customers(tenant_id,name,uf) values(v_tenant_id,btrim(p_order->>'customer_name'),p_order->>'uf') returning id into v_customer_id;
  end if;
  insert into public.orders(tenant_id,status,customer_id,uf,seller_id,channel_id,freight,freight_paid_by_customer,commission_rate,created_by)
  values(v_tenant_id,'simulation',v_customer_id,p_order->>'uf',(p_order->>'seller_id')::uuid,(p_order->>'channel_id')::uuid,
    (p_order->>'freight')::numeric,(p_order->>'freight_paid_by_customer')::boolean,(p_order->>'commission_rate')::numeric,auth.uid())
  returning id into v_order_id;
  insert into public.order_items(tenant_id,order_id,product_id,kit_id,quantity,unit_price)
  select v_tenant_id,v_order_id,x.product_id,x.kit_id,x.quantity,x.unit_price
  from jsonb_to_recordset(p_items) x(product_id uuid,kit_id uuid,quantity numeric,unit_price numeric);
  return v_order_id;
end $$;

revoke execute on function public.recalculate_product_costs() from public,anon;
revoke execute on function public.save_product_with_components(uuid,jsonb,jsonb) from public,anon;
revoke execute on function public.save_input_and_recalculate(uuid,jsonb) from public,anon;
revoke execute on function public.create_order_with_items(jsonb,jsonb) from public,anon;
grant execute on function public.recalculate_product_costs() to authenticated;
grant execute on function public.save_product_with_components(uuid,jsonb,jsonb) to authenticated;
grant execute on function public.save_input_and_recalculate(uuid,jsonb) to authenticated;
grant execute on function public.create_order_with_items(jsonb,jsonb) to authenticated;
