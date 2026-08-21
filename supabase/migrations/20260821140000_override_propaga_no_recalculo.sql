-- ============================================================
-- CMV travado por override passa a propagar para os produtos-pai
-- Achado em 21/08/2026, ao espelhar a mudança de preço da planilha.
-- Registro: docs/16 §3.13.
-- ============================================================
--
-- 53 produtos têm o CMV congelado em `product_cmv_overrides` (importados da
-- aba "04 - Formula especial" em 13/08/2026, enquanto a ficha técnica deles não
-- é modelada). O override era aplicado por GATILHO, no momento da gravação em
-- `product_costs`, produto a produto. Dois furos vinham daí:
--
--   1. Um produto-pai era somado com o custo CALCULADO do filho, ignorando o
--      override dele. Os 12 produtos "Kit ..." ficaram para trás quando os
--      overrides foram revisados.
--   2. Produto com override e SEM ficha técnica não passa pelo laço (ele não
--      tem componentes), então nunca era gravado — o valor só mudava se alguém
--      escrevesse em `product_costs` por outro caminho. Foi o que travou os
--      quatro "Campo Simples ... + Tape 80cm".
--
-- Agora o override entra DENTRO do laço, camada a camada, e propaga para cima
-- como qualquer outro custo; e os produtos só-override são gravados no fim.
--
-- O gatilho `apply_product_cmv_override` continua existindo: ele protege quem
-- escreve em `product_costs` por fora desta função.

create or replace function public.recalculate_product_costs()
 returns integer language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_before integer; v_after integer := 0; v_total integer;
begin
  if not public.has_role('admin','financeiro') then
    raise exception 'Sem permissão para recalcular CMV';
  end if;
  create temporary table if not exists tmp_product_costs(
    product_id uuid primary key, cmv numeric not null, cmv_without_labor numeric not null
  ) on commit drop;
  truncate tmp_product_costs;

  select count(distinct product_id) into v_total
    from public.product_components where tenant_id = v_tenant_id;

  loop
    v_before := v_after;
    insert into tmp_product_costs(product_id, cmv, cmv_without_labor)
    select pc.product_id,
           sum(pc.computed_quantity * coalesce(i.price_without_tax, child.cmv)),
           sum(pc.computed_quantity * case
                 when pc.component_input_id is not null then
                   case when i.is_labor then 0 else i.price_without_tax end
                 else child.cmv_without_labor end)
      from public.product_components pc
      left join public.inputs i on i.id = pc.component_input_id and i.tenant_id = v_tenant_id
      left join tmp_product_costs child on child.product_id = pc.component_product_id
     where pc.tenant_id = v_tenant_id
       and not exists (select 1 from tmp_product_costs done where done.product_id = pc.product_id)
     group by pc.product_id
    having bool_and(
      (pc.component_input_id is not null and i.price_without_tax is not null and i.price_without_tax > 0)
      or (pc.component_product_id is not null and child.cmv is not null and child.cmv > 0))
    on conflict (product_id) do nothing;

    -- O override vale JÁ AQUI, para que a camada seguinte o enxergue.
    update tmp_product_costs t
       set cmv = o.cmv
      from public.product_cmv_overrides o
     where o.product_id = t.product_id and o.tenant_id = v_tenant_id and o.active
       and t.cmv is distinct from o.cmv;

    select count(*) into v_after from tmp_product_costs;
    exit when v_after = v_before;
  end loop;

  if v_after <> v_total then
    raise exception 'CMV não recalculado: existem componentes sem custo ou dependência inválida (% de % produtos)', v_after, v_total;
  end if;

  -- Produto com override e sem ficha técnica não entra no laço acima.
  insert into tmp_product_costs(product_id, cmv, cmv_without_labor)
  select o.product_id, o.cmv, o.cmv
    from public.product_cmv_overrides o
   where o.tenant_id = v_tenant_id and o.active
  on conflict (product_id) do update set cmv = excluded.cmv;

  insert into public.product_costs(product_id, tenant_id, cmv, cmv_without_labor, calculated_at)
  select product_id, v_tenant_id, cmv, cmv_without_labor, now() from tmp_product_costs
  on conflict (product_id) do update
    set cmv = excluded.cmv, cmv_without_labor = excluded.cmv_without_labor,
        calculated_at = excluded.calculated_at;
  select count(*) into v_after from tmp_product_costs;
  return v_after;
end;
$function$;
