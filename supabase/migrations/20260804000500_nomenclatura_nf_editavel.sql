-- Cadastros → Nomenclatura NF: a regra de nome fiscal sai do código e vira
-- cadastro, 04/08/2026.
--
-- Até aqui, a regra vivia numa tabela fixa dentro de
-- lib/nomenclatura/descricaoNF.ts. Trocar o nome fiscal de uma família — que
-- mexe em dezenas de produtos de uma vez — exigia mudar código e publicar.
-- Agora mora aqui, e o Administrador edita pela tela.
--
-- O que NÃO mudou: a regra continua sendo aplicada em TypeScript, função pura
-- e testada. Este banco guarda a configuração; quem traduz nome de catálogo em
-- nome fiscal continua sendo `descricaoNFdoProduto`. Reimplementar a regra em
-- SQL criaria duas cópias que divergem — e a divergência sairia impressa na
-- nota fiscal antes de alguém perceber.

create table if not exists public.nf_naming_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  -- Começo do nome no catálogo que identifica a família. Ex.: "Campo de Mesa".
  match_prefix text not null check (btrim(match_prefix) <> ''),
  -- Nome que passa a valer na nota. Ex.: "Campo Cirúrgico com Reforço".
  nf_name text not null check (btrim(nf_name) <> ''),
  -- O que some do resto do nome. NÃO é igual para todos: nos campos somem TNT
  -- e SMS; nos aventais some só o TNT, porque o SMS continua na nota.
  remove_grammage boolean not null default false,
  remove_tnt boolean not null default false,
  remove_sms boolean not null default false,
  remove_origin boolean not null default false,
  -- Trocas de palavra: [{"de":"Tag","para":"Toalha"}]. "para" vazio apaga.
  replacements jsonb not null default '[]'::jsonb
    check (jsonb_typeof(replacements) = 'array'),
  -- Ordem em que as famílias são testadas. A genérica ("Campo", "Avental")
  -- precisa vir DEPOIS das específicas, senão engole todas elas.
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (tenant_id, match_prefix)
);

alter table public.nf_naming_rules enable row level security;
create policy nf_naming_rules_select on public.nf_naming_rules for select
  using (tenant_id = public.current_tenant_id() and public.current_user_role() is not null);
create policy nf_naming_rules_write on public.nf_naming_rules for all
  using (tenant_id = public.current_tenant_id() and public.current_user_role() in ('admin','financeiro'))
  with check (tenant_id = public.current_tenant_id() and public.current_user_role() in ('admin','financeiro'));
grant select, insert, update, delete on public.nf_naming_rules to authenticated;
create trigger trg_nf_naming_rules_updated_at before update on public.nf_naming_rules
  for each row execute function public.set_updated_at();

-- Semente: exatamente as regras que o cliente definiu hoje, e que já geraram
-- as 324 descrições em produção. A tela nasce mostrando o que já está valendo,
-- não uma lista vazia. Espelha lib/nomenclatura/familiasIniciais.ts, que é a
-- fixture dos 70 testes de nomenclatura.
insert into public.nf_naming_rules
  (tenant_id, match_prefix, nf_name, remove_grammage, remove_tnt, remove_sms, remove_origin, replacements, sort_order)
select t.id, v.match_prefix, v.nf_name, v.g, v.tnt, v.sms, v.origem, v.repl::jsonb, v.ord
from public.tenants t cross join (values
  ('Campo Catarata',     'Campo Cirúrgico com Adesivo e Bag',     true, true, true, true, '[]', 10),
  ('Campo com Fenestra', 'Campo Cirúrgico com Fenestra',          true, true, true, true, '[]', 20),
  ('Campo com Adesivo',  'Campo Cirúrgico com Adesivo',           true, true, true, true, '[]', 30),
  ('Campo de Mesa',      'Campo Cirúrgico com Reforço',           true, true, true, true, '[]', 40),
  ('Campo Lasik',        'Campo Cirúrgico com Adesivo e 2 Bags',  true, true, true, true, '[]', 50),
  ('Campo Simples',      'Campo Cirúrgico Sem Fenestra',          true, true, true, true, '[]', 60),
  ('Steri Drape',        'Campo Cirúrgico Steri Drape',           true, true, true, true,
     '[{"de":"Grande","para":"G"},{"de":"Pequeno","para":"P"}]', 70),
  ('Campo',              'Campo Cirúrgico',                       true, true, true, true, '[]', 80),
  ('Avental Gineco',     'Avental Cirúrgico Sem Manga',           true, true, false, false,
     '[{"de":"Tag","para":"Toalha"}]', 90),
  ('Avental',            'Avental Cirúrgico',                     true, true, false, false,
     '[{"de":"Tag","para":"Toalha"}]', 100),
  ('Compressa Wiper',    'Toalha de Mão',                         false, false, false, false, '[]', 110)
) as v(match_prefix, nf_name, g, tnt, sms, origem, repl, ord)
on conflict (tenant_id, match_prefix) do nothing;

-- ------------------------------------------------------------------
-- Escrita das famílias (tela de Administrador, como o resto de Cadastros)
-- ------------------------------------------------------------------
create or replace function public.save_nf_naming_rule(
  p_id uuid,                 -- nulo = criar
  p_match_prefix text,
  p_nf_name text,
  p_remove_grammage boolean,
  p_remove_tnt boolean,
  p_remove_sms boolean,
  p_remove_origin boolean,
  p_replacements jsonb,
  p_sort_order integer,
  p_active boolean
)
returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_id uuid := p_id;
  v_repl jsonb := coalesce(p_replacements, '[]'::jsonb);
begin
  if not public.has_role('admin') then
    raise exception 'Sem permissão para alterar a nomenclatura de NF';
  end if;
  if nullif(btrim(p_match_prefix), '') is null then
    raise exception 'Informe o começo do nome no catálogo';
  end if;
  if nullif(btrim(p_nf_name), '') is null then
    raise exception 'Informe o nome que sai na nota fiscal';
  end if;
  if jsonb_typeof(v_repl) <> 'array' then
    raise exception 'Trocas de palavra em formato inválido';
  end if;

  if v_id is null then
    insert into public.nf_naming_rules (tenant_id, match_prefix, nf_name,
      remove_grammage, remove_tnt, remove_sms, remove_origin, replacements, sort_order, active)
    values (v_tenant_id, btrim(p_match_prefix), btrim(p_nf_name),
      coalesce(p_remove_grammage, false), coalesce(p_remove_tnt, false),
      coalesce(p_remove_sms, false), coalesce(p_remove_origin, false),
      v_repl, coalesce(p_sort_order, 0), coalesce(p_active, true))
    returning id into v_id;
  else
    update public.nf_naming_rules
       set match_prefix = btrim(p_match_prefix), nf_name = btrim(p_nf_name),
           remove_grammage = coalesce(p_remove_grammage, false),
           remove_tnt = coalesce(p_remove_tnt, false),
           remove_sms = coalesce(p_remove_sms, false),
           remove_origin = coalesce(p_remove_origin, false),
           replacements = v_repl,
           sort_order = coalesce(p_sort_order, 0),
           active = coalesce(p_active, true)
     where id = v_id and tenant_id = v_tenant_id;
    if not found then raise exception 'Família não encontrada'; end if;
  end if;
  return v_id;
end $$;

revoke execute on function public.save_nf_naming_rule(uuid,text,text,boolean,boolean,boolean,boolean,jsonb,integer,boolean) from public, anon;
grant execute on function public.save_nf_naming_rule(uuid,text,text,boolean,boolean,boolean,boolean,jsonb,integer,boolean) to authenticated;

create or replace function public.delete_nf_naming_rule(p_id uuid)
returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if not public.has_role('admin') then
    raise exception 'Sem permissão para alterar a nomenclatura de NF';
  end if;
  delete from public.nf_naming_rules where id = p_id and tenant_id = public.current_tenant_id();
  if not found then raise exception 'Família não encontrada'; end if;
end $$;

revoke execute on function public.delete_nf_naming_rule(uuid) from public, anon;
grant execute on function public.delete_nf_naming_rule(uuid) to authenticated;

-- ------------------------------------------------------------------
-- Aplicar a regra ao catálogo
-- ------------------------------------------------------------------
-- Recebe [{"id": uuid, "nf_description": text}] já calculado pela regra em
-- TypeScript e só grava. O banco não conhece a regra — conhece a GARANTIA:
-- produto marcado como 'manual' foi ajustado por uma pessoa e não é tocado,
-- por mais que a regra tenha opinião diferente.
create or replace function public.apply_nf_descriptions(p_rows jsonb)
returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_atualizados integer;
begin
  if not public.has_role('admin') then
    raise exception 'Sem permissão para aplicar a nomenclatura de NF';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Lista de descrições em formato inválido';
  end if;

  with novos as (
    select x.id, nullif(btrim(x.nf_description), '') as nf_description
    from jsonb_to_recordset(p_rows) x(id uuid, nf_description text)
  )
  update public.products p
     set nf_description = n.nf_description,
         nf_description_source = case when n.nf_description is null then null else 'regra' end,
         updated_at = now()
    from novos n
   where p.id = n.id
     and p.tenant_id = v_tenant_id
     and coalesce(p.nf_description_source, 'regra') <> 'manual'
     and p.nf_description is distinct from n.nf_description;

  get diagnostics v_atualizados = row_count;
  return v_atualizados;
end $$;

revoke execute on function public.apply_nf_descriptions(jsonb) from public, anon;
grant execute on function public.apply_nf_descriptions(jsonb) to authenticated;
