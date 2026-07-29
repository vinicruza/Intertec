-- Sprint B — Funções do ciclo comercial.
-- Separadas da migração anterior porque usam o valor 'lost' do enum
-- order_status, que o Postgres só enxerga depois da transação que o criou.

-- ------------------------------------------------------------------
-- 1. Gravar cotação empilhando uma versão
-- ------------------------------------------------------------------
-- Cada gravação regrava os itens e empilha uma versão com a foto do que foi
-- cotado. É o que permite responder depois "o que esse cliente pediu antes de
-- fechar?" e "o que foi cotado na proposta que perdemos?".
create or replace function public.save_quote_revision(
  p_order_id uuid,
  p_order jsonb,
  p_items jsonb,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_order_id uuid := p_order_id;
  v_customer_id uuid;
  v_version integer;
  v_status order_status;
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem tenant ativo';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cotação sem itens';
  end if;

  v_customer_id := nullif(p_order->>'customer_id', '')::uuid;
  if v_customer_id is null and nullif(btrim(p_order->>'customer_name'), '') is not null then
    insert into public.customers (tenant_id, name, uf)
    values (v_tenant_id, btrim(p_order->>'customer_name'), p_order->>'uf')
    returning id into v_customer_id;
  end if;

  if v_order_id is null then
    insert into public.orders (tenant_id, status, customer_id, uf, seller_id, channel_id,
                               freight, freight_paid_by_customer, commission_rate, created_by)
    values (v_tenant_id, 'simulation', v_customer_id, p_order->>'uf',
            (p_order->>'seller_id')::uuid, (p_order->>'channel_id')::uuid,
            (p_order->>'freight')::numeric, (p_order->>'freight_paid_by_customer')::boolean,
            (p_order->>'commission_rate')::numeric, auth.uid())
    returning id into v_order_id;
  else
    select status into v_status from public.orders
     where id = v_order_id and tenant_id = v_tenant_id;
    if not found then raise exception 'Cotação não encontrada'; end if;
    if v_status <> 'simulation' then
      raise exception 'Só é possível editar cotação em aberto; esta já foi ganha ou perdida';
    end if;

    update public.orders
       set customer_id = coalesce(v_customer_id, customer_id),
           uf = p_order->>'uf',
           seller_id = (p_order->>'seller_id')::uuid,
           channel_id = (p_order->>'channel_id')::uuid,
           freight = (p_order->>'freight')::numeric,
           freight_paid_by_customer = (p_order->>'freight_paid_by_customer')::boolean,
           commission_rate = (p_order->>'commission_rate')::numeric
     where id = v_order_id and tenant_id = v_tenant_id;

    delete from public.order_items where order_id = v_order_id;
  end if;

  insert into public.order_items (tenant_id, order_id, product_id, kit_id, quantity, unit_price,
                                  ad_hoc_kit_signature, ad_hoc_kit_composition,
                                  ad_hoc_kit_packaging, ad_hoc_kit_label)
  select v_tenant_id, v_order_id, x.product_id, x.kit_id, x.quantity, x.unit_price,
         x.ad_hoc_kit_signature, x.ad_hoc_kit_composition, x.ad_hoc_kit_packaging, x.ad_hoc_kit_label
    from jsonb_to_recordset(p_items) as x(
      product_id uuid, kit_id uuid, quantity numeric, unit_price numeric,
      ad_hoc_kit_signature text, ad_hoc_kit_composition jsonb,
      ad_hoc_kit_packaging jsonb, ad_hoc_kit_label text
    );

  if (select count(*) from public.order_items where order_id = v_order_id)
       <> jsonb_array_length(p_items) then
    raise exception 'Nem todos os itens da cotação foram persistidos';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
    from public.order_versions where order_id = v_order_id;

  insert into public.order_versions (tenant_id, order_id, version, snapshot, created_by)
  values (v_tenant_id, v_order_id, v_version, coalesce(p_snapshot, '{}'::jsonb), auth.uid());

  return jsonb_build_object(
    'id', v_order_id,
    'version', v_version,
    'quote_number', (select quote_number from public.orders where id = v_order_id)
  );
end $$;

-- ------------------------------------------------------------------
-- 2. Marcar cotação como perdida, com motivo
-- ------------------------------------------------------------------
-- "Por que a gente não vendeu? Ah, porque a gente não tinha preço." Sem o
-- motivo registrado, a análise depois não existe.
create or replace function public.mark_order_lost(
  p_order_id uuid,
  p_loss_reason_id uuid,
  p_notes text default null
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_status order_status;
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem tenant ativo';
  end if;
  if p_loss_reason_id is null then
    raise exception 'Informe o motivo da perda';
  end if;
  if not exists (select 1 from public.loss_reasons
                  where id = p_loss_reason_id and tenant_id = v_tenant_id and active) then
    raise exception 'Motivo de perda inválido';
  end if;

  select status into v_status from public.orders
   where id = p_order_id and tenant_id = v_tenant_id;
  if not found then raise exception 'Cotação não encontrada'; end if;
  if v_status = 'closed' then
    raise exception 'Pedido já foi ganho; não pode ser marcado como perdido';
  end if;

  update public.orders
     set status = 'lost',
         lost_at = now(),
         lost_by = auth.uid(),
         loss_reason_id = p_loss_reason_id,
         loss_notes = nullif(btrim(p_notes), '')
   where id = p_order_id and tenant_id = v_tenant_id;

  insert into public.audit_logs (tenant_id, entity, entity_id, action, old_value, new_value, user_id)
  values (v_tenant_id, 'orders', p_order_id, 'mark_lost',
          jsonb_build_object('status', v_status),
          jsonb_build_object('loss_reason_id', p_loss_reason_id, 'notes', p_notes),
          auth.uid());
end $$;

-- Reabrir uma cotação perdida (o cliente voltou atrás).
create or replace function public.reopen_lost_order(p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare v_tenant_id uuid := public.current_tenant_id();
begin
  update public.orders
     set status = 'simulation', lost_at = null, lost_by = null,
         loss_reason_id = null, loss_notes = null
   where id = p_order_id and tenant_id = v_tenant_id and status = 'lost';
  if not found then raise exception 'Cotação perdida não encontrada'; end if;

  insert into public.audit_logs (tenant_id, entity, entity_id, action, old_value, new_value, user_id)
  values (v_tenant_id, 'orders', p_order_id, 'reopen_lost',
          jsonb_build_object('status', 'lost'), jsonb_build_object('status', 'simulation'), auth.uid());
end $$;

-- ------------------------------------------------------------------
-- 3. Materializar os kits montados na hora, quando o pedido é ganho
-- ------------------------------------------------------------------
-- Decisão da reunião: o código oficial do kit só nasce no fechamento. Se a
-- mesma composição já existe, REAPROVEITA o código — "se vender esse mesmo kit
-- futuramente vai ser o mesmo código".
create or replace function public.materialize_ad_hoc_kits(p_order_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_item record;
  v_kit_id uuid;
  v_nome text;
  v_criados integer := 0;
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem tenant ativo';
  end if;

  for v_item in
    select id, ad_hoc_kit_signature, ad_hoc_kit_composition, ad_hoc_kit_packaging, ad_hoc_kit_label
      from public.order_items
     where order_id = p_order_id and tenant_id = v_tenant_id
       and ad_hoc_kit_composition is not null
  loop
    if nullif(btrim(v_item.ad_hoc_kit_signature), '') is null then
      raise exception 'Kit montado sem assinatura — não é possível materializar';
    end if;

    select id into v_kit_id from public.kits
     where tenant_id = v_tenant_id and signature = v_item.ad_hoc_kit_signature;

    if not found then
      v_nome := coalesce(nullif(btrim(v_item.ad_hoc_kit_label), ''), 'Kit do pedido');
      insert into public.kits (tenant_id, name, description, signature, created_by)
      values (v_tenant_id, v_nome, null, v_item.ad_hoc_kit_signature, auth.uid())
      returning id into v_kit_id;

      insert into public.kit_items (tenant_id, kit_id, product_id, quantity)
      select v_tenant_id, v_kit_id, x.product_id, x.quantity
        from jsonb_to_recordset(v_item.ad_hoc_kit_composition) as x(product_id uuid, quantity numeric);

      if jsonb_typeof(v_item.ad_hoc_kit_packaging) = 'array'
         and jsonb_array_length(v_item.ad_hoc_kit_packaging) > 0 then
        insert into public.kit_packaging (tenant_id, kit_id, input_id, quantity)
        select v_tenant_id, v_kit_id, x.input_id, x.quantity
          from jsonb_to_recordset(v_item.ad_hoc_kit_packaging) as x(input_id uuid, quantity numeric);
      end if;

      v_criados := v_criados + 1;
    end if;

    update public.order_items
       set kit_id = v_kit_id,
           ad_hoc_kit_signature = null,
           ad_hoc_kit_composition = null,
           ad_hoc_kit_packaging = null,
           ad_hoc_kit_label = null
     where id = v_item.id;
  end loop;

  return v_criados;
end $$;

revoke execute on function public.save_quote_revision(uuid, jsonb, jsonb, jsonb) from public, anon;
revoke execute on function public.mark_order_lost(uuid, uuid, text) from public, anon;
revoke execute on function public.reopen_lost_order(uuid) from public, anon;
revoke execute on function public.materialize_ad_hoc_kits(uuid) from public, anon;
grant execute on function public.save_quote_revision(uuid, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.mark_order_lost(uuid, uuid, text) to authenticated;
grant execute on function public.reopen_lost_order(uuid) to authenticated;
grant execute on function public.materialize_ad_hoc_kits(uuid) to authenticated;
