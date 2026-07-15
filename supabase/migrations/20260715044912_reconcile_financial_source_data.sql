-- Reconciles the July/2026 allocation and technical sheets with the source
-- spreadsheet "Rentabilidade 2026". All references use tenant + stable codes
-- or exact input names; generated UUIDs are intentionally not hardcoded.

do $$
declare
  v_tenant_id uuid;
  v_period_id uuid;
begin
  select tenant_id, id into v_tenant_id, v_period_id
  from public.expense_allocation_periods
  where period = date '2026-07-01' and status = 'open';

  if v_period_id is null then
    raise exception 'Período aberto de julho/2026 não encontrado';
  end if;

  -- These rows are exact, unreferenced duplicates of the canonical products
  -- P035, P036 and P059. Keeping them would double the allocation weight.
  if exists (
    select 1 from public.products p
    where p.tenant_id = v_tenant_id and p.code in ('P043', 'P044', 'P324')
      and (
        exists (select 1 from public.expense_allocations ea where ea.product_id = p.id)
        or exists (select 1 from public.kit_items ki where ki.product_id = p.id)
        or exists (select 1 from public.order_items oi where oi.product_id = p.id)
        or exists (select 1 from public.product_components pc where pc.component_product_id = p.id)
      )
  ) then
    raise exception 'Produto duplicado possui referência e não pode ser consolidado automaticamente';
  end if;

  delete from public.products
  where tenant_id = v_tenant_id and code in ('P043', 'P044', 'P324');

  -- Correct import typos using the source row identified by exact CMV.
  update public.products p set name = v.name
  from (values
    ('P011', 'Campo de Mesa 0,70 x 0,70'),
    ('P012', 'Campo de Mesa 0,70 x 0,70 Não Estéril'),
    ('P032', 'Campo de Mesa 2,00 x 2,00 Não Estéril'),
    ('P142', 'Campo Com Adesivo 1,00 x 1,20 Não Estéril GR40'),
    ('P146', 'Campo Com Adesivo 0,50 x 0,50 Não Estéril GR40'),
    ('P149', 'Campo Com Adesivo 0,80 x 0,80 GR40'),
    ('P151', 'Campo Com Adesivo 0,80 x 0,80 Não Estéril GR30'),
    ('P152', 'Campo Com Adesivo 0,80 x 0,80 Não Estéril GR40'),
    ('P153', 'Campo Com Fenestra 1,00 x 1,20 GR40'),
    ('P254', 'Kit Odonto Pério Não Estéril'),
    ('P266', 'Campo Catarata 1,00 x 1,20 GR30'),
    ('P267', 'Campo Catarata 1,00 x 1,20 GR30 Não Estéril'),
    ('P291', 'Campo Com Adesivo 1,00 x 1,20 Não Estéril GR30'),
    ('P295', 'Campo Com Adesivo 0,50 x 0,50 Não Estéril GR30'),
    ('P310', 'Campo Catarata 1,00 x 1,20 GR30 China'),
    ('P311', 'Campo Catarata 1,00 x 1,20 GR30 Não Estéril China'),
    ('P318', 'Campo Com Fenestra 0,80 x 0,80 + Tape 20cm Não Estéril GR30'),
    ('P319', 'Campo Com Fenestra 0,80 x 0,80 + Tape 20cm Não Estéril GR40')
  ) as v(code, name)
  where p.tenant_id = v_tenant_id and p.code = v.code;

  -- Two source products were absent from the import. Codes P326/P327 are the
  -- next free stable identifiers after the existing catalog (through P325).
  insert into public.products (tenant_id, code, name, sterile)
  values
    (v_tenant_id, 'P326', 'Campo de Mesa 1,30 x 2,00 + Fen Bino', true),
    (v_tenant_id, 'P327', 'Campo de Mesa 1,30 x 2,00 + Fen Bino Não Estéril', false)
  on conflict (tenant_id, code) do update
  set name = excluded.name, sterile = excluded.sterile;

  -- Restore the missing technical sheet for P049 (Avental).
  insert into public.product_components
    (tenant_id, product_id, component_input_id, quantity_type, quantity,
     lot_size, computed_quantity)
  select v_tenant_id, p.id, i.id, x.quantity_type::public.quantity_type,
         x.quantity, x.lot_size, x.computed_quantity
  from (values
    ('Bobina SMS 40 gr m²', 'direct', 2.305::numeric, null::numeric, 2.305::numeric),
    ('Caixa 6', 'lot', null, 60, 1::numeric / 60),
    ('Custo costureira avental M G', 'direct', 1, null, 1),
    ('Envelope 25x35', 'direct', 1, null, 1),
    ('Esterilização Horizont', 'lot', null, 60, 1::numeric / 60),
    ('Etiquetinha', 'direct', 1, null, 1),
    ('Gráfica', 'direct', 1, null, 1),
    ('Linha', 'lot', null, 450, 1::numeric / 450),
    ('Punho (preço por kg/qtdade punho por kg)', 'direct', 2, null, 2)
  ) as x(input_name, quantity_type, quantity, lot_size, computed_quantity)
  join public.products p on p.tenant_id = v_tenant_id and p.code = 'P049'
  join public.inputs i on i.tenant_id = v_tenant_id and i.name = x.input_name
  where not exists (
    select 1 from public.product_components pc
    where pc.product_id = p.id and pc.component_input_id = i.id
  );

  -- Technical sheets for the two products recovered from columns BP and BS.
  insert into public.product_components
    (tenant_id, product_id, component_input_id, quantity_type, quantity,
     width, length, yield_rate, lot_size, computed_quantity)
  select v_tenant_id, p.id, i.id, x.quantity_type::public.quantity_type,
         x.quantity, x.width, x.length, x.yield_rate, x.lot_size,
         x.computed_quantity
  from (values
    ('P326', 'Fita adesiva 9830', 'lot', null::numeric, null::numeric, null::numeric, null::numeric, 250::numeric, 1::numeric / 250),
    ('P326', 'Bobina Laminado m²', 'area', null, 2, 1.3, 0.99, null, 2 * 1.3 / 0.99),
    ('P326', 'Caixa 6', 'lot', null, null, null, null, 50, 1::numeric / 50),
    ('P326', 'Envelope 25x30', 'direct', 1, null, null, null, null, 1),
    ('P326', 'Esterilização Horizont', 'lot', null, null, null, null, 50, 1::numeric / 50),
    ('P326', 'Etiquetinha', 'direct', 1, null, null, null, null, 1),
    ('P326', 'Gráfica', 'direct', 1, null, null, null, null, 1),
    ('P327', 'Fita adesiva 9830', 'lot', null, null, null, null, 250, 1::numeric / 250),
    ('P327', 'Bobina Laminado m²', 'area', null, 2, 1.3, 0.99, null, 2 * 1.3 / 0.99),
    ('P327', 'Esterilização Horizont', 'lot', null, null, null, null, 50, 1::numeric / 50),
    ('P327', 'Etiquetinha', 'direct', 1, null, null, null, null, 1)
  ) as x(code, input_name, quantity_type, quantity, width, length, yield_rate, lot_size, computed_quantity)
  join public.products p on p.tenant_id = v_tenant_id and p.code = x.code
  join public.inputs i on i.tenant_id = v_tenant_id and i.name = x.input_name
  where not exists (
    select 1 from public.product_components pc
    where pc.product_id = p.id and pc.component_input_id = i.id
  );

  -- Recalculate the three restored technical sheets from authoritative inputs.
  insert into public.product_costs (product_id, tenant_id, cmv, calculated_at)
  select p.id, v_tenant_id,
         sum(pc.computed_quantity * i.price_without_tax), now()
  from public.products p
  join public.product_components pc on pc.product_id = p.id
  join public.inputs i on i.id = pc.component_input_id
  where p.tenant_id = v_tenant_id and p.code in ('P049', 'P326', 'P327')
  group by p.id
  on conflict (product_id) do update
  set cmv = excluded.cmv, calculated_at = excluded.calculated_at;

  -- Add the 15 source allocations that were missed by name-based matching,
  -- plus the two recovered products.
  insert into public.expense_allocations
    (tenant_id, period_id, product_id, estimated_production, complexity_factor)
  select v_tenant_id, v_period_id, p.id, x.production, x.factor
  from (values
    ('P011', 2500::numeric, 20::numeric),
    ('P012', 1, 20),
    ('P032', 1, 20),
    ('P142', 10, 55),
    ('P146', 10, 20),
    ('P149', 25, 40),
    ('P151', 25, 40),
    ('P153', 250, 45),
    ('P254', 1, 340),
    ('P266', 5000, 100),
    ('P267', 1, 90),
    ('P291', 10, 55),
    ('P295', 10, 20),
    ('P310', 2500, 100),
    ('P311', 1, 90),
    ('P326', 10, 60),
    ('P327', 10, 60)
  ) as x(code, production, factor)
  join public.products p on p.tenant_id = v_tenant_id and p.code = x.code
  on conflict (period_id, product_id) do update
  set estimated_production = excluded.estimated_production,
      complexity_factor = excluded.complexity_factor;

  -- Correct three rows whose factors were shifted to the adjacent variant.
  update public.expense_allocations ea
  set complexity_factor = x.factor
  from (values
    ('P152', 35::numeric),
    ('P318', 110::numeric),
    ('P319', 100::numeric)
  ) as x(code, factor)
  join public.products p on p.tenant_id = v_tenant_id and p.code = x.code
  where ea.period_id = v_period_id and ea.product_id = p.id;

  -- Fail atomically if the reconciled database diverges from the source total.
  if (select count(*) from public.products where tenant_id = v_tenant_id and status = 'active') <> 324 then
    raise exception 'Reconciliação inválida: catálogo ativo deve conter 324 produtos';
  end if;
  if (select count(*) from public.expense_allocations where period_id = v_period_id) <> 324 then
    raise exception 'Reconciliação inválida: período deve conter 324 alocações';
  end if;
  if (select sum(estimated_production * complexity_factor)
      from public.expense_allocations where period_id = v_period_id) <> 14446816 then
    raise exception 'Reconciliação inválida: peso total difere de 14.446.816';
  end if;
end
$$;
