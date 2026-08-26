-- ============================================================
-- Pelo menos uma cotação de frete para o pedido prosseguir
-- Pedido da Intertech em 26/08/2026.
-- ============================================================
--
-- "Se não for colocada pelo menos a cotação de uma transportadora, não será
-- possível prosseguir com o pedido." É o frete cotado que sustenta a margem
-- apresentada e o que a expedição usa para fechar com a transportadora;
-- seguir sem ele é decidir no escuro.
--
-- Trava o PROSSEGUIR, nunca o SALVAR. Cotar frete é etapa posterior a montar o
-- pedido: impedir de salvar obrigaria a vendedora a segurar tudo na tela até a
-- transportadora responder. Os dois pontos de saída ficam guardados:
--
--   enviar para aprovação  → submit_order_for_approval
--   ganhar o pedido        → o gatilho, na passagem para 'closed'
--
-- O segundo importa mais do que parece: pedido de margem boa é aprovado
-- sozinho e nunca passa pela primeira porta.

-- O que conta como cotação: transportadora (do cadastro ou digitada) E valor
-- maior que zero. Linha com transportadora escolhida e valor em branco é linha
-- começada e abandonada — deixá-la passar seria pior do que não ter regra,
-- porque daria a impressão de que alguém cotou.
create or replace function public.tem_cotacao_de_frete(p_quotes jsonb)
returns boolean
language plpgsql
immutable
set search_path=public,pg_temp
as $$
declare
  v_item jsonb;
  v_texto text;
begin
  if p_quotes is null or jsonb_typeof(p_quotes) <> 'array' then return false; end if;

  for v_item in select value from jsonb_array_elements(p_quotes)
  loop
    if nullif(btrim(coalesce(v_item->>'carrierId','')),'') is null
       and nullif(btrim(coalesce(v_item->>'carrierOther','')),'') is null then
      continue;
    end if;

    -- O valor é digitado e guardado em texto. Normalmente chega normalizado
    -- ("384"), mas linhas antigas guardaram como a pessoa escreveu
    -- ("3.223,00"). Converte os dois formatos e ignora o que não for número,
    -- sem nunca deixar um cast estourar dentro do gatilho.
    v_texto := btrim(coalesce(v_item->>'amount',''));
    if position(',' in v_texto) > 0 then
      v_texto := replace(replace(v_texto, '.', ''), ',', '.');
    end if;
    if v_texto ~ '^-?[0-9]+([.][0-9]+)?$' and v_texto::numeric > 0 then
      return true;
    end if;
  end loop;

  return false;
end $$;

-- ------------------------------------------------------------------
-- 1. Ganhar o pedido
-- ------------------------------------------------------------------
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

  -- Pelo menos uma cotação de frete para o pedido ser GANHO (Intertech,
  -- 26/08/2026). Mora no gatilho porque é a passagem para 'closed' que precisa
  -- ser guardada, venha ela de qual caminho vier — e porque a tela sozinha não
  -- é garantia de nada.
  if new.status='closed' and old.status is distinct from 'closed'
     and not public.tem_cotacao_de_frete(new.freight_quotes) then
    raise exception 'Registre ao menos uma cotação de frete, com transportadora e valor, antes de prosseguir.';
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
-- 2. Enviar para aprovação
-- ------------------------------------------------------------------
create or replace function public.submit_order_for_approval(p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_order public.orders%rowtype;
  v_customer_shipping_zip text;
  v_carrier_requires_name boolean := false;
begin
  select * into v_order from public.orders
   where id = p_order_id and tenant_id = v_tenant_id;
  if not found then raise exception 'Cotação não encontrada'; end if;
  if v_order.status <> 'simulation' then
    raise exception 'Só cotação em aberto pode ser enviada para aprovação';
  end if;

  select shipping_zip into v_customer_shipping_zip
    from public.customers
   where id = v_order.customer_id
     and tenant_id = v_tenant_id;

  if not public.tem_cotacao_de_frete(v_order.freight_quotes) then
    raise exception 'Registre ao menos uma cotação de frete, com transportadora e valor, antes de prosseguir.';
  end if;

  if v_order.carrier_id is null then
    raise exception 'Preencha a transportadora antes de enviar para aprovação.';
  end if;

  select requires_name into v_carrier_requires_name
    from public.carriers
   where id = v_order.carrier_id
     and tenant_id = v_tenant_id;

  if coalesce(v_carrier_requires_name, false) and nullif(btrim(coalesce(v_order.carrier_other, '')), '') is null then
    raise exception 'Informe o nome da transportadora antes de enviar para aprovação.';
  end if;

  if v_order.payment_term_id is null and v_order.payment_term_days is null then
    raise exception 'Preencha o modo de pagamento antes de enviar para aprovação.';
  end if;

  if v_order.shipping_zip is null and v_customer_shipping_zip is null then
    raise exception 'Preencha o CEP de entrega antes de enviar para aprovação.';
  end if;

  update public.orders
     set approval_status = 'pendente',
         submitted_at = now(),
         submitted_by = auth.uid(),
         approved_at = null,
         approved_by = null
   where id = p_order_id and tenant_id = v_tenant_id;
end $$;

revoke execute on function public.submit_order_for_approval(uuid) from public, anon;
grant execute on function public.submit_order_for_approval(uuid) to authenticated;
 and v_texto::numeric > 0 then
      return true;
    end if;
  end loop;

  return false;
end $$;

-- ------------------------------------------------------------------
-- 1. Ganhar o pedido
-- ------------------------------------------------------------------
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

  -- Pelo menos uma cotação de frete para o pedido ser GANHO (Intertech,
  -- 26/08/2026). Mora no gatilho porque é a passagem para 'closed' que precisa
  -- ser guardada, venha ela de qual caminho vier — e porque a tela sozinha não
  -- é garantia de nada.
  if new.status='closed' and old.status is distinct from 'closed'
     and not public.tem_cotacao_de_frete(new.freight_quotes) then
    raise exception 'Registre ao menos uma cotação de frete, com transportadora e valor, antes de prosseguir.';
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
-- 2. Enviar para aprovação
-- ------------------------------------------------------------------
create or replace function public.submit_order_for_approval(p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_order public.orders%rowtype;
  v_customer_shipping_zip text;
  v_carrier_requires_name boolean := false;
begin
  select * into v_order from public.orders
   where id = p_order_id and tenant_id = v_tenant_id;
  if not found then raise exception 'Cotação não encontrada'; end if;
  if v_order.status <> 'simulation' then
    raise exception 'Só cotação em aberto pode ser enviada para aprovação';
  end if;

  select shipping_zip into v_customer_shipping_zip
    from public.customers
   where id = v_order.customer_id
     and tenant_id = v_tenant_id;

  if not public.tem_cotacao_de_frete(v_order.freight_quotes) then
    raise exception 'Registre ao menos uma cotação de frete, com transportadora e valor, antes de prosseguir.';
  end if;

  if v_order.carrier_id is null then
    raise exception 'Preencha a transportadora antes de enviar para aprovação.';
  end if;

  select requires_name into v_carrier_requires_name
    from public.carriers
   where id = v_order.carrier_id
     and tenant_id = v_tenant_id;

  if coalesce(v_carrier_requires_name, false) and nullif(btrim(coalesce(v_order.carrier_other, '')), '') is null then
    raise exception 'Informe o nome da transportadora antes de enviar para aprovação.';
  end if;

  if v_order.payment_term_id is null and v_order.payment_term_days is null then
    raise exception 'Preencha o modo de pagamento antes de enviar para aprovação.';
  end if;

  if v_order.shipping_zip is null and v_customer_shipping_zip is null then
    raise exception 'Preencha o CEP de entrega antes de enviar para aprovação.';
  end if;

  update public.orders
     set approval_status = 'pendente',
         submitted_at = now(),
         submitted_by = auth.uid(),
         approved_at = null,
         approved_by = null
   where id = p_order_id and tenant_id = v_tenant_id;
end $$;

revoke execute on function public.submit_order_for_approval(uuid) from public, anon;
grant execute on function public.submit_order_for_approval(uuid) to authenticated;
