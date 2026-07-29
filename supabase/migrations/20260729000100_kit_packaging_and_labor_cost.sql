-- Sprint A — Correções de CMV pedidas na reunião Intertech de 16/07/2026.
--
-- 1) Embalagem e esterilização do KIT: o envelope é um só e a caixa de
--    esterilização é uma só POR KIT, não por produto dentro dele. Hoje a
--    rentabilidade usa um valor aproximado ("kit aleatório"), que a própria
--    empresa apontou como errado.
-- 2) Mão de obra (costureira) separável do CMV: o custo continua dentro do
--    CMV cheio, mas o DRE por competência precisa enxergar o CMV sem ele,
--    porque se paga costureira referente à produção passada.

-- ------------------------------------------------------------------
-- 1. Insumo de mão de obra
-- ------------------------------------------------------------------
alter table public.inputs
  add column if not exists is_labor boolean not null default false;

comment on column public.inputs.is_labor is
  'Insumo que representa mão de obra (costureira). Entra no CMV cheio e é '
  'excluído do CMV sem mão de obra, usado no DRE por competência.';

-- Marca os custos de costureira já existentes na carga da planilha.
update public.inputs
   set is_labor = true
 where is_labor = false
   and lower(name) like '%costureira%';

create index if not exists inputs_is_labor_idx
  on public.inputs (tenant_id) where is_labor;

-- CMV do produto na leitura sem mão de obra. Fica ao lado do CMV cheio, que
-- continua sendo o usado no pedido — o de competência é para o DRE.
alter table public.product_costs
  add column if not exists cmv_without_labor numeric;

comment on column public.product_costs.cmv_without_labor is
  'CMV excluindo insumos marcados como mão de obra. Null enquanto o produto '
  'não tiver sido recalculado após a migração; nesse caso vale o CMV cheio.';

-- ------------------------------------------------------------------
-- 2. Embalagem / esterilização no nível do kit
-- ------------------------------------------------------------------
create table if not exists public.kit_packaging (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  kit_id uuid not null references public.kits (id) on delete cascade,
  input_id uuid not null references public.inputs (id),
  -- Quantidade consumida POR KIT (ex.: 1 envelope, 2 caixas de esterilização).
  quantity numeric not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (kit_id, input_id)
);

comment on table public.kit_packaging is
  'Insumos consumidos uma vez por kit montado (envelope, caixa de '
  'esterilização). Somam ao CMV do kit em cima da soma dos produtos.';

create index if not exists kit_packaging_tenant_id_idx on public.kit_packaging (tenant_id);
create index if not exists kit_packaging_kit_id_idx on public.kit_packaging (kit_id);
create index if not exists kit_packaging_input_id_idx on public.kit_packaging (input_id);

alter table public.kit_packaging enable row level security;

create policy kit_packaging_select on public.kit_packaging for select
  using (tenant_id = public.current_tenant_id() and public.current_user_role() is not null);

create policy kit_packaging_write on public.kit_packaging for all
  using (tenant_id = public.current_tenant_id()
         and public.current_user_role() in ('admin', 'financeiro', 'comercial'))
  with check (tenant_id = public.current_tenant_id()
              and public.current_user_role() in ('admin', 'financeiro', 'comercial'));

grant select, insert, update, delete on public.kit_packaging to authenticated;

-- updated_at automático, no mesmo padrão das demais tabelas (migração 0004).
drop trigger if exists trg_kit_packaging_updated_at on public.kit_packaging;
create trigger trg_kit_packaging_updated_at
  before update on public.kit_packaging
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------
-- 3. Gravação atômica do kit, agora com a embalagem
-- ------------------------------------------------------------------
-- A assinatura passa a incluir a embalagem (calculada no motor, em
-- assinaturaKitCompleta). Kits sem embalagem mantêm a assinatura anterior,
-- então o catálogo já cadastrado continua válido.
create or replace function public.save_kit_with_items(
  p_kit_id uuid,
  p_code text,
  p_name text,
  p_description text,
  p_signature text,
  p_items jsonb,
  p_packaging jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_kit_id uuid := p_kit_id;
  v_existing record;
  v_packaging jsonb := coalesce(p_packaging, '[]'::jsonb);
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem tenant ativo';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Nome do kit é obrigatório';
  end if;
  if nullif(btrim(p_signature), '') is null then
    raise exception 'Assinatura do kit é obrigatória';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Kit deve possuir ao menos um item';
  end if;
  if jsonb_typeof(v_packaging) <> 'array' then
    raise exception 'Embalagem do kit deve ser uma lista';
  end if;

  select id, name into v_existing
    from public.kits
   where tenant_id = v_tenant_id
     and signature = p_signature
     and (p_kit_id is null or id <> p_kit_id)
   limit 1;
  if found then
    return jsonb_build_object(
      'tipo', 'duplicado',
      'kitExistente', jsonb_build_object('id', v_existing.id, 'name', v_existing.name)
    );
  end if;

  if v_kit_id is null then
    insert into public.kits (tenant_id, code, name, description, signature)
    values (v_tenant_id, nullif(btrim(p_code), ''), btrim(p_name),
            nullif(btrim(p_description), ''), p_signature)
    returning id into v_kit_id;
  else
    update public.kits
       set code = coalesce(nullif(btrim(p_code), ''), code),
           name = btrim(p_name),
           description = nullif(btrim(p_description), ''),
           signature = p_signature
     where id = v_kit_id and tenant_id = v_tenant_id;
    if not found then raise exception 'Kit não encontrado'; end if;
    delete from public.kit_items where kit_id = v_kit_id;
    delete from public.kit_packaging where kit_id = v_kit_id;
  end if;

  insert into public.kit_items (tenant_id, kit_id, product_id, quantity)
  select v_tenant_id, v_kit_id, x.product_id, x.quantity
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric);

  if (select count(*) from public.kit_items where kit_id = v_kit_id)
       <> jsonb_array_length(p_items) then
    raise exception 'Nem todos os itens do kit foram persistidos';
  end if;

  if jsonb_array_length(v_packaging) > 0 then
    insert into public.kit_packaging (tenant_id, kit_id, input_id, quantity)
    select v_tenant_id, v_kit_id, x.input_id, x.quantity
      from jsonb_to_recordset(v_packaging) as x(input_id uuid, quantity numeric);

    if (select count(*) from public.kit_packaging where kit_id = v_kit_id)
         <> jsonb_array_length(v_packaging) then
      raise exception 'Nem todos os itens de embalagem do kit foram persistidos';
    end if;
  end if;

  return jsonb_build_object('tipo', case when p_kit_id is null then 'criado' else 'atualizado' end,
                            'id', v_kit_id);
exception
  when unique_violation then
    select id, name into v_existing
      from public.kits
     where tenant_id = v_tenant_id and signature = p_signature
     limit 1;
    if found then
      return jsonb_build_object('tipo', 'duplicado',
        'kitExistente', jsonb_build_object('id', v_existing.id, 'name', v_existing.name));
    end if;
    raise;
end;
$$;
