-- Gera codigos internos automaticos para produtos e kits.
-- Produtos: P001, P002...
-- Kits: K001, K002...

create or replace function public.next_catalog_code(
  p_tenant_id uuid,
  p_table_name text,
  p_prefix text,
  p_width integer default 3
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
  v_code text;
begin
  perform pg_advisory_xact_lock(hashtext(p_table_name || ':' || p_tenant_id::text || ':' || p_prefix));

  execute format(
    'select coalesce(max((substring(code from %L))::integer), 0) + 1
       from %I
      where tenant_id = $1
        and code ~ $2',
    '^' || p_prefix || '([0-9]+)$',
    p_table_name
  )
  into v_next
  using p_tenant_id, '^' || p_prefix || '[0-9]+$';

  v_code := p_prefix || lpad(v_next::text, p_width, '0');

  return v_code;
end;
$$;

create or replace function public.set_product_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := public.next_catalog_code(new.tenant_id, 'products', 'P', 3);
  else
    new.code := upper(btrim(new.code));
  end if;

  return new;
end;
$$;

create or replace function public.set_kit_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := public.next_catalog_code(new.tenant_id, 'kits', 'K', 3);
  else
    new.code := upper(btrim(new.code));
  end if;

  return new;
end;
$$;

alter table public.products
  alter column code drop default;

alter table public.kits
  alter column code drop default;

drop trigger if exists trg_products_auto_code on public.products;
create trigger trg_products_auto_code
before insert or update of code on public.products
for each row execute function public.set_product_code();

drop trigger if exists trg_kits_auto_code on public.kits;
create trigger trg_kits_auto_code
before insert or update of code on public.kits
for each row execute function public.set_kit_code();

update public.products
   set code = public.next_catalog_code(tenant_id, 'products', 'P', 3)
 where code is null or btrim(code) = '';

update public.kits
   set code = public.next_catalog_code(tenant_id, 'kits', 'K', 3)
 where code is null or btrim(code) = '';

with duplicados as (
  select id,
         tenant_id,
         row_number() over (partition by tenant_id, code order by created_at, id) as posicao
    from public.kits
   where code is not null and btrim(code) <> ''
)
update public.kits k
   set code = public.next_catalog_code(k.tenant_id, 'kits', 'K', 3)
  from duplicados d
 where k.id = d.id
   and d.posicao > 1;

alter table public.kits
  alter column code set not null;

drop index if exists public.kits_tenant_code_key;

create unique index if not exists kits_tenant_code_unique
  on public.kits (tenant_id, code);

revoke execute on function public.next_catalog_code(uuid, text, text, integer) from public, anon, authenticated;
revoke execute on function public.set_product_code() from public, anon, authenticated;
revoke execute on function public.set_kit_code() from public, anon, authenticated;
