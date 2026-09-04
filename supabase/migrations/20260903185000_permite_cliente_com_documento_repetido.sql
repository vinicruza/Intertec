-- Permite dois cadastros de cliente com o mesmo CNPJ/CPF.
-- O aviso passa a ser responsabilidade da tela de cadastro; o banco mantém
-- apenas a busca por documento e a unicidade do código externo do cliente.

drop index if exists public.customers_tax_id_unico;

create index if not exists customers_tax_id_busca
  on public.customers (tenant_id, tax_id)
  where tax_id is not null;

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
