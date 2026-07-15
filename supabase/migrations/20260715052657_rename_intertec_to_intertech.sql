-- Corrige a identidade da empresa sem alterar IDs, senhas, perfis ou vínculos.
update public.tenants
set name = 'Intertech Surgical', updated_at = now()
where lower(name) in ('intertec', 'imtertec', 'intertrch');

-- Os acessos abaixo são exclusivamente contas demo. O UUID e o hash de senha
-- permanecem intactos; somente o endereço de login e seus metadados mudam.
update auth.identities
set identity_data = jsonb_set(
      identity_data,
      '{email}',
      to_jsonb(replace(identity_data->>'email', '@intertec.demo', '@intertech.demo')),
      true
    ),
    updated_at = now()
where provider = 'email'
  and identity_data->>'email' like '%@intertec.demo';

update auth.users
set email = replace(email, '@intertec.demo', '@intertech.demo'),
    raw_user_meta_data = case
      when raw_user_meta_data ? 'email' then jsonb_set(
        raw_user_meta_data,
        '{email}',
        to_jsonb(replace(raw_user_meta_data->>'email', '@intertec.demo', '@intertech.demo')),
        true
      )
      else raw_user_meta_data
    end,
    updated_at = now()
where email like '%@intertec.demo';

do $$
begin
  if exists (select 1 from public.tenants where lower(name) in ('intertec', 'imtertec', 'intertrch')) then
    raise exception 'A marca antiga ainda existe em tenants';
  end if;
  if exists (select 1 from auth.users where email like '%@intertec.demo') then
    raise exception 'Um login demo ainda usa o domínio antigo';
  end if;
end $$;
