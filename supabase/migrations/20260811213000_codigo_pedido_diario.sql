-- Codigo operacional diario do pedido e aprovacao automatica por margem.
-- Mantem o ORC como rastreio comercial e adiciona o numero diario pedido pela
-- Intertech: sequencia do dia + ddmmaa, ex.: 01110826.

alter table public.orders
  add column if not exists order_number text;

create unique index if not exists orders_order_number_unique
  on public.orders (tenant_id, order_number)
  where order_number is not null;

comment on column public.orders.order_number is
  'Codigo operacional do pedido: sequencia diaria + ddmmaa. Ex.: 01110826.';

create or replace function public.next_order_number(
  p_tenant_id uuid,
  p_order_date date default ((now() at time zone 'America/Sao_Paulo')::date)
)
returns text
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_next integer;
  v_suffix text := to_char(p_order_date, 'DDMMYY');
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_order_date::text, 0));

  select coalesce(max(left(order_number, length(order_number) - 6)::integer), 0) + 1
    into v_next
    from public.orders
   where tenant_id = p_tenant_id
     and order_number ~ ('^[0-9]+' || v_suffix || '$');

  return lpad(v_next::text, 2, '0') || v_suffix;
end $$;

create or replace function public.set_order_number()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.order_number is null then
    new.order_number := public.next_order_number(
      new.tenant_id,
      (coalesce(new.created_at, now()) at time zone 'America/Sao_Paulo')::date
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_order_number on public.orders;
create trigger trg_orders_order_number before insert on public.orders
  for each row execute function public.set_order_number();

revoke execute on function public.next_order_number(uuid,date) from public, anon, authenticated;
revoke execute on function public.set_order_number() from public, anon, authenticated;

-- Backfill dos orcamentos/pedidos retroativos, preservando a ordem local de
-- criacao por dia.
alter table public.orders disable trigger trg_orders_immutable;

with ordenados as (
  select id,
         tenant_id,
         (created_at at time zone 'America/Sao_Paulo')::date as data_local,
         row_number() over (
           partition by tenant_id, (created_at at time zone 'America/Sao_Paulo')::date
           order by created_at, id
         ) as seq
    from public.orders
   where order_number is null
),
numerados as (
  select id,
         lpad(seq::text, 2, '0') || to_char(data_local, 'DDMMYY') as numero
    from ordenados
)
update public.orders o
   set order_number = n.numero
  from numerados n
 where o.id = n.id;

alter table public.orders enable trigger trg_orders_immutable;

-- A ultima versao da cotacao atualiza os totais do pedido e, quando a faixa de
-- margem for azul/verde, registra aprovacao automatica sem aprovador manual.
create or replace function public.sync_order_snapshot_from_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receita_bruta numeric;
  v_receita_liquida numeric;
  v_cmv_total numeric;
  v_margem numeric;
  v_margem_pct numeric;
  v_totals jsonb;
  v_color text;
begin
  v_receita_bruta := coalesce(
    nullif(new.snapshot #>> '{pedido,gross_revenue_snapshot}', '')::numeric,
    nullif(new.snapshot ->> 'receita_bruta', '')::numeric
  );

  v_cmv_total := coalesce(
    nullif(new.snapshot #>> '{pedido,cmv_total_snapshot}', '')::numeric,
    nullif(new.snapshot ->> 'cmv_total', '')::numeric
  );

  v_margem := coalesce(
    nullif(new.snapshot #>> '{pedido,contribution_margin_snapshot}', '')::numeric,
    nullif(new.snapshot ->> 'margem_contribuicao', '')::numeric
  );

  v_receita_liquida := coalesce(
    nullif(new.snapshot #>> '{pedido,net_revenue_snapshot}', '')::numeric,
    nullif(new.snapshot ->> 'receita_liquida', '')::numeric,
    v_margem + v_cmv_total
  );

  v_margem_pct := coalesce(
    nullif(new.snapshot #>> '{pedido,contribution_margin_pct_snapshot}', '')::numeric,
    nullif(new.snapshot ->> 'margem_contribuicao_pct', '')::numeric,
    case when v_receita_liquida is null or v_receita_liquida = 0 then null else v_margem / v_receita_liquida end
  );

  if v_margem_pct is not null then
    select lower(color) into v_color
      from public.margin_rules
     where tenant_id = new.tenant_id
       and (min_rate is null or v_margem_pct >= min_rate)
       and (max_rate is null or v_margem_pct < max_rate)
     order by sort_order
     limit 1;
  end if;

  v_totals := coalesce(
    new.snapshot #> '{pedido,totals_display}',
    case
      when v_receita_liquida is null and v_margem is null then null
      else jsonb_strip_nulls(jsonb_build_object(
        'receita_liquida', case when v_receita_liquida is null then null else round(v_receita_liquida, 2)::text end,
        'margem_contribuicao', case when v_margem is null then null else round(v_margem, 2)::text end
      ))
    end
  );

  update public.orders
     set gross_revenue_snapshot = coalesce(v_receita_bruta, gross_revenue_snapshot),
         net_revenue_snapshot = coalesce(v_receita_liquida, net_revenue_snapshot),
         cmv_total_snapshot = coalesce(v_cmv_total, cmv_total_snapshot),
         contribution_margin_snapshot = coalesce(v_margem, contribution_margin_snapshot),
         totals_display = coalesce(v_totals, totals_display),
         approval_status = case
           when v_color in ('blue', 'green') and status = 'simulation' then 'aprovado'::approval_status
           else approval_status
         end,
         approved_at = case
           when v_color in ('blue', 'green') and status = 'simulation' then coalesce(approved_at, now())
           else approved_at
         end,
         approved_by = case
           when v_color in ('blue', 'green') and status = 'simulation' then coalesce(approved_by, new.created_by)
           else approved_by
         end,
         approval_notes = case
           when v_color in ('blue', 'green') and status = 'simulation'
             then 'Aprovado automaticamente pela margem ' || coalesce(v_color, '')
           else approval_notes
         end
   where id = new.order_id
     and tenant_id = new.tenant_id;

  return new;
end $$;

drop trigger if exists trg_order_versions_sync_order_snapshot on public.order_versions;
create trigger trg_order_versions_sync_order_snapshot
after insert on public.order_versions
for each row execute function public.sync_order_snapshot_from_version();

revoke execute on function public.sync_order_snapshot_from_version() from public, anon, authenticated;

-- Refaz a aprovacao automatica nos orcamentos retroativos cuja ultima versao ja
-- esta em faixa azul/verde.
with ultimas as (
  select distinct on (ov.order_id)
         ov.order_id,
         ov.tenant_id,
         ov.created_by,
         ov.created_at,
         coalesce(
           nullif(ov.snapshot #>> '{pedido,net_revenue_snapshot}', '')::numeric,
           nullif(ov.snapshot ->> 'receita_liquida', '')::numeric
         ) as receita_liquida,
         coalesce(
           nullif(ov.snapshot #>> '{pedido,contribution_margin_snapshot}', '')::numeric,
           nullif(ov.snapshot ->> 'margem_contribuicao', '')::numeric
         ) as margem,
         coalesce(
           nullif(ov.snapshot #>> '{pedido,contribution_margin_pct_snapshot}', '')::numeric,
           nullif(ov.snapshot ->> 'margem_contribuicao_pct', '')::numeric
         ) as margem_pct_snapshot
    from public.order_versions ov
   order by ov.order_id, ov.version desc
),
faixas as (
  select u.order_id,
         u.created_by,
         u.created_at,
         lower(mr.color) as color
    from ultimas u
    join public.margin_rules mr
      on mr.tenant_id = u.tenant_id
     and (mr.min_rate is null or coalesce(u.margem_pct_snapshot, case when u.receita_liquida = 0 then null else u.margem / u.receita_liquida end) >= mr.min_rate)
     and (mr.max_rate is null or coalesce(u.margem_pct_snapshot, case when u.receita_liquida = 0 then null else u.margem / u.receita_liquida end) < mr.max_rate)
)
update public.orders o
   set approval_status = 'aprovado',
       approved_at = coalesce(o.approved_at, f.created_at),
       approved_by = coalesce(o.approved_by, f.created_by),
       approval_notes = 'Aprovado automaticamente pela margem ' || f.color
  from faixas f
 where o.id = f.order_id
   and o.status = 'simulation'
   and f.color in ('blue', 'green');

-- Permite revisar cotacoes autoaprovadas por margem; aprovacoes manuais
-- continuam imutaveis ate virar pedido ou serem recusadas.
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

revoke execute on function public.save_quote_revision(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_quote_revision(uuid, jsonb, jsonb, jsonb) to authenticated;
