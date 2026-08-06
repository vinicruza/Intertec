-- Expedição/condições só travam o envio para aprovação (06/08/2026)

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

  if v_order.payment_term_days is null then
    raise exception 'Preencha o prazo de pagamento antes de enviar para aprovação.';
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

create or replace function public.update_order_shipping(
  p_order_id uuid,
  p_carrier_id uuid,
  p_carrier_other text,
  p_weight_kg numeric,
  p_volumes integer,
  p_shipping_zip text,
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

  update public.orders
     set carrier_id = p_carrier_id,
         carrier_other = nullif(btrim(p_carrier_other), ''),
         weight_kg = p_weight_kg,
         volumes = p_volumes,
         shipping_zip = nullif(regexp_replace(coalesce(p_shipping_zip, ''), '\D', '', 'g'), ''),
         payment_term_days = p_payment_term_days,
         order_notes = nullif(btrim(p_order_notes), '')
   where id = p_order_id
     and tenant_id = v_tenant_id
     and cancelled_at is null;

  if not found then
    raise exception 'Pedido não encontrado ou cancelado';
  end if;
end $$;

revoke execute on function public.update_order_shipping(uuid, uuid, text, numeric, integer, text, integer, text)
  from public, anon;
grant execute on function public.update_order_shipping(uuid, uuid, text, numeric, integer, text, integer, text)
  to authenticated;
