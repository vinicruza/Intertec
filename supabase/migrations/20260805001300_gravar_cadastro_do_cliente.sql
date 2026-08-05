-- Gravar o cadastro do cliente pela tela — 05/08/2026.
--
-- Por RPC, e não por `insert` direto do navegador, pelo mesmo motivo de todo
-- o resto do sistema: o `tenant_id` é resolvido no servidor. Se o navegador
-- pudesse mandá-lo, poderia mandar o de outra empresa.
--
-- A normalização (tirar máscara de documento, CEP e telefone) é repetida aqui
-- de propósito. O TypeScript já limpa antes de enviar, mas quem garante o
-- formato é quem está mais perto do dado: uma chamada futura vinda de outro
-- lugar não passa por aquele TypeScript.
create or replace function public.save_customer(
  p_id uuid,
  p_name text,
  p_uf text,
  p_tax_id text,
  p_billing_zip text,
  p_shipping_zip text,
  p_contact_name text,
  p_phone text,
  p_email text,
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

  -- Mensagem em vez do erro cru do índice único: quem digitou precisa saber
  -- QUE cliente já tem aquele documento, para ir até ele em vez de recadastrar.
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
      (tenant_id, name, uf, tax_id, billing_zip, shipping_zip, contact_name, phone, email, notes)
    values
      (v_tenant_id, btrim(p_name), nullif(btrim(p_uf), ''), v_tax_id, v_billing_zip,
       v_shipping_zip, nullif(btrim(p_contact_name), ''), v_phone,
       nullif(btrim(p_email), ''), nullif(btrim(p_notes), ''))
    returning id into v_id;
  else
    update public.customers
       set name = btrim(p_name),
           uf = nullif(btrim(p_uf), ''),
           tax_id = v_tax_id,
           billing_zip = v_billing_zip,
           shipping_zip = v_shipping_zip,
           contact_name = nullif(btrim(p_contact_name), ''),
           phone = v_phone,
           email = nullif(btrim(p_email), ''),
           notes = nullif(btrim(p_notes), '')
     where id = v_id and tenant_id = v_tenant_id;
    if not found then raise exception 'Cliente não encontrado'; end if;
  end if;

  return v_id;
end $$;

revoke execute on function public.save_customer(uuid, text, text, text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.save_customer(uuid, text, text, text, text, text, text, text, text, text)
  to authenticated;
