-- Duas coisas decididas pelo cliente em 30/07/2026:
--
--   1. Ficar só com esta implementação do Super Administrador. Os espelhos que
--      a migração 20260729001600 criou para a implementação paralela saem
--      agora: uma coisa, um nome.
--
--   2. Quem recebe senha provisória é OBRIGADO a trocá-la no primeiro acesso.
--      Antes, a senha que o Administrador entregou podia ficar valendo para
--      sempre — e ela passou por conversa, papel ou mensagem, então não é
--      segredo de ninguém.

-- ------------------------------------------------------------------
-- 1. Fim dos espelhos
-- ------------------------------------------------------------------
-- A função sai antes da coluna: ela lê a coluna.
drop function if exists public.is_superadmin();

alter table public.profiles drop column if exists is_superadmin;

-- O índice nasceu com o nome da outra grafia; agora acompanha a definitiva.
drop index if exists public.profiles_superadmin_idx;
create index if not exists profiles_super_admin_idx
  on public.profiles (tenant_id) where is_super_admin;

-- ------------------------------------------------------------------
-- 2. Senha provisória tem de ser trocada
-- ------------------------------------------------------------------
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is
  'Ligado quando o Administrador define uma senha provisória (cadastro ou redefinição). Enquanto estiver ligado, a pessoa entra e o sistema só mostra a tela de trocar a senha.';

-- Ligado pela Edge Function depois de criar o acesso ou redefinir a senha.
-- A guarda é a mesma de todas as operações de acesso: só Administrador, e
-- ninguém alcança o Super Administrador sem ser um.
create or replace function public.mark_password_provisional(p_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.assert_can_manage_user(p_id, 'senha');

  update public.profiles
     set must_change_password = true
   where id = p_id and tenant_id = public.current_tenant_id();
end $$;

revoke execute on function public.mark_password_provisional(uuid) from public, anon;
grant execute on function public.mark_password_provisional(uuid) to authenticated;

-- Desligado pela própria pessoa, logo depois de trocar a senha com sucesso.
-- Só mexe na própria linha: não há como desobrigar outra pessoa.
--
-- Uma honestidade sobre o alcance disto: é uma trava de bom uso, não uma
-- fechadura. Alguém que saiba mexer na API poderia desligar a marca sem trocar
-- a senha — e não ganharia nada com isso, porque o acesso que ele teria é o
-- dele mesmo, que já tem. O que a trava garante é que ninguém ESQUEÇA de
-- trocar, e é para isso que ela existe.
create or replace function public.clear_must_change_password()
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'Sessão não identificada';
  end if;

  update public.profiles
     set must_change_password = false
   where id = auth.uid();
end $$;

revoke execute on function public.clear_must_change_password() from public, anon;
grant execute on function public.clear_must_change_password() to authenticated;

-- ------------------------------------------------------------------
-- 3. A lista de usuários volta a ter uma grafia só, e mostra a pendência
-- ------------------------------------------------------------------
drop function if exists public.list_users_for_admin();

create function public.list_users_for_admin()
returns table (
  id uuid,
  full_name text,
  role text,
  active boolean,
  is_super_admin boolean,
  must_change_password boolean,
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
    select p.id, p.full_name, p.role::text, p.active, p.is_super_admin,
           p.must_change_password,
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
-- 4. Rede de segurança
-- ------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'is_superadmin'
  ) then
    raise exception 'A coluna espelho is_superadmin continua existindo';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'is_superadmin'
  ) then
    raise exception 'A função espelho is_superadmin() continua existindo';
  end if;
end $$;
