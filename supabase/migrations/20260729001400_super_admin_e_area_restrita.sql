-- Super Administrador e separação da área administrativa.
--
-- O QUE MUDA, EM LINGUAGEM SIMPLES
--
-- 1. Existe agora um "dono do sistema" (Super Administrador). Ele faz tudo o
--    que um Administrador faz, mas NÃO aparece na lista de usuários para os
--    Administradores da Intertech, e nenhum deles pode alterar, desativar ou
--    remover o acesso dele. É o acesso de quem construiu o sistema.
--
-- 2. Marcar alguém como Super Administrador não é algo que a tela faça: é uma
--    decisão de instalação, feita aqui. Assim ninguém "vira dono" por dentro
--    da aplicação, nem por engano nem de propósito.
--
-- 3. As telas sensíveis — Usuários, Configurações, Cadastros e Integridade dos
--    dados — passam a ser exclusivas do Administrador. O menu esconde o que o
--    perfil não pode ver, mas quem realmente barra é o banco: as listas de
--    referência (tipo de cliente, área de atuação, motivo de perda, categoria
--    de produto), que antes o Financeiro podia alterar, agora só o
--    Administrador altera. Ler continua liberado para todos os perfis ativos,
--    porque as telas de Clientes e Pedidos mostram esses nomes.
--
-- POR QUE UMA MARCA E NÃO UM PERFIL NOVO
--
-- Toda a segurança do banco está escrita em cima dos quatro perfis
-- (admin, financeiro, comercial, producao) — são dezenas de políticas de RLS
-- comparando o perfil com 'admin'. Criar um quinto perfil obrigaria a
-- reescrever todas elas, e uma única esquecida deixaria o Super Administrador
-- sem acesso a uma tabela (ou, pior, deixaria uma porta aberta). Então o Super
-- Administrador É um Administrador (role = 'admin') com uma marca a mais:
-- is_super_admin. Nada do que já funciona precisa mudar de lugar.

-- ------------------------------------------------------------------
-- 1. A marca de Super Administrador
-- ------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_super_admin boolean not null default false;

-- Só faz sentido em quem é Administrador e está ativo.
alter table public.profiles drop constraint if exists profiles_super_admin_is_admin;
alter table public.profiles add constraint profiles_super_admin_is_admin
  check (not is_super_admin or role = 'admin');

-- SECURITY DEFINER pelo mesmo motivo de current_user_role(): ler profiles de
-- dentro de uma política de profiles causaria recursão infinita.
create or replace function public.current_user_is_super_admin()
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select p.is_super_admin from public.profiles p where p.id = auth.uid() and p.active),
    false);
$$;

revoke execute on function public.current_user_is_super_admin() from public, anon;
grant execute on function public.current_user_is_super_admin() to authenticated;

-- ------------------------------------------------------------------
-- 2. O Super Administrador fica invisível para os Administradores
-- ------------------------------------------------------------------
-- Sem isto, um Administrador leria a tabela profiles pela API e enxergaria o
-- acesso do dono do sistema — inclusive para desativá-lo.
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_admin_all on public.profiles;
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_admin_insert on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;
drop policy if exists profiles_admin_delete on public.profiles;

-- Cada um sempre vê o próprio perfil (inclusive o Super Administrador o dele).
create policy profiles_select on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or (
    tenant_id = (select public.current_tenant_id())
    and (select public.current_user_role()) = 'admin'
    and (not is_super_admin or (select public.current_user_is_super_admin()))
  )
);

create policy profiles_admin_insert on public.profiles for insert to authenticated
with check (
  tenant_id = (select public.current_tenant_id())
  and (select public.current_user_role()) = 'admin'
  and (not is_super_admin or (select public.current_user_is_super_admin()))
);

create policy profiles_admin_update on public.profiles for update to authenticated
using (
  tenant_id = (select public.current_tenant_id())
  and (select public.current_user_role()) = 'admin'
  and (not is_super_admin or (select public.current_user_is_super_admin()))
)
with check (
  tenant_id = (select public.current_tenant_id())
  and (select public.current_user_role()) = 'admin'
  and (not is_super_admin or (select public.current_user_is_super_admin()))
);

create policy profiles_admin_delete on public.profiles for delete to authenticated
using (
  tenant_id = (select public.current_tenant_id())
  and (select public.current_user_role()) = 'admin'
  and (not is_super_admin or (select public.current_user_is_super_admin()))
);

-- ------------------------------------------------------------------
-- 3. Listagem de usuários: esconde o dono do sistema
-- ------------------------------------------------------------------
-- Ganha uma coluna, então precisa cair antes de ser recriada.
drop function if exists public.list_users_for_admin();

create or replace function public.list_users_for_admin()
returns table (
  id uuid,
  full_name text,
  role text,
  active boolean,
  is_super_admin boolean,
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
           u.email::text, u.last_sign_in_at, p.created_at
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.tenant_id = public.current_tenant_id()
       and (not p.is_super_admin or public.current_user_is_super_admin())
     order by p.active desc, p.full_name;
end $$;

revoke execute on function public.list_users_for_admin() from public, anon;
grant execute on function public.list_users_for_admin() to authenticated;

-- ------------------------------------------------------------------
-- 4. Quem pode mexer em quem
-- ------------------------------------------------------------------
-- Uma função só, usada tanto pela gravação de perfil quanto pela Edge Function
-- que cria credencial, redefine senha e remove acesso. Regra em um lugar só:
-- se mudar, muda para todos os caminhos.
--
-- Excluir alguém que já trabalhou no sistema apagaria a referência de quem
-- fechou um pedido, quem mudou um preço, quem lançou uma despesa. Num sistema
-- financeiro isso não pode acontecer — o caminho certo é desativar o acesso.
-- Esta função descobre sozinha, pelas chaves estrangeiras que apontam para
-- profiles, se a pessoa deixou algum rastro; assim continua correta quando
-- novas tabelas passarem a registrar autoria.
create or replace function public.user_has_history(p_id uuid)
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  r record;
  v_existe boolean;
begin
  for r in
    select c.conrelid::regclass::text as tabela, a.attname as coluna
      from pg_constraint c
      join unnest(c.conkey) k on true
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
     where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass
  loop
    execute format('select exists (select 1 from %s where %I = $1)', r.tabela, r.coluna)
      into v_existe using p_id;
    if v_existe then return true; end if;
  end loop;
  return false;
end $$;

revoke execute on function public.user_has_history(uuid) from public, anon, authenticated;

-- p_acao: 'criar' | 'editar' | 'senha' | 'remover'
create or replace function public.assert_can_manage_user(p_id uuid, p_acao text)
returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_alvo record;
  v_admins_restantes integer;
begin
  if not public.has_role('admin') then
    raise exception 'Apenas o Administrador gerencia usuários';
  end if;
  if p_acao not in ('criar', 'editar', 'senha', 'remover') then
    raise exception 'Ação inválida';
  end if;
  if p_acao = 'criar' then
    return;  -- criar não tem alvo
  end if;

  select id, role::text as role, active, is_super_admin
    into v_alvo
    from public.profiles
   where id = p_id and tenant_id = v_tenant_id;

  -- Alvo invisível responde igual a alvo inexistente: um Administrador da
  -- Intertech não descobre a existência do Super Administrador nem pela
  -- mensagem de erro.
  if v_alvo.id is null or (v_alvo.is_super_admin and not public.current_user_is_super_admin()) then
    raise exception 'Usuário não encontrado';
  end if;

  if p_acao = 'remover' and p_id = auth.uid() then
    raise exception 'Você não pode remover o seu próprio acesso';
  end if;

  -- Trava contra a Intertech ficar sem Administrador. O Super Administrador
  -- não entra na conta de propósito: ele é a saída de emergência, não o
  -- Administrador do dia a dia — se ele contasse, o último Administrador da
  -- Intertech poderia se remover e ninguém de lá conseguiria mais liberar
  -- acesso a ninguém.
  if p_acao = 'remover' and v_alvo.active and v_alvo.role = 'admin' then
    select count(*) into v_admins_restantes
      from public.profiles
     where tenant_id = v_tenant_id
       and active and role = 'admin' and not is_super_admin and id <> p_id;

    if v_admins_restantes = 0 then
      raise exception 'Este é o único Administrador ativo. Promova outra pessoa antes de remover este acesso.';
    end if;
  end if;

  if p_acao = 'remover' and public.user_has_history(p_id) then
    raise exception 'Esta pessoa já tem registros no sistema (pedidos, kits, alterações de preço). Desative o acesso em vez de excluir: o histórico precisa continuar mostrando quem fez cada coisa.';
  end if;
end $$;

revoke execute on function public.assert_can_manage_user(uuid, text) from public, anon;
grant execute on function public.assert_can_manage_user(uuid, text) to authenticated;

-- ------------------------------------------------------------------
-- 5. Gravação de perfil apoiada na regra única
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
begin
  perform public.assert_can_manage_user(p_id, 'editar');

  if p_role not in ('admin', 'financeiro', 'comercial', 'producao') then
    raise exception 'Perfil inválido';
  end if;
  if nullif(btrim(p_full_name), '') is null then
    raise exception 'Informe o nome do usuário';
  end if;

  select jsonb_build_object('full_name', full_name, 'role', role::text, 'active', active)
    into v_anterior
    from public.profiles where id = p_id;

  -- Um Super Administrador continua Administrador: rebaixá-lo pela tela
  -- quebraria a restrição da tabela e o deixaria sem a própria ferramenta de
  -- conserto. Quem é dono do sistema muda de perfil só na instalação.
  if (v_anterior->>'role') = 'admin'
     and exists (select 1 from public.profiles where id = p_id and is_super_admin)
     and (p_role <> 'admin' or not p_active) then
    raise exception 'O acesso de Super Administrador não pode ser rebaixado nem desativado pela tela';
  end if;

  -- Mesma trava do item 4, agora para rebaixamento/desativação.
  select count(*) into v_admins_restantes
    from public.profiles
   where tenant_id = v_tenant_id
     and active and role = 'admin' and not is_super_admin and id <> p_id;

  if v_admins_restantes = 0
     and (v_anterior->>'role') = 'admin' and (v_anterior->>'active')::boolean
     and not exists (select 1 from public.profiles where id = p_id and is_super_admin)
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

-- Registro de senha redefinida e acesso removido, chamado pela Edge Function
-- (ela já passou pela guarda acima). Auditoria é o único rastro que sobra de
-- uma remoção, porque a linha do perfil vai embora com o usuário.
create or replace function public.log_user_access_event(
  p_id uuid,
  p_action text,
  p_detail jsonb default null
)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tenant_id uuid := public.current_tenant_id();
begin
  if not public.has_role('admin') then
    raise exception 'Apenas o Administrador gerencia usuários';
  end if;
  if p_action not in ('create_access', 'reset_password', 'delete_access') then
    raise exception 'Evento inválido';
  end if;

  insert into public.audit_logs (tenant_id, entity, entity_id, action, old_value, new_value, user_id)
  values (v_tenant_id, 'profiles', p_id, p_action, null, p_detail, auth.uid());
end $$;

revoke execute on function public.log_user_access_event(uuid, text, jsonb) from public, anon;
grant execute on function public.log_user_access_event(uuid, text, jsonb) to authenticated;

-- ------------------------------------------------------------------
-- 6. Listas de referência: só o Administrador altera
-- ------------------------------------------------------------------
-- Cadastros virou tela de Administrador. O banco tem de dizer o mesmo, senão a
-- restrição é só visual e o Financeiro continua conseguindo gravar pela API.
do $$
declare t text;
begin
  foreach t in array array['customer_types', 'customer_specialties', 'loss_reasons', 'product_categories'] loop
    execute format('drop policy if exists %1$s_write on public.%1$I', t);
    execute format($f$create policy %1$s_write on public.%1$I for all to authenticated
      using (tenant_id = (select public.current_tenant_id())
             and (select public.current_user_role()) = 'admin')
      with check (tenant_id = (select public.current_tenant_id())
             and (select public.current_user_role()) = 'admin')$f$, t);
  end loop;
end $$;

-- As funções de gravação dessas listas checavam admin OU financeiro. Reescreve
-- a guarda sem repetir os corpos (o mesmo recurso usado na migração que
-- consertou a guarda de perfil nulo) — copiar 180 linhas de corpo aqui só
-- criaria duas versões para divergirem depois.
do $$
declare
  r record;
  v_def text;
  v_novo text;
  v_corrigidas integer := 0;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('save_customer_segment', 'delete_customer_segment',
                         'save_loss_reason', 'delete_loss_reason')
       and p.prosrc like '%has_role(''admin'',''financeiro'')%'
  loop
    v_def := pg_get_functiondef(r.oid);
    v_novo := replace(v_def, 'has_role(''admin'',''financeiro'')', 'has_role(''admin'')');
    if v_novo <> v_def then
      execute v_novo;
      v_corrigidas := v_corrigidas + 1;
      raise notice 'guarda restrita ao Administrador: %', r.proname;
    end if;
  end loop;
  raise notice 'total de funções restritas: %', v_corrigidas;
end $$;

-- Rede de segurança: se alguma guarda tiver escapado, a migração falha em vez
-- de deixar o banco parecendo restrito sem estar.
do $$
declare v_restantes text;
begin
  select string_agg(p.proname, ', ')
    into v_restantes
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('save_customer_segment', 'delete_customer_segment',
                       'save_loss_reason', 'delete_loss_reason')
     and p.prosrc like '%has_role(''admin'',''financeiro'')%';

  if v_restantes is not null then
    raise exception 'Estas funções ainda liberam escrita ao Financeiro: %', v_restantes;
  end if;
end $$;
