-- REGISTRO DE MIGRAÇÃO APLICADA DIRETO NO BANCO (02/09/2026, 19h45).
-- Transcrita de `supabase_migrations.schema_migrations`, sem alteração.
--
-- As duas portas que exigem cotação de frete passam a dizer o que fazer quando
-- o cliente vai retirar. A regra não mudou: o que mudou foi a frase, que antes
-- mandava cotar um frete que não existe.

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
    raise exception 'Registre ao menos uma cotação de frete, com transportadora e valor, antes de prosseguir. Se o cliente for retirar, escolha a opção RETIRADA: nela não há valor de frete.';
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
