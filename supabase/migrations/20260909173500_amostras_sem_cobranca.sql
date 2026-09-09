-- ============================================================
-- Solicitação de amostra sem cobrança
-- Pedido da Intertech em 09/09/2026.
-- ============================================================
--
-- Amostra não é venda com preço ruim: o produto sai do estoque/CMV, mas o
-- cliente não paga nada e a margem comercial não pode ser contaminada.

alter table public.orders
  add column if not exists order_kind text not null default 'sale',
  add column if not exists sample_reason text,
  add column if not exists sample_authorized_by text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'orders_order_kind_check'
       and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_order_kind_check check (order_kind in ('sale', 'sample'));
  end if;
end $$;

create index if not exists orders_order_kind_idx on public.orders (tenant_id, order_kind);

comment on column public.orders.order_kind is 'sale = venda normal; sample = amostra sem cobrança ao cliente.';
comment on column public.orders.sample_reason is 'Motivo informado para envio de amostra sem cobrança.';
comment on column public.orders.sample_authorized_by is 'Pessoa que autorizou o envio de amostra sem cobrança.';

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
  v_approval approval_status;
  v_approval_notes text;
  v_auto_approved boolean := false;
  v_carrier_id uuid := nullif(p_order->>'carrier_id', '')::uuid;
  v_carrier_other text := nullif(btrim(p_order->>'carrier_other'), '');
  v_weight_kg numeric := nullif(p_order->>'weight_kg', '')::numeric;
  v_volumes integer := nullif(p_order->>'volumes', '')::integer;
  v_volumes_composition text := nullif(btrim(p_order->>'volumes_composition'), '');
  v_shipping_zip text := nullif(regexp_replace(coalesce(p_order->>'shipping_zip', ''), '\D', '', 'g'), '');
  v_payment_term_id uuid := nullif(p_order->>'payment_term_id', '')::uuid;
  v_payment_term integer := nullif(p_order->>'payment_term_days', '')::integer;
  v_order_notes text := nullif(btrim(p_order->>'order_notes'), '');
  v_order_kind text := coalesce(nullif(p_order->>'order_kind', ''), 'sale');
  v_sample_reason text := nullif(btrim(p_order->>'sample_reason'), '');
  v_sample_authorized_by text := nullif(btrim(p_order->>'sample_authorized_by'), '');
  v_applies_difal boolean;
  v_customer_tax_id text := nullif(regexp_replace(coalesce(p_order->>'customer_tax_id',''), '[^0-9]', '', 'g'), '');
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem tenant ativo';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cotação sem itens';
  end if;
  if v_order_kind not in ('sale', 'sample') then
    raise exception 'Tipo de solicitação inválido';
  end if;
  if v_order_kind = 'sample' and (v_sample_reason is null or v_sample_authorized_by is null) then
    raise exception 'Amostra exige motivo e autorização';
  end if;

  if v_payment_term_id is not null and not exists (
    select 1 from public.payment_terms
     where id = v_payment_term_id and tenant_id = v_tenant_id and active
  ) then
    raise exception 'Modo de pagamento inválido';
  end if;

  v_customer_id := nullif(p_order->>'customer_id', '')::uuid;
  if v_customer_id is null and nullif(btrim(p_order->>'customer_name'), '') is not null then
    if v_customer_tax_id is not null then
      select id into v_customer_id from public.customers
       where tenant_id = v_tenant_id and tax_id = v_customer_tax_id;
    end if;

    if v_customer_id is null then
      insert into public.customers (tenant_id, name, uf, tax_id)
      values (v_tenant_id, btrim(p_order->>'customer_name'), p_order->>'uf', v_customer_tax_id)
      returning id into v_customer_id;
    end if;
  end if;

  v_applies_difal := coalesce(
    (p_order->>'applies_difal')::boolean,
    (select applies_difal from public.channels where id = (p_order->>'channel_id')::uuid),
    true
  );

  if v_order_id is null then
    insert into public.orders (tenant_id, status, customer_id, uf, seller_id, channel_id,
                               freight, freight_paid_by_customer, commission_rate, applies_difal, created_by,
                               carrier_id, carrier_other, weight_kg, volumes, volumes_composition, shipping_zip,
                               payment_term_id, payment_term_days, order_notes,
                               order_kind, sample_reason, sample_authorized_by)
    values (v_tenant_id, 'simulation', v_customer_id, p_order->>'uf',
            (p_order->>'seller_id')::uuid, (p_order->>'channel_id')::uuid,
            (p_order->>'freight')::numeric, (p_order->>'freight_paid_by_customer')::boolean,
            (p_order->>'commission_rate')::numeric, v_applies_difal, auth.uid(),
            v_carrier_id, v_carrier_other, v_weight_kg, v_volumes, v_volumes_composition, v_shipping_zip,
            v_payment_term_id, v_payment_term, v_order_notes,
            v_order_kind, v_sample_reason, v_sample_authorized_by)
    returning id into v_order_id;
  else
    select status, approval_status, approval_notes
      into v_status, v_approval, v_approval_notes
      from public.orders
     where id = v_order_id and tenant_id = v_tenant_id;
    if not found then raise exception 'Cotação não encontrada'; end if;
    v_auto_approved := v_approval = 'aprovado' and coalesce(v_approval_notes, '') ilike 'Aprovado automaticamente pela margem%';

    if v_status <> 'simulation' then
      raise exception 'Só é possível editar cotação em aberto; esta já foi ganha ou perdida';
    end if;
    if v_approval = 'pendente' then
      raise exception 'Cotação aguardando aprovação não pode ser editada; aguarde a decisão';
    end if;
    if v_approval = 'aprovado' and not v_auto_approved then
      raise exception 'Cotação já aprovada não pode ser editada; feche o pedido ou peça para recusarem a aprovação';
    end if;

    update public.orders
       set customer_id = coalesce(v_customer_id, customer_id),
           uf = p_order->>'uf',
           seller_id = (p_order->>'seller_id')::uuid,
           channel_id = (p_order->>'channel_id')::uuid,
           freight = (p_order->>'freight')::numeric,
           freight_paid_by_customer = (p_order->>'freight_paid_by_customer')::boolean,
           commission_rate = (p_order->>'commission_rate')::numeric,
           applies_difal = v_applies_difal,
           carrier_id = v_carrier_id,
           carrier_other = v_carrier_other,
           weight_kg = v_weight_kg,
           volumes = v_volumes,
           volumes_composition = v_volumes_composition,
           shipping_zip = v_shipping_zip,
           payment_term_id = v_payment_term_id,
           payment_term_days = v_payment_term,
           order_notes = v_order_notes,
           order_kind = v_order_kind,
           sample_reason = case when v_order_kind = 'sample' then v_sample_reason else null end,
           sample_authorized_by = case when v_order_kind = 'sample' then v_sample_authorized_by else null end,
           approval_status = case when v_approval = 'recusado' or v_auto_approved then 'rascunho'::approval_status else approval_status end,
           submitted_at = case when v_approval = 'recusado' or v_auto_approved then null else submitted_at end,
           submitted_by = case when v_approval = 'recusado' or v_auto_approved then null else submitted_by end,
           approved_at = case when v_approval = 'recusado' or v_auto_approved then null else approved_at end,
           approved_by = case when v_approval = 'recusado' or v_auto_approved then null else approved_by end,
           approval_notes = case when v_approval = 'recusado' or v_auto_approved then null else approval_notes end
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
    'quote_number', (select quote_number from public.orders where id = v_order_id),
    'order_number', (select order_number from public.orders where id = v_order_id)
  );
end $$;

create or replace function public.protect_closed_order()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_expedicao text[] := array[
    'carrier_id', 'carrier_other', 'freight_quotes', 'weight_kg', 'volumes',
    'volumes_composition',
    'shipping_zip', 'shipping_city', 'shipping_state',
    'payment_term_id', 'payment_term_days', 'order_notes', 'updated_at'
  ];
begin
  if tg_op='DELETE' then
    if old.status='closed' or old.cancelled_at is not null then
      raise exception 'Pedido fechado ou cancelado não pode ser excluído';
    end if;
    return old;
  end if;

  if old.cancelled_at is not null then
    raise exception 'Pedido cancelado é imutável';
  end if;

  if new.cancelled_at is not null then
    if (to_jsonb(new)-'cancelled_at'-'cancelled_by'-'cancellation_reason'-'updated_at')
       <> (to_jsonb(old)-'cancelled_at'-'cancelled_by'-'cancellation_reason'-'updated_at') then
      raise exception 'Cancelamento não pode alterar os dados financeiros do pedido';
    end if;
    insert into public.audit_logs(tenant_id,entity,entity_id,action,old_value,new_value,user_id)
    values(old.tenant_id,'orders',old.id,'cancel',
      jsonb_build_object('status',old.status),
      jsonb_build_object('cancelled_at',new.cancelled_at,'reason',new.cancellation_reason),auth.uid());
    return new;
  end if;

  if new.status='closed' and old.status is distinct from 'closed'
     and coalesce(new.order_kind, 'sale') <> 'sample'
     and not public.tem_cotacao_de_frete(new.freight_quotes) then
    raise exception 'Registre ao menos uma cotação de frete, com transportadora e valor, antes de prosseguir. Se o cliente for retirar, escolha a opção RETIRADA: nela não há valor de frete.';
  end if;

  if old.status='closed' then
    if (to_jsonb(new) - v_expedicao) is not distinct from (to_jsonb(old) - v_expedicao) then
      insert into public.audit_logs(tenant_id,entity,entity_id,action,old_value,new_value,user_id)
      values(old.tenant_id,'orders',old.id,'update_expedicao',
        jsonb_build_object(
          'carrier_id', old.carrier_id, 'carrier_other', old.carrier_other,
          'freight_quotes', old.freight_quotes,
          'weight_kg', old.weight_kg, 'volumes', old.volumes,
          'volumes_composition', old.volumes_composition,
          'shipping_zip', old.shipping_zip, 'shipping_city', old.shipping_city,
          'shipping_state', old.shipping_state, 'payment_term_id', old.payment_term_id,
          'payment_term_days', old.payment_term_days, 'order_notes', old.order_notes),
        jsonb_build_object(
          'carrier_id', new.carrier_id, 'carrier_other', new.carrier_other,
          'freight_quotes', new.freight_quotes,
          'weight_kg', new.weight_kg, 'volumes', new.volumes,
          'volumes_composition', new.volumes_composition,
          'shipping_zip', new.shipping_zip, 'shipping_city', new.shipping_city,
          'shipping_state', new.shipping_state, 'payment_term_id', new.payment_term_id,
          'payment_term_days', new.payment_term_days, 'order_notes', new.order_notes),
        auth.uid());
      return new;
    end if;

    raise exception 'Pedido fechado é imutável; crie uma revisão vinculada ao original';
  end if;
  return new;
end $$;

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
     freight_paid_by_customer, commission_rate, applies_difal, created_by,
     revised_from_order_id, revision_reason,
     carrier_id, carrier_other, shipping_zip, shipping_city, shipping_state,
     payment_term_id, payment_term_days, order_kind, sample_reason, sample_authorized_by)
  values
    (v_tenant_id, 'simulation', v_source.customer_id, v_source.uf, v_source.seller_id,
     v_source.channel_id, v_source.freight, v_source.freight_paid_by_customer,
     v_source.commission_rate, v_source.applies_difal, auth.uid(),
     case when v_source.status = 'closed' then v_source.id else v_source.revised_from_order_id end,
     nullif(btrim(p_reason), ''),
     v_source.carrier_id, v_source.carrier_other, v_source.shipping_zip,
     v_source.shipping_city, v_source.shipping_state,
     v_source.payment_term_id, v_source.payment_term_days,
     v_source.order_kind, v_source.sample_reason, v_source.sample_authorized_by)
  returning id into v_new_id;

  insert into public.order_items
    (tenant_id, order_id, product_id, kit_id, quantity, unit_price)
  select v_tenant_id, v_new_id, product_id, kit_id, quantity, unit_price
    from public.order_items where order_id = p_order_id;

  return v_new_id;
end;
$$;

revoke execute on function public.copy_order_as_simulation(uuid, text) from public, anon;
grant execute on function public.copy_order_as_simulation(uuid, text) to authenticated;

create or replace function public.close_order_with_snapshots(
  p_order_id uuid,
  p_order_snapshot jsonb,
  p_item_snapshots jsonb,
  p_freight numeric,
  p_commission_rate numeric
)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_role public.user_role := public.current_user_role();
  v_order public.orders%rowtype;
  v_cfg public.approval_settings%rowtype;
  v_item jsonb;
  v_order_item public.order_items%rowtype;
  v_expected integer;
  v_distinct integer;
  v_expected_cmv numeric;
  v_gross numeric;
  v_cmv numeric;
  v_expense numeric;
  v_tax_rate numeric;
  v_difal_rate numeric;
  v_difal_destacado boolean;
  v_tax numeric;
  v_freight_tax numeric;
  v_freight_out numeric;
  v_difal numeric;
  v_base_with_freight numeric;
  v_commission_base numeric;
  v_commission numeric;
  v_net numeric;
  v_margin numeric;
  v_margin_pct numeric;
  v_after_allocation numeric;
  v_self_approved_by_margin boolean := false;
  v_tolerance numeric := 0.000001;
begin
  select * into v_order from public.orders
   where id = p_order_id and tenant_id = v_tenant_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_order.status = 'closed' then raise exception 'Pedido já está fechado'; end if;
  if p_commission_rate < 0 or p_commission_rate >= 1 then raise exception 'Comissão inválida'; end if;
  if p_freight < 0 then raise exception 'Frete inválido'; end if;
  if jsonb_typeof(p_item_snapshots) <> 'array' then raise exception 'Snapshots dos itens devem ser uma lista'; end if;

  select count(*) into v_expected from public.order_items where order_id = p_order_id;
  select count(distinct value->>'orderItemId') into v_distinct from jsonb_array_elements(p_item_snapshots);
  if v_expected = 0 or v_expected <> jsonb_array_length(p_item_snapshots) or v_expected <> v_distinct then
    raise exception 'Snapshot incompleto ou com itens repetidos';
  end if;

  for v_item in select value from jsonb_array_elements(p_item_snapshots)
  loop
    select * into v_order_item from public.order_items
     where id = (v_item->>'orderItemId')::uuid and order_id = p_order_id and tenant_id = v_tenant_id;
    if not found then raise exception 'Item de pedido inválido no snapshot'; end if;

    if v_order_item.product_id is not null then
      select cmv into v_expected_cmv from public.product_costs
       where product_id = v_order_item.product_id and tenant_id = v_tenant_id;
    else
      select coalesce(sum(ki.quantity * pc.cmv), 0) into v_expected_cmv
        from public.kit_items ki join public.product_costs pc on pc.product_id = ki.product_id
       where ki.kit_id = v_order_item.kit_id and ki.tenant_id = v_tenant_id;

      v_expected_cmv := v_expected_cmv + public.custo_embalagem_do_kit(v_order_item.kit_id);
      if v_item->'kit_composition_snapshot' is null or v_item->'kit_composition_snapshot' = 'null'::jsonb then
        raise exception 'Kit sem composição congelada';
      end if;
    end if;
    if v_expected_cmv is null or v_expected_cmv <= 0 then raise exception 'Item sem CMV vigente'; end if;
    if abs((v_item->>'cmv_unit_snapshot')::numeric - v_expected_cmv) > v_tolerance then
      raise exception 'CMV do snapshot diverge do CMV vigente';
    end if;

    update public.order_items set
      cmv_unit_snapshot = v_expected_cmv,
      expense_unit_snapshot = (v_item->>'expense_unit_snapshot')::numeric,
      tax_rate_snapshot = (v_item->>'tax_rate_snapshot')::numeric,
      difal_rate_snapshot = (v_item->>'difal_rate_snapshot')::numeric,
      commission_rate_snapshot = p_commission_rate,
      freight_share_snapshot = (v_item->>'freight_share_snapshot')::numeric,
      kit_composition_snapshot = v_item->'kit_composition_snapshot'
    where id = v_order_item.id;
  end loop;

  select sum(quantity*unit_price), sum(quantity*cmv_unit_snapshot), sum(quantity*expense_unit_snapshot)
    into v_gross,v_cmv,v_expense from public.order_items where order_id=p_order_id;

  select r.icms_rate+r.pis_cofins_rate into v_tax_rate from public.icsm_rates r
   where r.tenant_id=v_tenant_id and r.uf=v_order.uf;
  select case when v_order.applies_difal then r.final_rate else 0 end, r.difal_destacado
    into v_difal_rate, v_difal_destacado
    from public.difal_rates r where r.tenant_id=v_tenant_id and r.uf=v_order.uf;
  if v_tax_rate is null or v_difal_rate is null then raise exception 'Pedido sem tabela fiscal completa'; end if;

  v_tax := v_tax_rate*v_gross;
  v_freight_out := case when v_order.freight_paid_by_customer then 0 else p_freight end;
  v_freight_tax := case when v_order.freight_paid_by_customer then v_tax_rate*p_freight else 0 end;
  v_base_with_freight := v_gross+p_freight;
  v_difal := v_difal_rate*v_base_with_freight;
  v_commission_base := v_base_with_freight;
  v_commission := p_commission_rate*v_commission_base;
  v_net := v_gross-v_freight_out-v_freight_tax-v_tax-v_difal-v_commission;
  v_margin := v_net-v_cmv;
  v_margin_pct := case when v_net = 0 then 0 else v_margin / abs(v_net) end;
  v_after_allocation := v_margin-v_expense;

  select * into v_cfg from public.approval_settings where tenant_id = v_tenant_id;
  if coalesce(v_order.order_kind, 'sale') <> 'sample'
     and found and v_cfg.require_approval and v_order.approval_status is distinct from 'aprovado' then
    v_self_approved_by_margin :=
      v_order.approval_status = 'rascunho'
      and v_role in ('admin', 'comercial')
      and v_margin_pct > public.teto_amarelo_do_pedido(p_order_id);

    if not v_self_approved_by_margin then
      raise exception 'Pedido precisa estar aprovado antes do fechamento';
    end if;
  end if;

  if abs((p_order_snapshot->>'gross_revenue_snapshot')::numeric-v_gross)>v_tolerance
    or abs((p_order_snapshot->>'tax_snapshot')::numeric-v_tax)>v_tolerance
    or abs((p_order_snapshot->>'freight_tax_snapshot')::numeric-v_freight_tax)>v_tolerance
    or abs((p_order_snapshot->>'difal_snapshot')::numeric-v_difal)>v_tolerance
    or abs((p_order_snapshot->>'commission_amount_snapshot')::numeric-v_commission)>v_tolerance
    or abs((p_order_snapshot->>'net_revenue_snapshot')::numeric-v_net)>v_tolerance
    or abs((p_order_snapshot->>'cmv_total_snapshot')::numeric-v_cmv)>v_tolerance
    or abs((p_order_snapshot->>'expense_total_snapshot')::numeric-v_expense)>v_tolerance
    or abs((p_order_snapshot->>'contribution_margin_snapshot')::numeric-v_margin)>v_tolerance
    or abs((p_order_snapshot->>'result_after_allocation_snapshot')::numeric-v_after_allocation)>v_tolerance then
    raise exception 'Fechamento rejeitado: totais enviados não reconciliam com os dados do pedido';
  end if;

  update public.orders set
    gross_revenue_snapshot=v_gross,tax_snapshot=v_tax,freight_tax_snapshot=v_freight_tax,
    difal_snapshot=v_difal,commission_amount_snapshot=v_commission,net_revenue_snapshot=v_net,
    cmv_total_snapshot=v_cmv,expense_total_snapshot=v_expense,contribution_margin_snapshot=v_margin,
    result_after_allocation_snapshot=v_after_allocation,
    totals_display=jsonb_build_object(
      'receita_bruta',round(v_gross,2)::text,'impostos',round(v_tax,2)::text,
      'imposto_frete',round(v_freight_tax,2)::text,'difal',round(v_difal,2)::text,
      'comissao',round(v_commission,2)::text,'frete',round(p_freight,2)::text,
      'frete_deduzido',round(v_freight_out,2)::text,
      'base_comissao',round(v_commission_base,2)::text,
      'base_difal',round(v_base_with_freight,2)::text,
      'receita_liquida',round(v_net,2)::text,'cmv',round(v_cmv,2)::text,
      'despesa_alocada',round(v_expense,2)::text,'margem_contribuicao',round(v_margin,2)::text,
      'resultado_apos_rateio',round(v_after_allocation,2)::text,
      'tipo_pedido', coalesce(v_order.order_kind, 'sale')),
    freight=p_freight,
    commission_rate=p_commission_rate,
    difal_destacado_snapshot=coalesce(v_difal_destacado,false),
    status='closed',
    approval_status=case
      when coalesce(v_order.order_kind, 'sale') = 'sample' then 'aprovado'::approval_status
      when v_self_approved_by_margin then 'aprovado'::approval_status
      else approval_status
    end,
    approved_at=case
      when coalesce(v_order.order_kind, 'sale') = 'sample' then coalesce(approved_at, now())
      when v_self_approved_by_margin then now()
      else approved_at
    end,
    approved_by=case
      when coalesce(v_order.order_kind, 'sale') = 'sample' then coalesce(approved_by, auth.uid())
      when v_self_approved_by_margin then auth.uid()
      else approved_by
    end,
    approval_notes=case
      when coalesce(v_order.order_kind, 'sale') = 'sample' then coalesce(approval_notes, 'Amostra sem cobrança')
      else approval_notes
    end
  where id=p_order_id and tenant_id=v_tenant_id;
end;
$function$;
