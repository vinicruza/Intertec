-- Gestão de usuários pelo Administrador.
--
-- Antes disto, os únicos perfis eram os quatro semeados na carga inicial: não
-- havia como dar acesso a uma pessoa real sem mexer no banco à mão.
--
-- COMO O ACESSO FUNCIONA
--
-- Criar a credencial (e-mail e senha) é responsabilidade do Supabase Auth —
-- convite pelo painel ou cadastro pelo próprio usuário. Fazer isso a partir do
-- navegador exigiria a chave de serviço no front-end, o que daria a qualquer
-- visitante poder total sobre o projeto. Então o desenho é:
--
--   1. a pessoa ganha credencial pelo Supabase (convite ou cadastro);
--   2. o gatilho abaixo cria o perfil dela como INATIVO;
--   3. o Administrador define nome e perfil e ativa, na tela de Usuários.
--
-- Enquanto estiver inativo, current_user_role() e current_tenant_id() devolvem
-- nulo — e como toda política de RLS depende delas, a pessoa entra e não
-- enxerga nada. O portão já existia; faltava a porta.

-- ------------------------------------------------------------------
-- 1. Todo usuário novo do Auth ganha um perfil inativo
-- ------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tenant_id uuid;
begin
  -- Já existe perfil (ex.: carga inicial)? Não mexe.
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  -- Multi-tenant está preparado mas não implementado (PRD §8): há um tenant só.
  select id into v_tenant_id from public.tenants order by created_at limit 1;
  if v_tenant_id is null then
    return new;
  end if;

  insert into public.profiles (id, tenant_id, full_name, role, active)
  values (
    new.id,
    v_tenant_id,
    coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
    'comercial',
    false  -- inativo até o Administrador liberar
  );
  return new;
end $$;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ------------------------------------------------------------------
-- 2. Listagem para o Administrador (perfil + e-mail)
-- ------------------------------------------------------------------
-- O e-mail vive em auth.users, fora do alcance da API pública. A função é
-- SECURITY DEFINER para poder lê-lo, e barra quem não é Administrador.
create or replace function public.list_users_for_admin()
returns table (
  id uuid,
  full_name text,
  role text,
  active boolean,
  email text,
  last_sign_in_at timestamptz,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp, auth as $$
begin
  if not public.has_role('admin') then
    raise exception 'Apenas o Administrador vê a lista de usuários';
  end if;

  return query
    select p.id, p.full_name, p.role::text, p.active,
           u.email::text, u.last_sign_in_at, p.created_at
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.tenant_id = public.current_tenant_id()
     order by p.active desc, p.full_name;
end $$;

-- ------------------------------------------------------------------
-- 3. Definir nome, perfil e situação
-- ------------------------------------------------------------------
create or replace function public.save_user_profile(
  p_id uuid,
  p_full_name text,
  p_role text,
  p_active boolean
)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_admins_restantes integer;
begin
  if not public.has_role('admin') then
    raise exception 'Apenas o Administrador altera usuários';
  end if;
  if p_role not in ('admin', 'financeiro', 'comercial', 'producao') then
    raise exception 'Perfil inválido';
  end if;
  if nullif(btrim(p_full_name), '') is null then
    raise exception 'Informe o nome do usuário';
  end if;
  if not exists (select 1 from public.profiles where id = p_id and tenant_id = v_tenant_id) then
    raise exception 'Usuário não encontrado';
  end if;

  -- Trava contra ficar sem Administrador: sem isto, o último admin pode se
  -- rebaixar ou se desativar por engano e ninguém mais consegue liberar acesso
  -- — o sistema ficaria trancado sem conserto pela interface.
  select count(*) into v_admins_restantes
    from public.profiles
   where tenant_id = v_tenant_id and active and role = 'admin' and id <> p_id;

  if v_admins_restantes = 0 and (p_role <> 'admin' or not p_active) then
    raise exception 'Este é o único Administrador ativo. Promova outra pessoa antes de alterar este acesso.';
  end if;

  update public.profiles
     set full_name = btrim(p_full_name),
         role = p_role::user_role,
         active = p_active
   where id = p_id and tenant_id = v_tenant_id;

  insert into public.audit_logs (tenant_id, entity, entity_id, action, old_value, new_value, user_id)
  values (v_tenant_id, 'profiles', p_id, 'update_access', null,
          jsonb_build_object('role', p_role, 'active', p_active), auth.uid());
end $$;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.list_users_for_admin() from public, anon;
revoke execute on function public.save_user_profile(uuid, text, text, boolean) from public, anon;
grant execute on function public.list_users_for_admin() to authenticated;
grant execute on function public.save_user_profile(uuid, text, text, boolean) to authenticated;
