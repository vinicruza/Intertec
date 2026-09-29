-- Insumo fornecido pelo cliente: custo zero válido, sem abrir zero silencioso.
--
-- Caso real, 29/09/2026: Patrícia cadastrou "Saco Exclusivo" com custo zero
-- porque o saco é fornecido pelo próprio cliente. A regra antiga recusava o
-- recálculo do CMV porque tratava todo zero como erro de cadastro. A intenção
-- era boa: impedir orçamento barato demais por custo faltando. O ajuste aqui
-- separa as duas situações:
--
--   * custo faltando/zerado sem justificativa segue bloqueando;
--   * insumo marcado como fornecido pelo cliente pode custar 0,00.

alter table public.inputs
  add column if not exists is_customer_supplied boolean not null default false;

comment on column public.inputs.is_customer_supplied is
  'Insumo fornecido pelo cliente, sem custo para a Intertech. Permite custo zero no CMV sem tratar como erro de cadastro.';

create index if not exists inputs_customer_supplied_idx
  on public.inputs (tenant_id) where is_customer_supplied;

-- Backfill cirúrgico do caso que motivou o erro. O nome é específico de
-- nomenclatura/ficha, não um palpite genérico por prefixo.
update public.inputs
   set is_customer_supplied = true,
       purchase_price = coalesce(purchase_price, 0),
       price_with_tax = coalesce(price_with_tax, 0),
       price_without_tax = coalesce(price_without_tax, 0),
       price_updated_at = coalesce(price_updated_at, now())
 where lower(btrim(name)) = 'saco exclusivo';

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
      (pc.component_input_id is not null
        and i.price_without_tax is not null
        and (i.price_without_tax > 0 or coalesce(i.is_customer_supplied, false)))
      or (pc.component_product_id is not null and child.product_id is not null and child.cmv is not null))
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

create or replace function public.save_input_and_recalculate(p_input_id uuid, p_input jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_input_id uuid := p_input_id;
begin
  if v_input_id is null then
    insert into public.inputs(tenant_id,name,category,purchase_unit,purchase_price,conversion_factor,
      consumption_unit,icms_rate,pis_cofins_rate,price_with_tax,price_without_tax,price_updated_at,
      is_labor,is_packaging,is_roll,grammage_gsm,is_customer_supplied)
    values(v_tenant_id,btrim(p_input->>'name'),nullif(btrim(p_input->>'category'),''),
      nullif(btrim(p_input->>'purchase_unit'),''),(p_input->>'purchase_price')::numeric,
      (p_input->>'conversion_factor')::numeric,nullif(btrim(p_input->>'consumption_unit'),''),
      (p_input->>'icms_rate')::numeric,(p_input->>'pis_cofins_rate')::numeric,
      (p_input->>'price_with_tax')::numeric,(p_input->>'price_without_tax')::numeric,now(),
      coalesce((p_input->>'is_labor')::boolean,false),
      coalesce((p_input->>'is_packaging')::boolean,false),
      coalesce((p_input->>'is_roll')::boolean,false),
      (p_input->>'grammage_gsm')::numeric,
      coalesce((p_input->>'is_customer_supplied')::boolean,false))
    returning id into v_input_id;
  else
    update public.inputs set name=btrim(p_input->>'name'),category=nullif(btrim(p_input->>'category'),''),
      purchase_unit=nullif(btrim(p_input->>'purchase_unit'),''),purchase_price=(p_input->>'purchase_price')::numeric,
      conversion_factor=(p_input->>'conversion_factor')::numeric,consumption_unit=nullif(btrim(p_input->>'consumption_unit'),''),
      icms_rate=(p_input->>'icms_rate')::numeric,pis_cofins_rate=(p_input->>'pis_cofins_rate')::numeric,
      price_with_tax=(p_input->>'price_with_tax')::numeric,price_without_tax=(p_input->>'price_without_tax')::numeric,
      is_labor=coalesce((p_input->>'is_labor')::boolean,is_labor),
      is_packaging=coalesce((p_input->>'is_packaging')::boolean,is_packaging),
      is_roll=coalesce((p_input->>'is_roll')::boolean,is_roll),
      grammage_gsm=case when jsonb_exists(p_input,'grammage_gsm')
                        then (p_input->>'grammage_gsm')::numeric
                        else grammage_gsm end,
      is_customer_supplied=coalesce((p_input->>'is_customer_supplied')::boolean,is_customer_supplied)
    where id=v_input_id and tenant_id=v_tenant_id;
    if not found then raise exception 'Insumo não encontrado'; end if;
  end if;
  perform public.recalculate_product_costs();
  return v_input_id;
end;
$$;

revoke execute on function public.save_input_and_recalculate(uuid,jsonb) from public,anon;
grant execute on function public.save_input_and_recalculate(uuid,jsonb) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'save_input_and_recalculate'
       and p.prosrc like '%is_labor%' and p.prosrc like '%is_packaging%'
       and p.prosrc like '%is_roll%' and p.prosrc like '%grammage_gsm%'
       and p.prosrc like '%is_customer_supplied%'
  ) then
    raise exception 'save_input_and_recalculate voltou a ignorar is_customer_supplied';
  end if;
end $$;
