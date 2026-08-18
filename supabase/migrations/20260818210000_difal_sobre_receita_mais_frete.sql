-- Base do DIFAL passa a ser receita + frete (Calculations.md §6.3).
--
-- Decisão do cliente em 18/08/2026, na mesma direção da comissão (§6.2) e pelo
-- mesmo motivo: a planilha Rentabilidade 2026 trocou `*F24` por `*(F24+N6)` na
-- linha do DIFAL, em 9 das 12 abas de vendedor.
--
-- O ICMS não muda: ele já alcança o frete pela linha "Imposto sobre frete",
-- separada, que aplica a mesma alíquota sobre o frete. O DIFAL não tem linha
-- equivalente — somar o frete na base é como se tributa o frete nele.
--
-- POR QUE ISTO É UMA MIGRAÇÃO, E NÃO SÓ UMA MUDANÇA NO NAVEGADOR:
-- a validação de fechamento recalcula a cascata inteira do lado do banco e
-- recusa o pedido se algum total não reconciliar com o que o navegador enviou.
-- Trocar a base do DIFAL só no motor em TypeScript faria o navegador mandar
-- 2.403,00 enquanto o banco recalculava 2.268,00 — e todo pedido com frete > 0
-- e DIFAL aplicável morreria em "totais não reconciliam".
--
-- Mesmo tropeço do override de DIFAL em 05/08/2026 (§12.1) e da comissão hoje
-- de manhã: a regra mudou num lado só. Há teste travando os dois lados.
--
-- `p_freight` é o frete INFORMADO. Frete por conta do cliente zera a DEDUÇÃO do
-- frete, mas não a base do DIFAL: o transporte foi vendido e o estado cobra
-- sobre ele (golden test T17b). Por isso a soma usa `p_freight` direto, sem
-- olhar a flag `freight_paid_by_customer`.
--
-- Pedidos JÁ FECHADOS não são tocados: snapshots são congelados por decisão
-- (D7) e reescrever o passado é o que o sistema existe para impedir.

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
  v_tax numeric;
  v_freight_tax numeric;
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
  select case when v_order.applies_difal then r.final_rate else 0 end into v_difal_rate
    from public.difal_rates r where r.tenant_id=v_tenant_id and r.uf=v_order.uf;
  if v_tax_rate is null or v_difal_rate is null then raise exception 'Pedido sem tabela fiscal completa'; end if;

  v_tax := v_tax_rate*v_gross;
  v_freight_tax := case when v_order.freight_paid_by_customer then v_tax_rate*p_freight else 0 end;

  -- Base de venda + frete informado: vale para o DIFAL (§6.3) e para a comissão
  -- (§6.2). Antes de 18/08/2026 as duas saíam só sobre v_gross.
  v_base_with_freight := v_gross+p_freight;
  v_difal := v_difal_rate*v_base_with_freight;
  v_commission_base := v_base_with_freight;
  v_commission := p_commission_rate*v_commission_base;
  v_net := v_gross-v_freight_tax-v_tax-v_difal-v_commission;
  v_margin := v_net-v_cmv;
  v_margin_pct := case when v_net = 0 then 0 else v_margin / abs(v_net) end;
  v_after_allocation := v_margin-v_expense;

  select * into v_cfg from public.approval_settings where tenant_id = v_tenant_id;
  if found and v_cfg.require_approval and v_order.approval_status is distinct from 'aprovado' then
    v_self_approved_by_margin :=
      v_order.approval_status = 'rascunho'
      and v_role in ('admin', 'comercial')
      and v_margin_pct > 0.50;

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
      'base_comissao',round(v_commission_base,2)::text,
      'base_difal',round(v_base_with_freight,2)::text,
      'receita_liquida',round(v_net,2)::text,'cmv',round(v_cmv,2)::text,
      'despesa_alocada',round(v_expense,2)::text,'margem_contribuicao',round(v_margin,2)::text,
      'resultado_apos_rateio',round(v_after_allocation,2)::text),
    freight=p_freight,
    commission_rate=p_commission_rate,
    status='closed',
    approval_status=case when v_self_approved_by_margin then 'aprovado'::approval_status else approval_status end,
    approved_at=case when v_self_approved_by_margin then now() else approved_at end,
    approved_by=case when v_self_approved_by_margin then auth.uid() else approved_by end
  where id=p_order_id and tenant_id=v_tenant_id;
end;
$function$;
