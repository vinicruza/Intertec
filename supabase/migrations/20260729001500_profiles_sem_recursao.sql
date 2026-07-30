-- CORREÇÃO DE DEFEITO — a política da tabela de perfis entrava em loop infinito.
--
-- O SINTOMA
--
-- Um usuário que NÃO fosse Administrador não conseguia ler nada. Qualquer
-- consulta simples — contar produtos, listar motivos de perda — derrubava a
-- operação com "stack depth limit exceeded". Na prática: Financeiro, Comercial
-- e Produção veriam a tela quebrar. Só não apareceu antes porque, até agora, a
-- única conta que chegou a entrar no sistema foi a de Administrador.
--
-- A CAUSA
--
-- Um ciclo entre política e função:
--
--   1. a política de QUALQUER tabela pergunta "de que tenant você é?", e para
--      isso chama current_tenant_id();
--   2. current_tenant_id() é SECURITY INVOKER (mudou na migração
--      20260715000800), então ela LÊ a tabela profiles obedecendo ao RLS;
--   3. ler profiles aciona a política de profiles;
--   4. a política de profiles chamava current_tenant_id() e current_user_role()
--      para reconhecer o Administrador — voltando ao passo 2.
--
-- Sem um degrau que interrompa, o banco desce até estourar a pilha.
--
-- A CORREÇÃO
--
-- A regra que faltava é simples de enunciar: a política DA tabela profiles não
-- pode chamar nenhuma função que leia profiles com RLS. Só pode usar funções
-- SECURITY DEFINER, que leem por dentro sem reacionar a política — é aí que o
-- ciclo se fecha.
--
-- current_tenant_id() e current_user_role() continuam SECURITY INVOKER como
-- estão hoje, e continuam sendo usadas por todas as outras tabelas: quebrado o
-- degrau em profiles, a cadeia inteira passa a terminar.
--
-- admin_tenant_id() devolve o tenant de quem é Administrador ativo e NULO para
-- todos os outros; comparar tenant_id com nulo dá falso, então quem não é
-- Administrador simplesmente não passa pela segunda metade da política.

create or replace function public.admin_tenant_id()
returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select p.tenant_id
    from public.profiles p
   where p.id = auth.uid() and p.active and p.role = 'admin';
$$;

revoke execute on function public.admin_tenant_id() from public, anon;
grant execute on function public.admin_tenant_id() to authenticated;

drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_admin_insert on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;
drop policy if exists profiles_admin_delete on public.profiles;

-- Cada um vê o próprio perfil; o Administrador vê os do seu tenant, menos o do
-- Super Administrador (que só outro Super Administrador enxerga).
create policy profiles_select on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or (
    tenant_id = (select public.admin_tenant_id())
    and (not is_super_admin or (select public.current_user_is_super_admin()))
  )
);

create policy profiles_admin_insert on public.profiles for insert to authenticated
with check (
  tenant_id = (select public.admin_tenant_id())
  and (not is_super_admin or (select public.current_user_is_super_admin()))
);

create policy profiles_admin_update on public.profiles for update to authenticated
using (
  tenant_id = (select public.admin_tenant_id())
  and (not is_super_admin or (select public.current_user_is_super_admin()))
)
with check (
  tenant_id = (select public.admin_tenant_id())
  and (not is_super_admin or (select public.current_user_is_super_admin()))
);

create policy profiles_admin_delete on public.profiles for delete to authenticated
using (
  tenant_id = (select public.admin_tenant_id())
  and (not is_super_admin or (select public.current_user_is_super_admin()))
);

-- Rede de segurança: se alguém voltar a colocar uma função SECURITY INVOKER
-- que lê profiles dentro da política de profiles, a migração falha aqui em vez
-- de o defeito reaparecer em produção, onde ele só aparece para quem não é
-- Administrador.
do $$
declare v_ciclo text;
begin
  select string_agg(policyname, ', ')
    into v_ciclo
    from pg_policies
   where schemaname = 'public' and tablename = 'profiles'
     and coalesce(qual, '') || coalesce(with_check, '') ~ 'current_tenant_id|current_user_role|has_role';

  if v_ciclo is not null then
    raise exception 'Política de profiles voltou a chamar função com RLS (ciclo infinito): %', v_ciclo;
  end if;
end $$;
