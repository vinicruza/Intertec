-- ============================================================
-- Composição dos volumes: campo próprio na expedição
-- ============================================================
--
-- Em 25/08/2026 uma vendedora escreveu "2 cx6+1cx3 = 3" no campo Volumes —
-- 2 caixas de 6 mais 1 de 3, somando 3 volumes. O campo é inteiro, o banco
-- recusou, e ela levou um erro de SQL em inglês na tela.
--
-- O erro já foi tratado (commit e8c4a26): o formulário barra antes de enviar e
-- manda a composição para as observações. Mas mandar para observações é
-- resposta pela metade — a informação é da EXPEDIÇÃO, quem embala precisa dela
-- ao lado da quantidade, e o campo de observações é do pedido inteiro.
--
-- Aqui ela ganha campo próprio. `volumes` continua sendo o número que conta
-- (3), e `volumes_composition` guarda como esse número foi montado — texto
-- livre, porque a forma de escrever é de quem embala, não do sistema.

alter table public.orders
  add column if not exists volumes_composition text;

comment on column public.orders.volumes_composition is
  'Como os volumes foram montados, em texto livre (ex.: "2 cx6 + 1 cx3"). A quantidade que conta e a coluna volumes.';

-- ------------------------------------------------------------------
-- 1. O pedido fechado libera o campo novo junto com o resto da expedição
-- ------------------------------------------------------------------
-- Sem isto o gatilho recusaria a alteração num pedido já fechado, que é
-- justamente quando alguém embala a caixa e descobre como ela ficou.
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

-- ------------------------------------------------------------------
-- 2. A tela de expedição grava o campo novo
-- ------------------------------------------------------------------
-- Assinatura muda, então a antiga tem de sair: PostgREST chama por nome, mas
-- duas funções de mesmo nome com contagens diferentes de argumento ficariam
-- as duas alcançáveis.
drop function if exists public.update_order_shipping(uuid, uuid, text, numeric, integer, text, text, text, uuid, integer, text);
create or replace function public.update_order_shipping(
  p_order_id uuid,
  p_carrier_id uuid,
  p_carrier_other text,
  p_weight_kg numeric,
  p_volumes integer,
  p_volumes_composition text,
  p_shipping_zip text,
  p_shipping_city text,
  p_shipping_state text,
  p_payment_term_id uuid,
  p_payment_term_days integer,
  p_order_notes text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_role public.user_role := public.current_user_role();
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem tenant ativo';
  end if;
  if v_role not in ('admin', 'financeiro', 'comercial') then
    raise exception 'Sem permissão para registrar a expedição do pedido';
  end if;

  if p_carrier_id is not null and not exists (
    select 1 from public.carriers
     where id = p_carrier_id and tenant_id = v_tenant_id and active
  ) then
    raise exception 'Transportadora inválida';
  end if;

  if p_payment_term_id is not null and not exists (
    select 1 from public.payment_terms
     where id = p_payment_term_id and tenant_id = v_tenant_id and active
  ) then
    raise exception 'Modo de pagamento inválido';
  end if;

  update public.orders
     set carrier_id = p_carrier_id,
         carrier_other = nullif(btrim(p_carrier_other), ''),
         weight_kg = p_weight_kg,
         volumes = p_volumes,
         volumes_composition = nullif(btrim(p_volumes_composition), ''),
         shipping_zip = nullif(regexp_replace(coalesce(p_shipping_zip, ''), '\D', '', 'g'), ''),
         shipping_city = nullif(btrim(p_shipping_city), ''),
         shipping_state = nullif(upper(btrim(p_shipping_state)), ''),
         payment_term_id = p_payment_term_id,
         payment_term_days = p_payment_term_days,
         order_notes = nullif(btrim(p_order_notes), '')
   where id = p_order_id
     and tenant_id = v_tenant_id
     and cancelled_at is null;

  if not found then
    raise exception 'Pedido não encontrado ou cancelado';
  end if;
end $$;

revoke execute on function public.update_order_shipping(uuid, uuid, text, numeric, integer, text, text, text, text, uuid, integer, text)
  from public, anon;
grant execute on function public.update_order_shipping(uuid, uuid, text, numeric, integer, text, text, text, text, uuid, integer, text)
  to authenticated;

-- ------------------------------------------------------------------
-- 3. O simulador grava o campo novo ao salvar a cotação
-- ------------------------------------------------------------------
-- Mesma assinatura (o payload é jsonb), só uma chave a mais lida de p_order.
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
  v_applies_difal boolean;
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem tenant ativo';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cotação sem itens';
  end if;

  if v_payment_term_id is not null and not exists (
    select 1 from public.payment_terms
     where id = v_payment_term_id and tenant_id = v_tenant_id and active
  ) then
    raise exception 'Modo de pagamento inválido';
  end if;

  v_customer_id := nullif(p_order->>'customer_id', '')::uuid;
  if v_customer_id is null and nullif(btrim(p_order->>'customer_name'), '') is not null then
    insert into public.customers (tenant_id, name, uf)
    values (v_tenant_id, btrim(p_order->>'customer_name'), p_order->>'uf')
    returning id into v_customer_id;
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
                               payment_term_id, payment_term_days, order_notes)
    values (v_tenant_id, 'simulation', v_customer_id, p_order->>'uf',
            (p_order->>'seller_id')::uuid, (p_order->>'channel_id')::uuid,
            (p_order->>'freight')::numeric, (p_order->>'freight_paid_by_customer')::boolean,
            (p_order->>'commission_rate')::numeric, v_applies_difal, auth.uid(),
            v_carrier_id, v_carrier_other, v_weight_kg, v_volumes, v_volumes_composition, v_shipping_zip,
            v_payment_term_id, v_payment_term, v_order_notes)
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
