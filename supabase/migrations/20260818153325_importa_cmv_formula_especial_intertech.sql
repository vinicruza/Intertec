-- Importa o CMV final da planilha oficial para produtos com formula especial.
--
-- Contexto: a auditoria de 13/08/2026 mostrou que, nesses produtos, a planilha
-- e a alocacao batem entre si. O que diverge e o motor uniforme, porque ele
-- tenta calcular tudo como quantidade x preco unitario simples.
--
-- Esta migracao aplica o CMV final validado como referencia vigente e registra
-- o override para ele nao ser perdido em recalculos futuros da ficha tecnica.

create table if not exists public.product_cmv_overrides (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  cmv numeric not null check (cmv > 0),
  source text not null,
  reason text not null,
  active boolean not null default true,
  imported_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (tenant_id, product_id, source)
);

comment on table public.product_cmv_overrides is
  'CMVs importados/validados que devem prevalecer sobre o recalculo uniforme enquanto a formula especial nao for modelada.';
comment on column public.product_cmv_overrides.source is
  'Origem do CMV importado, como uma planilha oficial ou uma revisao de cadastro.';
comment on column public.product_cmv_overrides.reason is
  'Motivo operacional para manter o CMV fixo/importado.';

create index if not exists product_cmv_overrides_active_idx
  on public.product_cmv_overrides (tenant_id, product_id)
  where active;

alter table public.product_cmv_overrides enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'product_cmv_overrides'
       and policyname = 'product_cmv_overrides_select'
  ) then
    create policy product_cmv_overrides_select on public.product_cmv_overrides
      for select
      using (tenant_id = public.current_tenant_id()
             and public.current_user_role() in ('admin','financeiro'));
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'product_cmv_overrides'
       and policyname = 'product_cmv_overrides_write'
  ) then
    create policy product_cmv_overrides_write on public.product_cmv_overrides
      for all
      using (tenant_id = public.current_tenant_id()
             and public.current_user_role() in ('admin','financeiro'))
      with check (tenant_id = public.current_tenant_id()
                  and public.current_user_role() in ('admin','financeiro'));
  end if;
end $$;

create or replace function public.apply_product_cmv_override()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cmv numeric;
begin
  select o.cmv
    into v_cmv
    from public.product_cmv_overrides o
   where o.tenant_id = new.tenant_id
     and o.product_id = new.product_id
     and o.active
   order by coalesce(o.updated_at, o.imported_at) desc
   limit 1;

  if v_cmv is not null then
    new.cmv := v_cmv;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_product_costs_apply_cmv_override on public.product_costs;
create trigger trg_product_costs_apply_cmv_override
  before insert or update on public.product_costs
  for each row
  execute function public.apply_product_cmv_override();

create temporary table tmp_intertech_formula_special_cmv (
  name text primary key,
  cmv numeric not null
) on commit drop;

insert into tmp_intertech_formula_special_cmv (name, cmv) values
  ('Campo de Mesa 1,50 x 1,50 + Tape 50cm', 3.973215),
  ('Campo de Mesa 1,50 x 1,50  + Tape 50cm Não Estéril', 3.052182),
  ('Campo de Mesa 1,50 x 1,50 + Tape 1m', 4.395674),
  ('Campo de Mesa 1,50 x 1,50  + Tape 1m Não Estéril', 3.474641),
  ('Campo de Mesa 2,00 x 3,00 com Fenestra + Tape 40cm', 8.762183),
  ('Campo de Mesa 2,00 x 3,00 com Fenestra + Tape 40cm Não Estéril', 7.335630),
  ('Campo de Mesa 0,70 x 0,70 + Tape 10cm Superior e Inferior', 1.445044),
  ('Campo de Mesa 0,70 x 0,70 + Tape 10cm Superior e Inferior Não Estéril', 0.748686),
  ('Avental TNT Sem Manga Não Estéril', 1.507123),
  ('Avental Gineco', 1.616176),
  ('Avental Gineco Não Estéril', 1.497576),
  ('Campo Simples 1,50 x 1,50 + Tape 50cm GR40', 2.395112),
  ('Campo Simples 1,50 x 1,50 + Tape 50cm Não Estéril GR40', 1.992099),
  ('Campo Simples 1,50 x 1,50 + Tape 50cm GR30', 2.239044),
  ('Campo Simples 1,50 x 1,50 + Tape 50cm Não Estéril GR30', 1.836031),
  ('Campo Simples 1,00 x 1,60 + Tape 50cm GR40', 1.944249),
  ('Campo Simples 1,00 x 1,60 + Tape 50cm Não Estéril GR40', 1.541236),
  ('Campo Simples 1,00 x 1,60 + Tape 50cm GR30', 1.833267),
  ('Campo Simples 1,00 x 1,60 + Tape 50cm Não Estéril GR30', 1.430254),
  ('Campo Simples 1,50 x 1,80 + Tape 1,5m GR40', 4.057687),
  ('Campo Simples 1,50 x 1,80 + Tape 1,5m Não Estéril GR40', 3.149154),
  ('Campo Simples 1,50 x 1,80 + Tape 1,5m GR30', 3.870405),
  ('Campo Simples 1,50 x 1,80 + Tape 1,5m Não Estéril GR30', 2.961872),
  ('Campo Lateral 1,00 x 1,60', 3.308715),
  ('Campo Lateral 1,00 x 1,60 Não Estéril', 2.301662),
  ('Campo Inferior 1,60 x 2,00', 4.107102),
  ('Campo Inferior 1,60 x 2,00 Não Estéril', 2.651054),
  ('Campo Superior 1,60 x 2,60', 4.885331),
  ('Campo Superior 1,60 x 2,60 Não Estéril', 3.316945),
  ('Campo Lateral Laminado 1,00 x 1,60', 4.062552),
  ('Campo Lateral Laminado 1,00 x 1,60 Não Estéril', 3.055499),
  ('Campo Inferior Laminado 1,60 x 2,00', 5.614775),
  ('Campo Inferior Laminado 1,60 x 2,00 Não Estéril', 4.158727),
  ('Campo Superior Laminado 1,60 x 2,60', 6.845305),
  ('Campo Superior 1,60 x 2,60 Laminado Não Estéril', 5.276919),
  ('Campo 1,60 x 2,00 Fenestra U', 4.473085),
  ('Campo 1,60 x 2,00 Fenestra U Não Estéril', 3.073513),
  ('Campo 1,60 x 2,00 Laminado Fenestra U', 5.980758),
  ('Campo 1,60 x 2,00 Laminado Fenestra U Não Estéril', 4.581186),
  ('Compressa P Pacote 5', 3.772729),
  ('Bota', 1.937794),
  ('Bota Não Estéril', 1.430355),
  ('Perneira', 3.921486),
  ('Perneira Não Estéril', 2.914433),
  ('Campo Com Fenestra 0,80 x 0,80 + Tape 20cm GR40', 1.098795),
  ('Avental TNT Sem Manga Tam Especial Não Estéril Descpro', 2.294619);

do $$
declare
  v_ambiguous integer;
  v_matched integer;
begin
  with matches as (
    select t.name, count(p.id) as match_count
      from tmp_intertech_formula_special_cmv t
      left join public.products p
        on regexp_replace(lower(p.name), E'\\s+', ' ', 'g') =
           regexp_replace(lower(t.name), E'\\s+', ' ', 'g')
       and p.status = 'active'
     group by t.name
  )
  select count(*) into v_ambiguous
    from matches
   where match_count > 1;

  if v_ambiguous > 0 then
    raise exception 'Importacao de CMV abortada: % produtos tiveram casamento ambiguo', v_ambiguous;
  end if;

  with matched as (
    select distinct p.id
      from tmp_intertech_formula_special_cmv t
      join public.products p
        on regexp_replace(lower(p.name), E'\\s+', ' ', 'g') =
           regexp_replace(lower(t.name), E'\\s+', ' ', 'g')
       and p.status = 'active'
  )
  select count(*) into v_matched from matched;

  if v_matched <> 46 then
    raise exception 'Importacao de CMV abortada: esperado 46 produtos casados, encontrado %', v_matched;
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
       'CMV final importado da aba 04 - Formula especial; segunda etapa sera modelar a regra da ficha tecnica.',
       true,
       now(),
       now()
  from tmp_intertech_formula_special_cmv t
  join public.products p
    on regexp_replace(lower(p.name), E'\\s+', ' ', 'g') =
       regexp_replace(lower(t.name), E'\\s+', ' ', 'g')
   and p.status = 'active'
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
  from tmp_intertech_formula_special_cmv t
  join public.products p
    on regexp_replace(lower(p.name), E'\\s+', ' ', 'g') =
       regexp_replace(lower(t.name), E'\\s+', ' ', 'g')
   and p.status = 'active'
  left join public.product_costs pc on pc.product_id = p.id
on conflict (product_id) do update
  set cmv = excluded.cmv,
      calculated_at = excluded.calculated_at;
