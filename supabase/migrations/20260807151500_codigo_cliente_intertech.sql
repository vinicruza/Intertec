-- Código externo do cliente: identificador usado no sistema da Intertech.
-- Não substitui customers.code, que é o código interno estruturado por
-- tipo/área do cliente.

alter table public.customers
  add column if not exists external_code text;

create unique index if not exists customers_external_code_unique
  on public.customers (tenant_id, upper(btrim(external_code)))
  where external_code is not null and btrim(external_code) <> '';

comment on column public.customers.external_code is
  'Código do cliente no sistema da Intertech. Usado para pesquisa/identificação; customers.code continua sendo o código interno estruturado.';

create or replace function public.set_customer_external_code(
  p_customer_id uuid,
  p_external_code text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_role public.user_role := public.current_user_role();
  v_external_code text := nullif(upper(btrim(coalesce(p_external_code, ''))), '');
  v_duplicado text;
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem tenant ativo';
  end if;
  if v_role not in ('admin', 'financeiro', 'comercial') then
    raise exception 'Sem permissão para alterar o cadastro de clientes';
  end if;

  if v_external_code is not null then
    select name into v_duplicado
      from public.customers
     where tenant_id = v_tenant_id
       and upper(btrim(coalesce(external_code, ''))) = v_external_code
       and id <> p_customer_id
     limit 1;
    if v_duplicado is not null then
      raise exception 'Já existe um cliente com este código: %', v_duplicado;
    end if;
  end if;

  update public.customers
     set external_code = v_external_code
   where id = p_customer_id
     and tenant_id = v_tenant_id;
  if not found then
    raise exception 'Cliente não encontrado';
  end if;
end $$;

create or replace function public.set_order_customer_external_code(
  p_order_id uuid,
  p_external_code text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_customer_id uuid;
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem tenant ativo';
  end if;

  select customer_id into v_customer_id
    from public.orders
   where id = p_order_id
     and tenant_id = v_tenant_id;
  if v_customer_id is null then
    raise exception 'Cotação sem cliente para vincular código';
  end if;

  perform public.set_customer_external_code(v_customer_id, p_external_code);
end $$;

revoke execute on function public.set_customer_external_code(uuid, text) from public, anon;
grant execute on function public.set_customer_external_code(uuid, text) to authenticated;

revoke execute on function public.set_order_customer_external_code(uuid, text) from public, anon;
grant execute on function public.set_order_customer_external_code(uuid, text) to authenticated;
