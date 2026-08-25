-- ============================================================
-- Cidade e UF de entrega do PEDIDO
-- Pedido da Intertech em 24/08/2026 (revisão da folha, Calculations §12.5)
-- ============================================================
--
-- A ficha imprime "Cidade/UF entrega". Até aqui, `orders` guardava só o CEP da
-- entrega excepcional — nenhuma cidade. Quando o pedido ia para um CEP
-- diferente do cadastro, a folha saía com a UF sozinha ("BA"), porque não havia
-- de onde tirar o nome da cidade.
--
-- A folha já cobre o caso comum caindo no cadastro do cliente quando o CEP do
-- pedido é o mesmo do cadastro. O que faltava era a entrega excepcional de
-- verdade: endereço que não é o de sempre, justamente o que mais precisa sair
-- escrito por extenso na mesa da conferência.
--
-- Duas colunas, espelhando `customers.shipping_city` / `customers.shipping_state`.
-- Nenhum cálculo depende delas: são dados de expedição, como peso e volumes.
-- `orders.uf` continua sendo a UF FISCAL do pedido (base do DIFAL) e não muda
-- de significado — por isso a UF de entrega ganha coluna própria em vez de
-- reaproveitar aquela.

alter table public.orders
  add column if not exists shipping_city text,
  add column if not exists shipping_state char(2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_shipping_state_formato') then
    alter table public.orders add constraint orders_shipping_state_formato
      check (shipping_state is null or shipping_state ~ '^[A-Z]{2}$');
  end if;
end $$;

comment on column public.orders.shipping_city is
  'Cidade da entrega deste pedido, quando diferente do cadastro do cliente. Não entra em cálculo.';
comment on column public.orders.shipping_state is
  'UF da entrega deste pedido. NÃO é a UF fiscal (orders.uf), que continua sendo a base do DIFAL.';

-- ------------------------------------------------------------------
-- 1. O gatilho do pedido fechado precisa deixar passar as colunas novas
-- ------------------------------------------------------------------
-- Sem isto, gravar a cidade num pedido já fechado bateria em "Pedido fechado é
-- imutável" — que é o comportamento certo para dinheiro e o comportamento
-- errado para endereço de entrega, que a expedição preenche depois (§6.14).
--
-- Parte da versão que está valendo (20260811202000, fretes cotados) e só
-- acrescenta as duas colunas à lista da expedição e ao registro de auditoria.
create or replace function public.protect_closed_order()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_expedicao text[] := array[
    'carrier_id', 'carrier_other', 'freight_quotes', 'weight_kg', 'volumes',
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
          'shipping_zip', old.shipping_zip, 'shipping_city', old.shipping_city,
          'shipping_state', old.shipping_state, 'payment_term_id', old.payment_term_id,
          'payment_term_days', old.payment_term_days, 'order_notes', old.order_notes),
        jsonb_build_object(
          'carrier_id', new.carrier_id, 'carrier_other', new.carrier_other,
          'freight_quotes', new.freight_quotes,
          'weight_kg', new.weight_kg, 'volumes', new.volumes,
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

revoke execute on function public.protect_closed_order() from public,anon,authenticated;

-- ------------------------------------------------------------------
-- 2. A tela de expedição passa a gravar cidade e UF
-- ------------------------------------------------------------------
-- Mesma função de sempre, com dois parâmetros a mais. Continua sendo a porta
-- estreita: só sabe escrever colunas de expedição e confere o perfil ela mesma.
drop function if exists public.update_order_shipping(uuid, uuid, text, numeric, integer, text, uuid, integer, text);
-- Sobra da primeira versão (20260805001100). A migração 20260807133000 tentou
-- removê-la, mas escreveu uma assinatura de 8 argumentos que nunca existiu — a
-- de verdade tem 7 —, e o `if exists` engoliu o engano em silêncio. Ficou uma
-- função morta que o PostgREST pode alcançar. Some agora.
drop function if exists public.update_order_shipping(uuid, uuid, text, numeric, integer, text, text);
create or replace function public.update_order_shipping(
  p_order_id uuid,
  p_carrier_id uuid,
  p_carrier_other text,
  p_weight_kg numeric,
  p_volumes integer,
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

revoke execute on function public.update_order_shipping(uuid, uuid, text, numeric, integer, text, text, text, uuid, integer, text)
  from public, anon;
grant execute on function public.update_order_shipping(uuid, uuid, text, numeric, integer, text, text, text, uuid, integer, text)
  to authenticated;

-- ------------------------------------------------------------------
-- 3. Duplicar/revisar pedido leva junto o endereço de entrega
-- ------------------------------------------------------------------
-- Endereço de entrega é acordo com aquele cliente, como a transportadora e o
-- prazo: quem duplica o pedido espera reencontrá-lo preenchido.
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
     payment_term_id, payment_term_days)
  values
    (v_tenant_id, 'simulation', v_source.customer_id, v_source.uf, v_source.seller_id,
     v_source.channel_id, v_source.freight, v_source.freight_paid_by_customer,
     v_source.commission_rate, v_source.applies_difal, auth.uid(),
     case when v_source.status = 'closed' then v_source.id else v_source.revised_from_order_id end,
     nullif(btrim(p_reason), ''),
     v_source.carrier_id, v_source.carrier_other, v_source.shipping_zip,
     v_source.shipping_city, v_source.shipping_state,
     v_source.payment_term_id, v_source.payment_term_days)
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
