-- Correção: o recálculo de CMV não populava cmv_without_labor.
--
-- A migração de 29/07 criou a coluna e o motor passou a calcular as duas
-- leituras (T12), mas recalculate_product_costs continuou gravando só o CMV
-- cheio. Resultado: o campo ficou nulo nos 324 produtos e o CMV de competência
-- — o motivo de existir da separação de mão de obra — nunca chegava ao banco.
--
-- A exclusão da mão de obra PROPAGA em cascata: se um kit leva um avental que
-- tem costureira na ficha, o "sem mão de obra" do kit também a exclui, na
-- proporção da quantidade. É o mesmo comportamento coberto pelo golden test
-- T12b no motor.

create or replace function public.recalculate_product_costs()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_before integer;
  v_after integer := 0;
  v_total integer;
begin
  if public.current_user_role() not in ('admin','financeiro') then
    raise exception 'Sem permissão para recalcular CMV';
  end if;
  create temporary table if not exists tmp_product_costs(
    product_id uuid primary key,
    cmv numeric not null,
    cmv_without_labor numeric not null
  ) on commit drop;
  truncate tmp_product_costs;

  select count(distinct product_id) into v_total
    from public.product_components where tenant_id = v_tenant_id;

  loop
    v_before := v_after;
    insert into tmp_product_costs(product_id, cmv, cmv_without_labor)
    select pc.product_id,
           sum(pc.computed_quantity * coalesce(i.price_without_tax, child.cmv)),
           -- Mesma soma, zerando o que é mão de obra e usando a leitura sem
           -- mão de obra do produto-componente.
           sum(pc.computed_quantity * case
                 when pc.component_input_id is not null then
                   case when i.is_labor then 0 else i.price_without_tax end
                 else child.cmv_without_labor
               end)
      from public.product_components pc
      left join public.inputs i on i.id = pc.component_input_id and i.tenant_id = v_tenant_id
      left join tmp_product_costs child on child.product_id = pc.component_product_id
     where pc.tenant_id = v_tenant_id
       and not exists (select 1 from tmp_product_costs done where done.product_id = pc.product_id)
     group by pc.product_id
    having bool_and(
      (pc.component_input_id is not null and i.price_without_tax is not null and i.price_without_tax > 0)
      or (pc.component_product_id is not null and child.cmv is not null and child.cmv > 0)
    )
    on conflict (product_id) do nothing;
    get diagnostics v_after = row_count;
    select count(*) into v_after from tmp_product_costs;
    exit when v_after = v_before;
  end loop;

  if v_after <> v_total then
    raise exception 'CMV não recalculado: existem componentes sem custo ou dependência inválida (% de % produtos)', v_after, v_total;
  end if;

  insert into public.product_costs(product_id, tenant_id, cmv, cmv_without_labor, calculated_at)
  select product_id, v_tenant_id, cmv, cmv_without_labor, now() from tmp_product_costs
  on conflict (product_id) do update
    set cmv = excluded.cmv,
        cmv_without_labor = excluded.cmv_without_labor,
        calculated_at = excluded.calculated_at;
  return v_after;
end;
$$;

-- Backfill dos produtos já cadastrados. Repete a lógica iterativa da função,
-- sem passar por ela, porque a migração roda fora do contexto de um usuário
-- com perfil (current_user_role() seria nulo).
do $$
declare
  v_tenant_id uuid;
  v_before integer;
  v_after integer;
begin
  for v_tenant_id in select id from public.tenants loop
    create temporary table if not exists tmp_backfill(
      product_id uuid primary key,
      cmv numeric not null,
      cmv_without_labor numeric not null
    ) on commit drop;
    truncate tmp_backfill;

    v_after := 0;
    loop
      v_before := v_after;
      insert into tmp_backfill(product_id, cmv, cmv_without_labor)
      select pc.product_id,
             sum(pc.computed_quantity * coalesce(i.price_without_tax, child.cmv)),
             sum(pc.computed_quantity * case
                   when pc.component_input_id is not null then
                     case when i.is_labor then 0 else i.price_without_tax end
                   else child.cmv_without_labor
                 end)
        from public.product_components pc
        left join public.inputs i on i.id = pc.component_input_id and i.tenant_id = v_tenant_id
        left join tmp_backfill child on child.product_id = pc.component_product_id
       where pc.tenant_id = v_tenant_id
         and not exists (select 1 from tmp_backfill done where done.product_id = pc.product_id)
       group by pc.product_id
      having bool_and(
        (pc.component_input_id is not null and i.price_without_tax is not null and i.price_without_tax > 0)
        or (pc.component_product_id is not null and child.cmv is not null and child.cmv > 0)
      )
      on conflict (product_id) do nothing;
      select count(*) into v_after from tmp_backfill;
      exit when v_after = v_before;
    end loop;

    update public.product_costs pc
       set cmv_without_labor = t.cmv_without_labor
      from tmp_backfill t
     where pc.product_id = t.product_id and pc.tenant_id = v_tenant_id;
  end loop;
end $$;
