-- Embalagem de kit: nome no navegador, CUSTO no servidor.
--
-- Dois defeitos, descobertos em 19/08/2026 quando a primeira vendedora tentou
-- montar um kit. Nenhum tinha aparecido porque `kit_packaging` estava vazia — a
-- funcionalidade nunca havia sido exercitada de ponta a ponta.
--
-- 1) A lista de embalagens vinha VAZIA para o Comercial. A política
--    `inputs_select` libera só admin/financeiro/produção, por decisão registrada
--    ("Insumos e histórico: Comercial SEM ACESSO"). A consulta não dá erro: volta
--    zero linhas, e a tela mostra um campo vazio sem dizer por quê.
--
-- 2) `close_order_with_snapshots` calculava o CMV do kit somando apenas os
--    produtos. O navegador soma produtos + embalagem. No instante em que um kit
--    tivesse embalagem, o fechamento seria recusado com "CMV do snapshot diverge
--    do CMV vigente".
--
-- A saída mantém a regra de sigilo intacta: o Comercial recebe o NOME dos
-- insumos (sem preço) por `insumos_para_embalagem()`, e o CUSTO é calculado no
-- banco por `custo_embalagem_kit()`. O preço de compra nunca é enviado para a
-- tela de quem não tem acesso a ele.

-- ------------------------------------------------------------------
-- 1. Lista de insumos para o seletor de embalagem — SEM PREÇO.
-- ------------------------------------------------------------------
create or replace function public.insumos_para_embalagem()
returns table (id uuid, nome text, embalagem boolean, mao_de_obra boolean)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select i.id, i.name, coalesce(i.is_packaging, false), coalesce(i.is_labor, false)
    from public.inputs i
   where i.tenant_id = public.current_tenant_id()
     and i.status = 'active'
     and public.current_user_role() is not null
   order by i.name;
$function$;

revoke execute on function public.insumos_para_embalagem() from public, anon;
grant execute on function public.insumos_para_embalagem() to authenticated;

-- ------------------------------------------------------------------
-- 2. Custo da embalagem do kit, calculado no servidor.
--
-- Devolve o custo POR LINHA, na mesma ordem recebida, para o motor em
-- TypeScript continuar dono do rateio e da participação (os golden tests não
-- mudam). O que sai daqui é custo, nunca a tabela de preços.
--
-- Os dois modos da tela:
--   direct → consome `quantity` unidades por kit
--   lot    → uma unidade atende `lot_size` kits, então rateia 1/lot_size
-- ------------------------------------------------------------------
create or replace function public.custo_embalagem_kit(p_linhas jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tenant uuid := public.current_tenant_id();
  v_saida jsonb := '[]'::jsonb;
  r record;
  v_preco numeric;
  v_mo boolean;
  v_qtd numeric;
begin
  if public.current_user_role() is null then
    raise exception 'Sem permissão para calcular a embalagem do kit';
  end if;
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'As linhas de embalagem devem vir como lista';
  end if;

  for r in
    select *
      from jsonb_to_recordset(p_linhas)
        as x(input_id uuid, quantity_type text, quantity numeric, lot_size numeric)
  loop
    select i.price_without_tax, coalesce(i.is_labor, false)
      into v_preco, v_mo
      from public.inputs i
     where i.id = r.input_id and i.tenant_id = v_tenant and i.status = 'active';

    -- Insumo inexistente ou sem preço não vira custo zero silencioso: devolve
    -- nulo e o motor bloqueia o kit. Zero silencioso é o que faz um orçamento
    -- sair barato demais sem ninguém perceber.
    if not found or v_preco is null then
      v_saida := v_saida || jsonb_build_object('input_id', r.input_id, 'custo', null, 'mao_de_obra', false);
      continue;
    end if;

    if r.quantity_type = 'lot' then
      if r.lot_size is null or r.lot_size <= 0 then
        v_saida := v_saida || jsonb_build_object('input_id', r.input_id, 'custo', null, 'mao_de_obra', v_mo);
        continue;
      end if;
      v_qtd := 1 / r.lot_size;
    else
      if r.quantity is null or r.quantity <= 0 then
        v_saida := v_saida || jsonb_build_object('input_id', r.input_id, 'custo', null, 'mao_de_obra', v_mo);
        continue;
      end if;
      v_qtd := r.quantity;
    end if;

    v_saida := v_saida || jsonb_build_object(
      'input_id', r.input_id,
      'custo', (v_preco * v_qtd)::text,
      'mao_de_obra', v_mo);
  end loop;

  return v_saida;
end
$function$;

revoke execute on function public.custo_embalagem_kit(jsonb) from public, anon;
grant execute on function public.custo_embalagem_kit(jsonb) to authenticated;

-- ------------------------------------------------------------------
-- 3. Custo da embalagem de um kit JÁ SALVO.
--
-- Precisa ser SECURITY DEFINER: `close_order_with_snapshots` roda com o perfil
-- de quem fecha, e o Comercial não lê `inputs`. Sem isto a subconsulta voltaria
-- vazia para ele e a embalagem viraria ZERO silencioso no fechamento — o pior
-- desfecho possível, porque o pedido fecharia com o custo errado em vez de
-- reclamar. Devolve só o total; a tabela de preços não sai daqui.
-- ------------------------------------------------------------------
create or replace function public.custo_embalagem_do_kit(p_kit_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tenant uuid := public.current_tenant_id();
  v_total numeric;
begin
  if v_tenant is null then raise exception 'Usuário sem tenant ativo'; end if;
  if p_kit_id is null then return 0; end if;

  -- Linha que não dá para custear derruba a conta em vez de virar zero: um kit
  -- barato demais passaria despercebido no orçamento.
  if exists (
    select 1 from public.kit_packaging kp
      left join public.inputs i on i.id = kp.input_id
     where kp.kit_id = p_kit_id and kp.tenant_id = v_tenant
       and (i.price_without_tax is null
            or (kp.quantity_type = 'lot' and coalesce(kp.lot_size, 0) <= 0)
            or (kp.quantity_type is distinct from 'lot' and coalesce(kp.quantity, 0) <= 0))
  ) then
    raise exception 'Embalagem do kit sem custo vigente — o pedido não pode ser fechado';
  end if;

  select coalesce(sum(i.price_without_tax
                      * case when kp.quantity_type = 'lot' then 1 / kp.lot_size else kp.quantity end), 0)
    into v_total
    from public.kit_packaging kp
    join public.inputs i on i.id = kp.input_id
   where kp.kit_id = p_kit_id and kp.tenant_id = v_tenant;

  return coalesce(v_total, 0);
end
$function$;

revoke execute on function public.custo_embalagem_do_kit(uuid) from public, anon;
grant execute on function public.custo_embalagem_do_kit(uuid) to authenticated;

-- ------------------------------------------------------------------
-- 4. Fechamento: o CMV do kit passa a incluir a embalagem.
-- ------------------------------------------------------------------
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

-- ------------------------------------------------------------------
-- 5. CMV dos kits do catálogo, calculado no servidor.
--
-- O contexto do simulador lia o custo dos kits com `inputs` aninhado
-- (kits → kit_packaging → inputs.price_without_tax). A RLS derruba o aninhado
-- para o Comercial, então a embalagem sumia e o kit ficava barato demais na
-- tela — e o fechamento seria recusado depois, porque o banco calcula certo.
-- Aqui o cálculo sai pronto: produtos + embalagem, sem expor preço de insumo.
-- ------------------------------------------------------------------
create or replace function public.custo_dos_kits()
returns table (kit_id uuid, cmv numeric)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select k.id,
         coalesce((select sum(ki.quantity * pc.cmv)
                     from public.kit_items ki
                     join public.product_costs pc on pc.product_id = ki.product_id
                    where ki.kit_id = k.id and ki.tenant_id = k.tenant_id), 0)
       + coalesce((select sum(i.price_without_tax
                              * case when kp.quantity_type = 'lot' then 1 / nullif(kp.lot_size, 0)
                                     else kp.quantity end)
                     from public.kit_packaging kp
                     join public.inputs i on i.id = kp.input_id
                    where kp.kit_id = k.id and kp.tenant_id = k.tenant_id), 0)
    from public.kits k
   where k.tenant_id = public.current_tenant_id()
     and public.current_user_role() is not null;
$function$;

revoke execute on function public.custo_dos_kits() from public, anon;
grant execute on function public.custo_dos_kits() to authenticated;
