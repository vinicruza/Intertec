-- Transportadoras e modos de pagamento padronizados — 07/08/2026.

-- ------------------------------------------------------------------
-- 1. Transportadoras ativas conforme lista validada pela Intertech
-- ------------------------------------------------------------------
with desejadas(nome, ordem) as (values
  ('SEDEX', 10),
  ('PAC', 20),
  ('RODONAVES', 30),
  ('JAMEF', 40),
  ('TRANSWELLLS', 50),
  ('BRASPRESS', 60),
  ('AEROPRESS', 70),
  ('COMAM', 80),
  ('GETAL', 90),
  ('DANUBIO', 100)
)
insert into public.carriers (tenant_id, name, requires_name, sort_order, active)
select t.id, d.nome, false, d.ordem, true
from public.tenants t cross join desejadas d
on conflict (tenant_id, name) do update
   set requires_name = false,
       sort_order = excluded.sort_order,
       active = true;

update public.carriers c
   set active = false
 where c.name not in ('SEDEX','PAC','RODONAVES','JAMEF','TRANSWELLLS','BRASPRESS','AEROPRESS','COMAM','GETAL','DANUBIO');

-- ------------------------------------------------------------------
-- 2. Modos de pagamento como cadastro
-- ------------------------------------------------------------------
create table if not exists public.payment_terms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  label text not null check (btrim(label) <> ''),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (tenant_id, label)
);

alter table public.payment_terms enable row level security;
drop policy if exists payment_terms_select on public.payment_terms;
drop policy if exists payment_terms_write on public.payment_terms;
create policy payment_terms_select on public.payment_terms for select
  using (tenant_id = public.current_tenant_id() and public.current_user_role() is not null);
create policy payment_terms_write on public.payment_terms for all
  using (tenant_id = public.current_tenant_id() and public.current_user_role() in ('admin','financeiro'))
  with check (tenant_id = public.current_tenant_id() and public.current_user_role() in ('admin','financeiro'));
grant select, insert, update, delete on public.payment_terms to authenticated;

drop trigger if exists trg_payment_terms_updated_at on public.payment_terms;
create trigger trg_payment_terms_updated_at before update on public.payment_terms
  for each row execute function public.set_updated_at();

with modos(label, ordem) as (values
  ('A vista', 10),
  ('28', 20),
  ('30', 30),
  ('28/42', 40),
  ('28/42/56', 50),
  ('28/56', 60),
  ('28/56/84', 70),
  ('28/56/84/98', 80),
  ('30/60', 90),
  ('30/60/90', 100),
  ('30/60/90/120', 110),
  ('A vista + 28', 120)
)
insert into public.payment_terms (tenant_id, label, sort_order, active)
select t.id, m.label, m.ordem, true
from public.tenants t cross join modos m
on conflict (tenant_id, label) do update
   set sort_order = excluded.sort_order,
       active = true;

alter table public.orders
  add column if not exists payment_term_id uuid references public.payment_terms (id);

-- Mantém pedidos antigos legíveis na tela nova.
update public.orders o
   set payment_term_id = pt.id
  from public.payment_terms pt
 where pt.tenant_id = o.tenant_id
   and pt.label = o.payment_term_days::text
   and o.payment_term_id is null
   and o.payment_term_days is not null;

-- Expedição editável em pedido fechado: inclui o FK novo e mantém o legado.
create or replace function public.protect_closed_order()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_expedicao text[] := array[
    'carrier_id', 'carrier_other', 'weight_kg', 'volumes',
    'shipping_zip', 'payment_term_id', 'payment_term_days', 'order_notes', 'updated_at'
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
          'weight_kg', old.weight_kg, 'volumes', old.volumes,
          'shipping_zip', old.shipping_zip, 'payment_term_id', old.payment_term_id,
          'payment_term_days', old.payment_term_days, 'order_notes', old.order_notes),
        jsonb_build_object(
          'carrier_id', new.carrier_id, 'carrier_other', new.carrier_other,
          'weight_kg', new.weight_kg, 'volumes', new.volumes,
          'shipping_zip', new.shipping_zip, 'payment_term_id', new.payment_term_id,
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
-- 3. Gravação/edição da cotação com modo de pagamento
-- ------------------------------------------------------------------
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
  v_carrier_id uuid := nullif(p_order->>'carrier_id', '')::uuid;
  v_carrier_other text := nullif(btrim(p_order->>'carrier_other'), '');
  v_weight_kg numeric := nullif(p_order->>'weight_kg', '')::numeric;
  v_volumes integer := nullif(p_order->>'volumes', '')::integer;
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
                               carrier_id, carrier_other, weight_kg, volumes, shipping_zip,
                               payment_term_id, payment_term_days, order_notes)
    values (v_tenant_id, 'simulation', v_customer_id, p_order->>'uf',
            (p_order->>'seller_id')::uuid, (p_order->>'channel_id')::uuid,
            (p_order->>'freight')::numeric, (p_order->>'freight_paid_by_customer')::boolean,
            (p_order->>'commission_rate')::numeric, v_applies_difal, auth.uid(),
            v_carrier_id, v_carrier_other, v_weight_kg, v_volumes, v_shipping_zip,
            v_payment_term_id, v_payment_term, v_order_notes)
    returning id into v_order_id;
  else
    select status, approval_status into v_status, v_approval from public.orders
     where id = v_order_id and tenant_id = v_tenant_id;
    if not found then raise exception 'Cotação não encontrada'; end if;
    if v_status <> 'simulation' then
      raise exception 'Só é possível editar cotação em aberto; esta já foi ganha ou perdida';
    end if;
    if v_approval = 'pendente' then
      raise exception 'Cotação aguardando aprovação não pode ser editada; aguarde a decisão';
    end if;
    if v_approval = 'aprovado' then
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
           shipping_zip = v_shipping_zip,
           payment_term_id = v_payment_term_id,
           payment_term_days = v_payment_term,
           order_notes = v_order_notes,
           approval_status = case when v_approval = 'recusado' then 'rascunho' else approval_status end,
           submitted_at = case when v_approval = 'recusado' then null else submitted_at end,
           submitted_by = case when v_approval = 'recusado' then null else submitted_by end,
           approved_at = case when v_approval = 'recusado' then null else approved_at end,
           approved_by = case when v_approval = 'recusado' then null else approved_by end,
           approval_notes = case when v_approval = 'recusado' then null else approval_notes end
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

revoke execute on function public.save_quote_revision(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_quote_revision(uuid, jsonb, jsonb, jsonb) to authenticated;

-- ------------------------------------------------------------------
-- 4. Aprovação e expedição usam modo de pagamento
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

drop function if exists public.update_order_shipping(uuid, uuid, text, numeric, integer, text, integer, text);
create or replace function public.update_order_shipping(
  p_order_id uuid,
  p_carrier_id uuid,
  p_carrier_other text,
  p_weight_kg numeric,
  p_volumes integer,
  p_shipping_zip text,
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

revoke execute on function public.update_order_shipping(uuid, uuid, text, numeric, integer, text, uuid, integer, text)
  from public, anon;
grant execute on function public.update_order_shipping(uuid, uuid, text, numeric, integer, text, uuid, integer, text)
  to authenticated;

-- ------------------------------------------------------------------
-- 5. Duplicar/revisar pedido carrega o modo combinado
-- ------------------------------------------------------------------
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
     carrier_id, carrier_other, shipping_zip, payment_term_id, payment_term_days)
  values
    (v_tenant_id, 'simulation', v_source.customer_id, v_source.uf, v_source.seller_id,
     v_source.channel_id, v_source.freight, v_source.freight_paid_by_customer,
     v_source.commission_rate, v_source.applies_difal, auth.uid(),
     case when v_source.status = 'closed' then v_source.id else v_source.revised_from_order_id end,
     nullif(btrim(p_reason), ''),
     v_source.carrier_id, v_source.carrier_other, v_source.shipping_zip,
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

-- ------------------------------------------------------------------
-- 6. Manutenção dos modos de pagamento pela tela de Cadastros
-- ------------------------------------------------------------------
create or replace function public.save_payment_term(
  p_id uuid,
  p_label text,
  p_sort_order integer,
  p_active boolean
)
returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_tenant_id uuid := public.current_tenant_id(); v_id uuid := p_id;
begin
  if not public.has_role('admin') then
    raise exception 'Sem permissão para alterar os modos de pagamento';
  end if;
  if nullif(btrim(p_label), '') is null then
    raise exception 'Informe o modo de pagamento';
  end if;

  if v_id is null then
    insert into public.payment_terms (tenant_id, label, sort_order, active)
    values (v_tenant_id, btrim(p_label), coalesce(p_sort_order, 0), coalesce(p_active, true))
    returning id into v_id;
  else
    update public.payment_terms
       set label = btrim(p_label),
           sort_order = coalesce(p_sort_order, 0),
           active = coalesce(p_active, true)
     where id = v_id and tenant_id = v_tenant_id;
    if not found then raise exception 'Modo de pagamento não encontrado'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.delete_payment_term(p_id uuid)
returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_tenant_id uuid := public.current_tenant_id();
begin
  if not public.has_role('admin') then
    raise exception 'Sem permissão para excluir modos de pagamento';
  end if;
  if exists (select 1 from public.orders where payment_term_id = p_id and tenant_id = v_tenant_id) then
    raise exception 'Este modo de pagamento já foi usado em pedido; desative em vez de excluir';
  end if;
  delete from public.payment_terms where id = p_id and tenant_id = v_tenant_id;
  if not found then raise exception 'Modo de pagamento não encontrado'; end if;
end $$;

revoke execute on function public.save_payment_term(uuid, text, integer, boolean) from public, anon;
revoke execute on function public.delete_payment_term(uuid) from public, anon;
grant execute on function public.save_payment_term(uuid, text, integer, boolean) to authenticated;
grant execute on function public.delete_payment_term(uuid) to authenticated;
