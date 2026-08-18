-- Cria os produtos Tape 80cm que existem na planilha Rentabilidade 2026,
-- mas ainda nao existiam no catalogo ativo do sistema, e importa o CMV final.

create temporary table tmp_intertech_tape80_products (
  name text primary key,
  cmv numeric not null
) on commit drop;

insert into tmp_intertech_tape80_products (name, cmv) values
  ('Campo Simples 1,00 x 1,20 + Tape 80cm GR40', 2.153082),
  ('Campo Simples 1,00 x 1,20 + Tape 80cm Não Estéril GR40', 1.517257),
  ('Campo Simples 1,00 x 1,20 + Tape 80cm GR30', 2.069846),
  ('Campo Simples 1,00 x 1,20 + Tape 80cm Não Estéril GR30', 1.434020),
  ('Campo Simples 0,60 x 0,60 + Tape 80cm GR40', 1.682765),
  ('Campo Simples 0,60 x 0,60 + Tape 80cm Não Estéril GR40', 0.934602),
  ('Campo Simples 0,60 x 0,60 + Tape 80cm GR30', 1.657794),
  ('Campo Simples 0,60 x 0,60 + Tape 80cm Não Estéril GR30', 0.909631);

do $$
declare
  v_category_id uuid;
  v_created integer;
  v_exact_matches integer;
  v_ambiguous integer;
begin
  select id into v_category_id
    from public.product_categories
   where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
     and name = 'Campo Simples'
     and active
   limit 1;

  if v_category_id is null then
    raise exception 'Categoria Campo Simples nao encontrada para criar produtos Tape 80cm';
  end if;

  insert into public.products (tenant_id, code, name, category_id, status)
  select '00000000-0000-0000-0000-000000000001'::uuid,
         null,
         t.name,
         v_category_id,
         'active'
    from tmp_intertech_tape80_products t
   where not exists (
     select 1
       from public.products p
      where p.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
        and regexp_replace(lower(p.name), E'\\s+', ' ', 'g') = regexp_replace(lower(t.name), E'\\s+', ' ', 'g')
   );

  get diagnostics v_created = row_count;

  with matches as (
    select t.name, count(p.id) as match_count
      from tmp_intertech_tape80_products t
      left join public.products p
        on p.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
       and p.status = 'active'
       and regexp_replace(lower(p.name), E'\\s+', ' ', 'g') = regexp_replace(lower(t.name), E'\\s+', ' ', 'g')
     group by t.name
  )
  select count(*) filter (where match_count = 1),
         count(*) filter (where match_count > 1)
    into v_exact_matches, v_ambiguous
    from matches;

  if v_ambiguous > 0 or v_exact_matches <> 8 then
    raise exception 'Cadastro Tape 80cm inconsistente: % matches unicos, % ambiguos', v_exact_matches, v_ambiguous;
  end if;
end $$;

insert into public.product_cmv_overrides (
  tenant_id,
  product_id,
  cmv,
  source,
  reason,
  active,
  imported_at,
  updated_at
)
select p.tenant_id,
       p.id,
       t.cmv,
       'planilha_intertech_formula_especial_2026_08_13',
       'Produto criado a partir da planilha Rentabilidade 2026 e CMV final importado da aba 04 - Formula especial.',
       true,
       now(),
       now()
  from tmp_intertech_tape80_products t
  join public.products p
    on p.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
   and p.status = 'active'
   and regexp_replace(lower(p.name), E'\\s+', ' ', 'g') = regexp_replace(lower(t.name), E'\\s+', ' ', 'g')
on conflict (tenant_id, product_id, source) do update
  set cmv = excluded.cmv,
      reason = excluded.reason,
      active = true,
      updated_at = now();

insert into public.product_costs (
  product_id,
  tenant_id,
  cmv,
  cmv_without_labor,
  calculated_at
)
select p.id,
       p.tenant_id,
       t.cmv,
       coalesce(pc.cmv_without_labor, t.cmv),
       now()
  from tmp_intertech_tape80_products t
  join public.products p
    on p.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
   and p.status = 'active'
   and regexp_replace(lower(p.name), E'\\s+', ' ', 'g') = regexp_replace(lower(t.name), E'\\s+', ' ', 'g')
  left join public.product_costs pc on pc.product_id = p.id
on conflict (product_id) do update
  set cmv = excluded.cmv,
      calculated_at = excluded.calculated_at;
