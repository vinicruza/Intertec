-- Clientes: contatos separados e endereços completos — 06/08/2026.
--
-- Pedido da Intertech: separar contato comercial de contato financeiro e
-- permitir busca de CNPJ/CEP no cadastro. O CEP sozinho não resolve a ficha:
-- é preciso guardar logradouro, bairro, cidade e UF para faturamento/sede e
-- entrega.

alter table public.customers
  add column if not exists billing_street text,
  add column if not exists billing_number text,
  add column if not exists billing_complement text,
  add column if not exists billing_district text,
  add column if not exists billing_city text,
  add column if not exists billing_state char(2),
  add column if not exists shipping_street text,
  add column if not exists shipping_number text,
  add column if not exists shipping_complement text,
  add column if not exists shipping_district text,
  add column if not exists shipping_city text,
  add column if not exists shipping_state char(2),
  add column if not exists commercial_contact_name text,
  add column if not exists commercial_phone text,
  add column if not exists commercial_email text,
  add column if not exists financial_contact_name text,
  add column if not exists financial_phone text,
  add column if not exists financial_email text;

-- Migra o contato único antigo para contato comercial, preservando a leitura
-- das fichas antigas e evitando cadastro "vazio" depois da mudança de tela.
update public.customers
   set commercial_contact_name = coalesce(commercial_contact_name, contact_name),
       commercial_phone = coalesce(commercial_phone, phone),
       commercial_email = coalesce(commercial_email, email)
 where commercial_contact_name is null
   and commercial_phone is null
   and commercial_email is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_billing_state_formato') then
    alter table public.customers add constraint customers_billing_state_formato
      check (billing_state is null or billing_state ~ '^[A-Z]{2}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'customers_shipping_state_formato') then
    alter table public.customers add constraint customers_shipping_state_formato
      check (shipping_state is null or shipping_state ~ '^[A-Z]{2}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'customers_commercial_phone_formato') then
    alter table public.customers add constraint customers_commercial_phone_formato
      check (commercial_phone is null or commercial_phone ~ '^[0-9]{10,11}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'customers_financial_phone_formato') then
    alter table public.customers add constraint customers_financial_phone_formato
      check (financial_phone is null or financial_phone ~ '^[0-9]{10,11}$');
  end if;
end $$;

create or replace function public.save_customer(
  p_id uuid,
  p_name text,
  p_uf text,
  p_tax_id text,
  p_billing_zip text,
  p_billing_street text,
  p_billing_number text,
  p_billing_complement text,
  p_billing_district text,
  p_billing_city text,
  p_billing_state text,
  p_shipping_zip text,
  p_shipping_street text,
  p_shipping_number text,
  p_shipping_complement text,
  p_shipping_district text,
  p_shipping_city text,
  p_shipping_state text,
  p_contact_name text,
  p_phone text,
  p_email text,
  p_commercial_contact_name text,
  p_commercial_phone text,
  p_commercial_email text,
  p_financial_contact_name text,
  p_financial_phone text,
  p_financial_email text,
  p_notes text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_role public.user_role := public.current_user_role();
  v_id uuid := p_id;
  v_tax_id text := nullif(regexp_replace(coalesce(p_tax_id, ''), '\D', '', 'g'), '');
  v_billing_zip text := nullif(regexp_replace(coalesce(p_billing_zip, ''), '\D', '', 'g'), '');
  v_shipping_zip text := nullif(regexp_replace(coalesce(p_shipping_zip, ''), '\D', '', 'g'), '');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  v_commercial_phone text := nullif(regexp_replace(coalesce(p_commercial_phone, ''), '\D', '', 'g'), '');
  v_financial_phone text := nullif(regexp_replace(coalesce(p_financial_phone, ''), '\D', '', 'g'), '');
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem tenant ativo';
  end if;
  if v_role not in ('admin', 'financeiro', 'comercial') then
    raise exception 'Sem permissão para alterar o cadastro de clientes';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Informe o nome do cliente';
  end if;

  if v_tax_id is not null and exists (
    select 1 from public.customers
     where tenant_id = v_tenant_id and tax_id = v_tax_id
       and (v_id is null or id <> v_id)
  ) then
    raise exception 'Já existe um cliente com este CNPJ/CPF: %',
      (select name from public.customers
        where tenant_id = v_tenant_id and tax_id = v_tax_id limit 1);
  end if;

  if v_id is null then
    insert into public.customers
      (tenant_id, name, uf, tax_id,
       billing_zip, billing_street, billing_number, billing_complement, billing_district, billing_city, billing_state,
       shipping_zip, shipping_street, shipping_number, shipping_complement, shipping_district, shipping_city, shipping_state,
       contact_name, phone, email,
       commercial_contact_name, commercial_phone, commercial_email,
       financial_contact_name, financial_phone, financial_email,
       notes)
    values
      (v_tenant_id, btrim(p_name), nullif(btrim(p_uf), ''), v_tax_id,
       v_billing_zip, nullif(btrim(p_billing_street), ''), nullif(btrim(p_billing_number), ''),
       nullif(btrim(p_billing_complement), ''), nullif(btrim(p_billing_district), ''),
       nullif(btrim(p_billing_city), ''), nullif(upper(btrim(p_billing_state)), ''),
       v_shipping_zip, nullif(btrim(p_shipping_street), ''), nullif(btrim(p_shipping_number), ''),
       nullif(btrim(p_shipping_complement), ''), nullif(btrim(p_shipping_district), ''),
       nullif(btrim(p_shipping_city), ''), nullif(upper(btrim(p_shipping_state)), ''),
       nullif(btrim(p_contact_name), ''), v_phone, nullif(btrim(p_email), ''),
       nullif(btrim(p_commercial_contact_name), ''), v_commercial_phone, nullif(btrim(p_commercial_email), ''),
       nullif(btrim(p_financial_contact_name), ''), v_financial_phone, nullif(btrim(p_financial_email), ''),
       nullif(btrim(p_notes), ''))
    returning id into v_id;
  else
    update public.customers
       set name = btrim(p_name),
           uf = nullif(btrim(p_uf), ''),
           tax_id = v_tax_id,
           billing_zip = v_billing_zip,
           billing_street = nullif(btrim(p_billing_street), ''),
           billing_number = nullif(btrim(p_billing_number), ''),
           billing_complement = nullif(btrim(p_billing_complement), ''),
           billing_district = nullif(btrim(p_billing_district), ''),
           billing_city = nullif(btrim(p_billing_city), ''),
           billing_state = nullif(upper(btrim(p_billing_state)), ''),
           shipping_zip = v_shipping_zip,
           shipping_street = nullif(btrim(p_shipping_street), ''),
           shipping_number = nullif(btrim(p_shipping_number), ''),
           shipping_complement = nullif(btrim(p_shipping_complement), ''),
           shipping_district = nullif(btrim(p_shipping_district), ''),
           shipping_city = nullif(btrim(p_shipping_city), ''),
           shipping_state = nullif(upper(btrim(p_shipping_state)), ''),
           contact_name = nullif(btrim(p_contact_name), ''),
           phone = v_phone,
           email = nullif(btrim(p_email), ''),
           commercial_contact_name = nullif(btrim(p_commercial_contact_name), ''),
           commercial_phone = v_commercial_phone,
           commercial_email = nullif(btrim(p_commercial_email), ''),
           financial_contact_name = nullif(btrim(p_financial_contact_name), ''),
           financial_phone = v_financial_phone,
           financial_email = nullif(btrim(p_financial_email), ''),
           notes = nullif(btrim(p_notes), '')
     where id = v_id and tenant_id = v_tenant_id;
    if not found then raise exception 'Cliente não encontrado'; end if;
  end if;

  return v_id;
end $$;

revoke execute on function public.save_customer(
  uuid, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text
) from public, anon;
grant execute on function public.save_customer(
  uuid, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text
) to authenticated;
