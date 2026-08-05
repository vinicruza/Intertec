-- DIFAL: override por pedido — áudio da Intertech, 05/08/2026.
--
-- Explicado pela Intertech: "se o cliente é não contribuinte, a gente tem que
-- pagar DIFAL" — é a Intertech que recolhe a diferença de alíquota ao
-- estado, não o cliente que paga a mais. A FÓRMULA que já está no sistema
-- (Calculations.md §6, DIFAL como dedução da receita) está correta e não
-- muda com esta migração.
--
-- O que faltava: hoje `channels.applies_difal` é fixo por canal, mas o mesmo
-- vendedor, no mesmo canal, vende tanto para contribuinte quanto para não
-- contribuinte — a decisão é por PEDIDO, não por canal. O canal Revendas com
-- applies_difal=false (Calculations.md §8, "confirmar se intencional") está
-- CONFIRMADO correto: revenda é venda a contribuinte.
--
-- Mesmo padrão que a comissão já usa (Decisão D6): o canal dá o PADRÃO, o
-- pedido pode substituir, resolvido e gravado — não "true por default e
-- pronto", porque canais com padrão diferente de true precisam manter o
-- comportamento de hoje até que alguém marque diferente.

alter table public.orders add column if not exists applies_difal boolean;

-- Backfill: cada pedido existente herda o padrão do canal dele, exatamente o
-- valor que `simular()` já usava antes desta migração (canal.aplicaDifal).
-- Sem isso, um pedido do canal Revendas (sem DIFAL) ganharia `true` pelo
-- default abaixo e passaria a calcular DIFAL onde antes não calculava.
update public.orders o
   set applies_difal = coalesce(c.applies_difal, true)
  from public.channels c
 where o.channel_id = c.id
   and o.applies_difal is null;

-- Pedido sem canal definido (raro, mas o schema permite channel_id nulo):
-- o padrão geral do sistema sempre foi "aplica", então mantém.
update public.orders set applies_difal = true where applies_difal is null;

alter table public.orders alter column applies_difal set not null;
alter table public.orders alter column applies_difal set default true;

-- ------------------------------------------------------------------
-- save_quote_revision: grava o override resolvido
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
  v_carrier_id uuid := nullif(p_order->>'carrier_id', '')::uuid;
  v_carrier_other text := nullif(btrim(p_order->>'carrier_other'), '');
  v_weight_kg numeric := nullif(p_order->>'weight_kg', '')::numeric;
  v_volumes integer := nullif(p_order->>'volumes', '')::integer;
  v_shipping_zip text := nullif(regexp_replace(coalesce(p_order->>'shipping_zip', ''), '\D', '', 'g'), '');
  v_payment_term integer := nullif(p_order->>'payment_term_days', '')::integer;
  v_order_notes text := nullif(btrim(p_order->>'order_notes'), '');
  -- DIFAL resolvido (05/08/2026): a tela já manda o valor efetivo — override
  -- do pedido se marcado, senão o padrão do canal (mesmo padrão da comissão).
  -- coalesce contra o padrão do canal por segurança, caso algum chamador
  -- futuro esqueça de mandar o campo.
  v_applies_difal boolean;
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

  v_applies_difal := coalesce(
    (p_order->>'applies_difal')::boolean,
    (select applies_difal from public.channels where id = (p_order->>'channel_id')::uuid),
    true
  );

  if v_order_id is null then
    insert into public.orders (tenant_id, status, customer_id, uf, seller_id, channel_id,
                               freight, freight_paid_by_customer, commission_rate, applies_difal, created_by,
                               carrier_id, carrier_other, weight_kg, volumes, shipping_zip,
                               payment_term_days, order_notes)
    values (v_tenant_id, 'simulation', v_customer_id, p_order->>'uf',
            (p_order->>'seller_id')::uuid, (p_order->>'channel_id')::uuid,
            (p_order->>'freight')::numeric, (p_order->>'freight_paid_by_customer')::boolean,
            (p_order->>'commission_rate')::numeric, v_applies_difal, auth.uid(),
            v_carrier_id, v_carrier_other, v_weight_kg, v_volumes, v_shipping_zip,
            v_payment_term, v_order_notes)
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
           commission_rate = (p_order->>'commission_rate')::numeric,
           applies_difal = v_applies_difal,
           carrier_id = v_carrier_id,
           carrier_other = v_carrier_other,
           weight_kg = v_weight_kg,
           volumes = v_volumes,
           shipping_zip = v_shipping_zip,
           payment_term_days = v_payment_term,
           order_notes = v_order_notes
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
-- copy_order_as_simulation: DIFAL é condição combinada com o cliente,
-- carrega para a revisão/duplicata — igual comissão e frete.
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
     carrier_id, carrier_other, shipping_zip, payment_term_days)
  values
    (v_tenant_id, 'simulation', v_source.customer_id, v_source.uf, v_source.seller_id,
     v_source.channel_id, v_source.freight, v_source.freight_paid_by_customer,
     v_source.commission_rate, v_source.applies_difal, auth.uid(),
     case when v_source.status = 'closed' then v_source.id else v_source.revised_from_order_id end,
     nullif(btrim(p_reason), ''),
     v_source.carrier_id, v_source.carrier_other, v_source.shipping_zip, v_source.payment_term_days)
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
-- close_order_with_snapshots: fonte da verdade do DIFAL passa a ser o
-- PEDIDO, não o canal.
-- ------------------------------------------------------------------
-- Achado ao revisar esta migração: o fechamento reconcilia os totais
-- recalculando tudo no servidor — e recalculava o DIFAL lendo
-- `channels.applies_difal` direto, ignorando qualquer override do pedido.
-- Sem este ajuste, o primeiro pedido que usasse o clique de ligar/desligar
-- DIFAL (áudio da Intertech, 05/08/2026) seria RECUSADO no fechamento por
-- "totais não reconciliam" — o navegador calcula com o override, o banco
-- recalcula sem ele, e os dois nunca bateriam.
create or replace function public.close_order_with_snapshots(
  p_order_id uuid,
  p_order_snapshot jsonb,
  p_item_snapshots jsonb,
  p_freight numeric,
  p_commission_rate numeric
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_order public.orders%rowtype;
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
  v_tax numeric;
  v_freight_tax numeric;
  v_difal numeric;
  v_commission numeric;
  v_net numeric;
  v_margin numeric;
  v_after_allocation numeric;
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
      select sum(ki.quantity * pc.cmv) into v_expected_cmv
        from public.kit_items ki join public.product_costs pc on pc.product_id = ki.product_id
       where ki.kit_id = v_order_item.kit_id and ki.tenant_id = v_tenant_id;
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
  -- DIFAL: a fonte da verdade é `v_order.applies_difal`, resolvido no
  -- pedido (05/08/2026) — não mais o canal direto. O canal continua sendo
  -- só o PADRÃO oferecido na hora de montar o pedido.
  select case when v_order.applies_difal then r.final_rate else 0 end into v_difal_rate
    from public.difal_rates r where r.tenant_id=v_tenant_id and r.uf=v_order.uf;
  if v_tax_rate is null or v_difal_rate is null then raise exception 'Pedido sem tabela fiscal completa'; end if;

  v_tax := v_tax_rate*v_gross;
  v_freight_tax := v_tax_rate*p_freight;
  v_difal := v_difal_rate*v_gross;
  v_commission := p_commission_rate*v_gross;
  v_net := v_gross-p_freight-v_freight_tax-v_tax-v_difal-v_commission
           + case when v_order.freight_paid_by_customer then -p_freight else 0 end;
  v_margin := v_net-v_cmv;
  v_after_allocation := v_margin-v_expense;

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
      'receita_liquida',round(v_net,2)::text,'cmv',round(v_cmv,2)::text,
      'despesa_alocada',round(v_expense,2)::text,'margem_contribuicao',round(v_margin,2)::text,
      'resultado_apos_rateio',round(v_after_allocation,2)::text),
    freight=p_freight,commission_rate=p_commission_rate,status='closed'
  where id=p_order_id and tenant_id=v_tenant_id;
end;
$$;

revoke execute on function public.close_order_with_snapshots(uuid,jsonb,jsonb,numeric,numeric) from public,anon;
grant execute on function public.close_order_with_snapshots(uuid,jsonb,jsonb,numeric,numeric) to authenticated;
