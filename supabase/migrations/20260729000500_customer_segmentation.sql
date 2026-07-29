-- Sprint D — Categorização de clientes (reunião Intertech 16/07/2026).
--
-- A decisão da reunião: categoriza-se o CLIENTE, não o kit. O mesmo kit é
-- vendido para hospital, veterinário e oftalmologia; categorizar o código do
-- kit criaria códigos duplicados diferenciados só por observação.
--
--   "você não categoriza o código, você categoriza o seu cliente"
--
-- Com isso a empresa consegue responder: das 1.300 cotações, quantas foram
-- para veterinário? Quantas para clínico?
--
-- Estrutura do código do cliente, também definida na reunião: "o primeiro item
-- define se é hospital, se é clínica; o segundo item vai definir qual é a
-- área, oftalmológico, ginecológico".
--
-- IMPORTANTE: a Intertech ainda não fechou a lista de categorias. Por isso
-- elas são TABELA EDITÁVEL, não enum — a lista abaixo é uma partida para o
-- cliente ajustar em Configurações, não uma decisão tomada por nós.

-- ------------------------------------------------------------------
-- 1. Tipo de cliente (primeiro campo do código)
-- ------------------------------------------------------------------
create table if not exists public.customer_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  name text not null,
  -- Dois dígitos: é o primeiro campo do código do cliente.
  code_prefix text not null check (code_prefix ~ '^[0-9]{2}$'),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (tenant_id, name),
  unique (tenant_id, code_prefix)
);

-- ------------------------------------------------------------------
-- 2. Área de atuação (segundo campo do código)
-- ------------------------------------------------------------------
create table if not exists public.customer_specialties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  name text not null,
  code_prefix text not null check (code_prefix ~ '^[0-9]{2}$'),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (tenant_id, name),
  unique (tenant_id, code_prefix)
);

do $$
declare t text;
begin
  foreach t in array array['customer_types', 'customer_specialties'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($f$create policy %1$s_select on public.%1$I for select
      using (tenant_id = public.current_tenant_id() and public.current_user_role() is not null)$f$, t);
    execute format($f$create policy %1$s_write on public.%1$I for all
      using (tenant_id = public.current_tenant_id() and public.current_user_role() in ('admin','financeiro'))
      with check (tenant_id = public.current_tenant_id() and public.current_user_role() in ('admin','financeiro'))$f$, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create trigger trg_%1$s_updated_at before update on public.%1$I
      for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Partida sugerida. Os segmentos citados na reunião foram veterinário,
-- hospital, clínica e oftalmologia; o resto é preenchimento razoável para a
-- tela não nascer vazia. A Intertech ajusta.
insert into public.customer_types (tenant_id, name, code_prefix, sort_order)
select t.id, v.name, v.code_prefix, v.sort_order
from public.tenants t cross join (values
  ('Hospital', '10', 10),
  ('Clínica', '20', 20),
  ('Consultório', '30', 30),
  ('Veterinário', '40', 40),
  ('Distribuidor / revenda', '50', 50),
  ('Outro', '90', 90)
) as v(name, code_prefix, sort_order)
on conflict (tenant_id, code_prefix) do nothing;

insert into public.customer_specialties (tenant_id, name, code_prefix, sort_order)
select t.id, v.name, v.code_prefix, v.sort_order
from public.tenants t cross join (values
  ('Geral / multiespecialidade', '00', 0),
  ('Oftalmologia', '10', 10),
  ('Ginecologia', '20', 20),
  ('Ortopedia', '30', 30),
  ('Odontologia', '40', 40),
  ('Cirurgia geral', '50', 50),
  ('Veterinária', '60', 60)
) as v(name, code_prefix, sort_order)
on conflict (tenant_id, code_prefix) do nothing;

-- ------------------------------------------------------------------
-- 3. Cliente ganha segmento e código estruturado
-- ------------------------------------------------------------------
alter table public.customers
  add column if not exists customer_type_id uuid references public.customer_types (id),
  add column if not exists customer_specialty_id uuid references public.customer_specialties (id),
  add column if not exists code text;

create unique index if not exists customers_code_unique
  on public.customers (tenant_id, code) where code is not null;
create index if not exists customers_type_idx on public.customers (tenant_id, customer_type_id);
create index if not exists customers_specialty_idx on public.customers (tenant_id, customer_specialty_id);

comment on column public.customers.code is
  'Código estruturado: tipo(2) + área(2) + sequencial(4). Ex.: 4060-0001 = '
  'Veterinário / Veterinária, cliente 1. Só é gerado quando o cliente é '
  'categorizado — os cadastros antigos ficam sem código até serem revisados.';

-- Gera o código na categorização. Sequencial por combinação tipo+área, para o
-- código continuar legível quando a base crescer.
create or replace function public.set_customer_code()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tipo text;
  v_area text;
  v_next integer;
begin
  -- Sem categoria completa não há código: melhor vazio do que um código que
  -- mente sobre o segmento.
  if new.customer_type_id is null or new.customer_specialty_id is null then
    return new;
  end if;

  -- Código já existente não muda: ele pode ter ido para documento, planilha,
  -- e-mail. Recategorizar não reescreve o passado.
  if new.code is not null then
    return new;
  end if;

  select code_prefix into v_tipo from public.customer_types
   where id = new.customer_type_id and tenant_id = new.tenant_id;
  select code_prefix into v_area from public.customer_specialties
   where id = new.customer_specialty_id and tenant_id = new.tenant_id;
  if v_tipo is null or v_area is null then
    raise exception 'Tipo ou área de cliente inválidos';
  end if;

  perform pg_advisory_xact_lock(hashtext('customer:' || new.tenant_id::text || ':' || v_tipo || v_area));
  select coalesce(max(substring(code from '[0-9]+$')::integer), 0) + 1
    into v_next
    from public.customers
   where tenant_id = new.tenant_id and code like v_tipo || v_area || '-%';

  new.code := v_tipo || v_area || '-' || lpad(v_next::text, 4, '0');
  return new;
end $$;

drop trigger if exists trg_customers_code on public.customers;
create trigger trg_customers_code
  before insert or update of customer_type_id, customer_specialty_id on public.customers
  for each row execute function public.set_customer_code();

-- ------------------------------------------------------------------
-- 4. Quantos clientes faltam categorizar
-- ------------------------------------------------------------------
-- A reunião registrou 13 mil cadastros sem categoria. O trabalho é grande e
-- precisa ser medido: prioriza-se quem tem pedido recente.
create or replace function public.customers_pending_segmentation()
returns table (total bigint, com_pedido bigint)
language sql stable security invoker set search_path = public, pg_temp as $$
  select
    count(*) filter (where c.customer_type_id is null or c.customer_specialty_id is null),
    count(*) filter (
      where (c.customer_type_id is null or c.customer_specialty_id is null)
        and exists (select 1 from public.orders o where o.customer_id = c.id)
    )
  from public.customers c
  where c.tenant_id = public.current_tenant_id() and c.active;
$$;

revoke execute on function public.customers_pending_segmentation() from public, anon;
grant execute on function public.customers_pending_segmentation() to authenticated;
