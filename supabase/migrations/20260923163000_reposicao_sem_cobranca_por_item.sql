-- Reposição sem cobrança por item.
--
-- Mesma mecânica financeira da amostra por item, mas com rastreabilidade
-- própria na linha do pedido/ficha para não virar "amostra" por baixo.

alter table public.order_items
  drop constraint if exists order_items_item_kind_check;

alter table public.order_items
  add constraint order_items_item_kind_check
  check (item_kind in ('sale', 'sample', 'replacement'));

comment on column public.order_items.item_kind is
  'sale = item vendido normalmente; sample = amostra sem cobrança; replacement = reposição sem cobrança ao cliente.';

create or replace function public.set_order_item_kind_from_price()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(new.unit_price, 0) = 0 and coalesce(new.item_kind, 'sale') = 'sale' then
    new.item_kind := 'sample';
  elsif new.item_kind is null then
    new.item_kind := 'sale';
  end if;
  return new;
end $$;

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
           sample_reason = case when v_order_kind = 'sample' or v_sample_reason is not null then v_sample_reason else null end,
           sample_authorized_by = case when v_order_kind = 'sample' or v_sample_authorized_by is not null then v_sample_authorized_by else null end,
           approval_status = case when v_approval = 'recusado' or v_auto_approved then 'rascunho'::approval_status else approval_status end,
           submitted_at = case when v_approval = 'recusado' or v_auto_approved then null else submitted_at end,
           submitted_by = case when v_approval = 'recusado' or v_auto_approved then null else submitted_by end,
           approved_at = case when v_approval = 'recusado' or v_auto_approved then null else approved_at end,
           approved_by = case when v_approval = 'recusado' or v_auto_approved then null else approved_by end,
           approval_notes = case when v_approval = 'recusado' or v_auto_approved then null else approval_notes end
     where id = v_order_id and tenant_id = v_tenant_id;

    delete from public.order_items where order_id = v_order_id;
  end if;

  insert into public.order_items (tenant_id, order_id, product_id, kit_id, quantity, unit_price, item_kind,
                                  ad_hoc_kit_signature, ad_hoc_kit_composition,
                                  ad_hoc_kit_packaging, ad_hoc_kit_label)
  select v_tenant_id, v_order_id, x.product_id, x.kit_id, x.quantity, x.unit_price, coalesce(x.item_kind, 'sale'),
         x.ad_hoc_kit_signature, x.ad_hoc_kit_composition, x.ad_hoc_kit_packaging, x.ad_hoc_kit_label
    from jsonb_to_recordset(p_items) as x(
      product_id uuid, kit_id uuid, quantity numeric, unit_price numeric, item_kind text,
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
    (tenant_id, order_id, product_id, kit_id, quantity, unit_price, item_kind)
  select v_tenant_id, v_new_id, product_id, kit_id, quantity, unit_price, item_kind
    from public.order_items where order_id = p_order_id;

  return v_new_id;
end;
$$;
