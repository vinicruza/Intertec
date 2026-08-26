-- ============================================================
-- A auto-aprovação passa a usar a régua do canal
-- Pedido da Intertech em 26/08/2026, junto das faixas por canal.
-- ============================================================
--
-- O fechamento deixa um pedido em rascunho se aprovar sozinho quando a margem
-- é boa. "Boa" estava escrito como `> 0,50` — o mesmo número que o selo usava
-- no código, copiado à mão.
--
-- Com faixa por canal, esse número deixa de ser único. Um pedido de Marketplace
-- com 45% é VERDE pela régua nova (segue sozinho), mas seria recusado aqui por
-- não passar de 0,50: "Pedido precisa estar aprovado antes do fechamento", sem
-- que ninguém entendesse por quê. A Mari bateria nisso no primeiro pedido.
--
-- Agora os dois lados leem a mesma régua.

-- Teto do amarelo da régua que vale para este pedido: vendedor, senão canal,
-- senão o padrão da casa. Mesma precedência da versão em TypeScript
-- (`faixaDoPedido`), e mesmo fallback quando não há linha nenhuma.
create or replace function public.teto_amarelo_do_pedido(p_order_id uuid)
returns numeric
language sql
stable
set search_path=public,pg_temp
as $$
  select coalesce(
    (
      select b.yellow_max
        from public.orders o
        join public.commercial_margin_bands b
          on b.tenant_id = o.tenant_id
         and (b.seller_id = o.seller_id
              or (b.seller_id is null and b.channel_id = o.channel_id)
              or (b.seller_id is null and b.channel_id is null))
       where o.id = p_order_id
       order by (b.seller_id is not null) desc, (b.channel_id is not null) desc
       limit 1
    ),
    0.50
  );
$$;

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
  v_difal_destacado boolean;
  v_tax numeric;
  v_freight_tax numeric;
  v_freight_out numeric;
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
      -- CMV do kit = produtos + embalagem/esterilização (Calculations.md §4).
      -- A embalagem faltava aqui: o navegador somava as duas partes e o banco só
      -- a primeira, então todo kit COM embalagem seria recusado no fechamento
      -- por "CMV do snapshot diverge do CMV vigente".
      select coalesce(sum(ki.quantity * pc.cmv), 0) into v_expected_cmv
        from public.kit_items ki join public.product_costs pc on pc.product_id = ki.product_id
       where ki.kit_id = v_order_item.kit_id and ki.tenant_id = v_tenant_id;

      v_expected_cmv := v_expected_cmv + public.custo_embalagem_do_kit(v_order_item.kit_id);
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
  -- O DIFAL entra na conta sempre que o PEDIDO aplica (canal Revendas/Descpro
  -- ou marcação manual no simulador). O destaque por UF NÃO entra aqui: ele diz
  -- se o imposto sai destacado na ficha, não se ele existe. Regra ditada pela
  -- Intertech em 25/08/2026 — Calculations.md §7.2.1.
  select case when v_order.applies_difal then r.final_rate else 0 end, r.difal_destacado
    into v_difal_rate, v_difal_destacado
    from public.difal_rates r where r.tenant_id=v_tenant_id and r.uf=v_order.uf;
  if v_tax_rate is null or v_difal_rate is null then raise exception 'Pedido sem tabela fiscal completa'; end if;

  v_tax := v_tax_rate*v_gross;

  -- Frete destacado, igual à planilha (decisão de 21/08/2026, docs/16 §3.12).
  --
  --   freight_paid_by_customer = true  ("Frete destacado" MARCADA)
  --       o cliente paga o transporte: o frete NÃO sai do resultado.
  --       Na planilha é o "X", que faz `N12 = -N6` anular a linha do frete.
  --
  --   freight_paid_by_customer = false ("Frete destacado" EM BRANCO)
  --       a Intertec paga o transporte: o frete SAI do resultado, como
  --       qualquer outro custo. Na planilha é `N12 = 0`, e o
  --       `N14 = F24 - SOMA(N6:N12)` desconta o frete inteiro.
  --
  -- Antes de 21/08/2026 o frete nunca saía do resultado aqui — o mesmo defeito
  -- que a tela tinha, e por isso os dois reconciliavam no fechamento.
  --
  -- A planilha ainda cobra o imposto sobre o frete nos dois casos (a linha
  -- `N7 = alíquota × N6` não olha o "X"); o próprio Bryan disse no áudio que
  -- "na planilha eu não consegui configurar qual é a forma correta". Correção
  -- lá: `N7 = SE(N11="X"; alíquota × N6; 0)`. Golden tests: T6 descreve a
  -- cascata da planilha, T14c a da empresa.
  v_freight_out := case when v_order.freight_paid_by_customer then 0 else p_freight end;
  v_freight_tax := case when v_order.freight_paid_by_customer then v_tax_rate*p_freight else 0 end;

  -- Base de venda + frete informado: vale para o DIFAL (§6.3) e para a comissão
  -- (§6.2). Antes de 18/08/2026 as duas saíam só sobre v_gross.
  v_base_with_freight := v_gross+p_freight;
  v_difal := v_difal_rate*v_base_with_freight;
  v_commission_base := v_base_with_freight;
  v_commission := p_commission_rate*v_commission_base;
  v_net := v_gross-v_freight_out-v_freight_tax-v_tax-v_difal-v_commission;
  v_margin := v_net-v_cmv;
  v_margin_pct := case when v_net = 0 then 0 else v_margin / abs(v_net) end;
  v_after_allocation := v_margin-v_expense;

  select * into v_cfg from public.approval_settings where tenant_id = v_tenant_id;
  if found and v_cfg.require_approval and v_order.approval_status is distinct from 'aprovado' then
    v_self_approved_by_margin :=
      v_order.approval_status = 'rascunho'
      and v_role in ('admin', 'comercial')
      -- Teto do AMARELO da regua deste pedido, e nao mais 0,50 fixo. Verde
      -- segue sozinho; e verde comeca onde o amarelo acaba, que agora varia
      -- por canal (Marketplace comeca em 40%).
      and v_margin_pct > public.teto_amarelo_do_pedido(p_order_id);

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
      -- Frete cotado e frete deduzido são números diferentes quando o cliente
      -- paga o transporte; a cascata da tela precisa do segundo para fechar.
      'frete_deduzido',round(v_freight_out,2)::text,
      'base_comissao',round(v_commission_base,2)::text,
      'base_difal',round(v_base_with_freight,2)::text,
      'receita_liquida',round(v_net,2)::text,'cmv',round(v_cmv,2)::text,
      'despesa_alocada',round(v_expense,2)::text,'margem_contribuicao',round(v_margin,2)::text,
      'resultado_apos_rateio',round(v_after_allocation,2)::text),
    freight=p_freight,
    commission_rate=p_commission_rate,
    -- Congela o destaque junto do resto: reimprimir a ficha de um pedido antigo
    -- tem de dar a mesma folha, mesmo que a UF mude de destaque depois (D7).
    difal_destacado_snapshot=coalesce(v_difal_destacado,false),
    status='closed',
    approval_status=case when v_self_approved_by_margin then 'aprovado'::approval_status else approval_status end,
    approved_at=case when v_self_approved_by_margin then now() else approved_at end,
    approved_by=case when v_self_approved_by_margin then auth.uid() else approved_by end
  where id=p_order_id and tenant_id=v_tenant_id;
end;
$function$;
