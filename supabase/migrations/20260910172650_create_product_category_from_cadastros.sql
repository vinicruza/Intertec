-- Permite criar categorias de produto manualmente em Cadastros.
--
-- Até aqui a tela só alterava o prefixo de ERP das categorias existentes. A
-- Intertech precisa conseguir criar uma família nova sem depender de acesso ao
-- banco, mas mantendo a mesma proteção: só Administrador, tenant atual e
-- prefixo semântico válido.

create or replace function public.slugify_product_category(p_text text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(
    translate(
      lower(coalesce(p_text, '')),
      'áàãâäéèêëíìîïóòõôöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'
    ),
    '[^a-z0-9]+',
    '-',
    'g'
  ));
$$;

create or replace function public.create_product_category(
  p_name text,
  p_prefix text,
  p_erp_prefix text default null,
  p_sort_order integer default 0
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_id uuid;
  v_slug text;
begin
  if not public.has_role('admin') then
    raise exception 'Apenas o Administrador cria categorias de produto';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception 'Informe o nome da categoria';
  end if;

  p_prefix := upper(btrim(p_prefix));
  if p_prefix !~ '^[A-Z][A-Z0-9]{1,2}$' then
    raise exception 'O prefixo da categoria tem de 2 a 3 caracteres, começando por letra maiúscula — por exemplo CS ou AVC.';
  end if;

  if p_erp_prefix is not null and nullif(btrim(p_erp_prefix), '') is not null and btrim(p_erp_prefix) !~ '^[0-9]{1,4}$' then
    raise exception 'O prefixo de ERP precisa ter de 1 a 4 dígitos';
  end if;

  v_slug := public.slugify_product_category(p_name);
  if v_slug = '' then
    raise exception 'Informe um nome válido para a categoria';
  end if;

  insert into public.product_categories (
    tenant_id,
    name,
    slug,
    prefix,
    erp_prefix,
    sort_order,
    active
  )
  values (
    v_tenant_id,
    btrim(p_name),
    v_slug,
    p_prefix,
    nullif(btrim(p_erp_prefix), ''),
    coalesce(p_sort_order, 0),
    true
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.slugify_product_category(text) from public, anon;
revoke execute on function public.create_product_category(text, text, text, integer) from public, anon;
grant execute on function public.slugify_product_category(text) to authenticated;
grant execute on function public.create_product_category(text, text, text, integer) to authenticated;
