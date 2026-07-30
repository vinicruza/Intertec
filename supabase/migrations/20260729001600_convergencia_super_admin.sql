-- CONVERGÊNCIA — duas implementações do Super Administrador no mesmo banco.
--
-- O QUE ACONTECEU
--
-- Enquanto esta sprint era feita, outra sessão de trabalho implementou o mesmo
-- pedido no MESMO projeto do Supabase, com o mesmo desenho (uma marca sobre o
-- perfil de admin, não um perfil novo) e nomes diferentes:
--
--   esta implementação          a outra
--   -------------------------   ---------------------------
--   profiles.is_super_admin     profiles.is_superadmin
--   current_user_is_super_admin()  is_superadmin()
--
-- O banco ficou com as DUAS colunas e as duas funções, e com save_user_profile
-- na versão da outra sessão (a última a ser aplicada ganhou).
--
-- POR QUE ISSO É PERIGOSO
--
-- Duas marcas para a mesma coisa é um convite ao desastre silencioso: bastaria
-- uma tela gravar numa coluna e a política de segurança ler a outra para o
-- Super Administrador aparecer na lista de usuários da Intertech, ou ficar
-- editável por outro Administrador. Um sistema não pode ter duas versões da
-- resposta para "quem é o dono aqui".
--
-- O QUE ESTA MIGRAÇÃO FAZ
--
-- 1. Elege uma única fonte da verdade: profiles.is_super_admin. Antes de tudo,
--    qualquer marca que só existia na outra coluna é copiada para ela — nada é
--    perdido.
--
-- 2. Mantém o nome antigo funcionando, mas como ESPELHO: is_superadmin passa a
--    ser uma coluna gerada, sempre igual a is_super_admin, e a função
--    is_superadmin() passa a apenas repassar a pergunta. Assim, qualquer código
--    das duas implementações lê o valor certo, e divergir se torna impossível
--    (coluna gerada não aceita escrita).
--
-- 3. Restaura save_user_profile na versão desta sprint, que é mais restritiva:
--    além de proteger o Super Administrador, ela impede remover o próprio
--    acesso, não conta o Super Administrador como "Administrador de plantão"
--    da Intertech e registra o valor anterior completo na auditoria.
--
-- Os espelhos do item 2 são uma ponte, não um destino: quando você escolher
-- qual das duas implementações vai para produção, o nome perdedor pode ser
-- apagado numa migração de uma linha.

-- ------------------------------------------------------------------
-- 1. Nada se perde: a marca da outra coluna vem para a definitiva
-- ------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'is_superadmin' and is_generated = 'NEVER'
  ) then
    execute 'update public.profiles set is_super_admin = true
              where is_superadmin and not is_super_admin';
    execute 'drop index if exists public.profiles_superadmin_idx';
    execute 'alter table public.profiles drop column is_superadmin';
  end if;
end $$;

-- ------------------------------------------------------------------
-- 2. O nome antigo continua respondendo, agora como espelho
-- ------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_superadmin boolean
  generated always as (is_super_admin) stored;

comment on column public.profiles.is_superadmin is
  'Espelho de is_super_admin (coluna gerada, não aceita escrita). Existe só para o código da implementação paralela continuar lendo o valor certo.';

create index if not exists profiles_superadmin_idx
  on public.profiles (tenant_id) where is_super_admin;

create or replace function public.is_superadmin()
returns boolean
language sql stable security invoker set search_path = public, pg_temp as $$
  select public.current_user_is_super_admin();
$$;

comment on function public.is_superadmin() is
  'Apelido de current_user_is_super_admin(), mantido para a implementação paralela.';

revoke execute on function public.is_superadmin() from public, anon;
grant execute on function public.is_superadmin() to authenticated;

-- ------------------------------------------------------------------
-- 3. A lista devolve as duas grafias, pelo mesmo motivo
-- ------------------------------------------------------------------
drop function if exists public.list_users_for_admin();

create function public.list_users_for_admin()
returns table (
  id uuid,
  full_name text,
  role text,
  active boolean,
  is_super_admin boolean,
  is_superadmin boolean,   -- mesma informação, grafia da outra implementação
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
    select p.id, p.full_name, p.role::text, p.active, p.is_super_admin, p.is_super_admin,
           u.email::text, u.last_sign_in_at, p.created_at
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.tenant_id = public.current_tenant_id()
       -- O dono do sistema só é visível para outro dono do sistema.
       and (not p.is_super_admin or public.current_user_is_super_admin())
     order by p.active desc, p.full_name;
end $$;

revoke execute on function public.list_users_for_admin() from public, anon;
grant execute on function public.list_users_for_admin() to authenticated;

-- ------------------------------------------------------------------
-- 4. Gravação de perfil de volta à versão restritiva
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
  v_anterior jsonb;
  v_alvo_super boolean;
begin
  perform public.assert_can_manage_user(p_id, 'editar');

  if p_role not in ('admin', 'financeiro', 'comercial', 'producao') then
    raise exception 'Perfil inválido';
  end if;
  if nullif(btrim(p_full_name), '') is null then
    raise exception 'Informe o nome do usuário';
  end if;

  select jsonb_build_object('full_name', full_name, 'role', role::text, 'active', active),
         is_super_admin
    into v_anterior, v_alvo_super
    from public.profiles where id = p_id;

  -- Um Super Administrador continua Administrador: rebaixá-lo pela tela
  -- quebraria a restrição da tabela e o deixaria sem a própria ferramenta de
  -- conserto. Quem é dono do sistema muda de perfil só na instalação.
  if v_alvo_super and (p_role <> 'admin' or not p_active) then
    raise exception 'O acesso de Super Administrador não pode ser rebaixado nem desativado pela tela';
  end if;

  -- Trava contra a Intertech ficar sem Administrador. O Super Administrador não
  -- entra na conta: ele é a saída de emergência, não o Administrador do dia a
  -- dia.
  select count(*) into v_admins_restantes
    from public.profiles
   where tenant_id = v_tenant_id
     and active and role = 'admin' and not is_super_admin and id <> p_id;

  if v_admins_restantes = 0
     and (v_anterior->>'role') = 'admin' and (v_anterior->>'active')::boolean
     and not v_alvo_super
     and (p_role <> 'admin' or not p_active) then
    raise exception 'Este é o único Administrador ativo. Promova outra pessoa antes de alterar este acesso.';
  end if;

  update public.profiles
     set full_name = btrim(p_full_name),
         role = p_role::user_role,
         active = p_active
   where id = p_id and tenant_id = v_tenant_id;

  insert into public.audit_logs (tenant_id, entity, entity_id, action, old_value, new_value, user_id)
  values (v_tenant_id, 'profiles', p_id, 'update_access', v_anterior,
          jsonb_build_object('full_name', btrim(p_full_name), 'role', p_role, 'active', p_active),
          auth.uid());
end $$;

revoke execute on function public.save_user_profile(uuid, text, text, boolean) from public, anon;
grant execute on function public.save_user_profile(uuid, text, text, boolean) to authenticated;

-- ------------------------------------------------------------------
-- 5. Rede de segurança
-- ------------------------------------------------------------------
do $$
declare v_problema text;
begin
  -- A marca definitiva e o espelho não podem divergir em nenhuma linha.
  if exists (select 1 from public.profiles where is_super_admin <> is_superadmin) then
    raise exception 'is_super_admin e is_superadmin divergem — o espelho não está funcionando';
  end if;

  -- save_user_profile precisa passar pela guarda única.
  select p.proname into v_problema
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'save_user_profile'
     and p.prosrc not like '%assert_can_manage_user%';

  if v_problema is not null then
    raise exception 'save_user_profile não está chamando assert_can_manage_user';
  end if;
end $$;
