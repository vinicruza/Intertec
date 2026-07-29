-- CORREÇÃO DE SEGURANÇA — a guarda de perfil não barrava perfil nulo.
--
-- O DEFEITO
--
-- As funções checavam permissão assim:
--
--     if public.current_user_role() <> 'admin' then raise exception ...
--
-- Em SQL, comparar NULL com qualquer coisa devolve NULL, não verdadeiro. E
-- NULL não satisfaz um "if" — então a guarda simplesmente NÃO DISPARAVA quando
-- current_user_role() era nulo, e a execução seguia como se houvesse permissão.
--
-- QUEM TEM PERFIL NULO
--
-- Exatamente quem ainda não foi liberado: current_user_role() filtra por
-- `active`, então todo usuário recém-cadastrado e pendente devolve nulo.
--
-- O IMPACTO
--
-- Nas funções SECURITY INVOKER o estrago era contido, porque as políticas de
-- RLS também dependem de current_tenant_id() e barravam o acesso às tabelas.
-- Mas três funções são SECURITY DEFINER e ignoram RLS por natureza:
--
--   * list_users_for_admin       — expunha o e-mail de todos os usuários
--   * save_user_profile          — deixava um usuário pendente virar admin
--   * recalculate_product_costs  — permitia disparar o recálculo do catálogo
--
-- Ou seja: bastava criar uma conta e, sem qualquer liberação, escalar para
-- Administrador. Confirmado no banco antes da correção.
--
-- A CORREÇÃO
--
-- Uma função única que trata o nulo de forma explícita, usada por todas as
-- guardas. Perfil nulo nunca satisfaz nenhum papel.
--
-- As migrações de origem já foram corrigidas, então um banco criado do zero
-- nasce correto. Esta migração conserta os bancos que já existem, reescrevendo
-- as guardas das funções já instaladas.

create or replace function public.has_role(variadic p_roles text[])
returns boolean
language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(public.current_user_role()::text, '') = any(p_roles);
$$;

revoke execute on function public.has_role(variadic text[]) from public, anon;
grant execute on function public.has_role(variadic text[]) to authenticated;

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
       and (p.prosrc ~ '(public\.)?current_user_role\(\)\s*<>\s*''admin'''
         or p.prosrc ~ '(public\.)?current_user_role\(\)\s*not in\s*\(''admin''\s*,\s*''financeiro''\)'
         or p.prosrc ~ 'not \(v_role = any\(v_cfg\.approver_roles\)\)')
  loop
    v_def := pg_get_functiondef(r.oid);

    v_novo := regexp_replace(v_def,
      '(public\.)?current_user_role\(\)\s*<>\s*''admin''',
      'not public.has_role(''admin'')', 'g');
    v_novo := regexp_replace(v_novo,
      '(public\.)?current_user_role\(\)\s*not in\s*\(''admin''\s*,\s*''financeiro''\)',
      'not public.has_role(''admin'',''financeiro'')', 'g');
    -- Aqui o papel já está numa variável; basta rejeitar o nulo antes.
    v_novo := regexp_replace(v_novo,
      'if not \(v_role = any\(v_cfg\.approver_roles\)\) then',
      'if v_role is null or not (v_role = any(v_cfg.approver_roles)) then', 'g');

    if v_novo <> v_def then
      execute v_novo;
      v_corrigidas := v_corrigidas + 1;
      raise notice 'guarda corrigida: %', r.proname;
    end if;
  end loop;

  raise notice 'total de funções corrigidas: %', v_corrigidas;
end $$;

-- Rede de segurança: se alguma guarda vulnerável tiver escapado, a migração
-- falha em vez de deixar o banco num estado que parece corrigido.
do $$
declare v_restantes text;
begin
  select string_agg(p.proname, ', ')
    into v_restantes
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.prosrc ~ '(public\.)?current_user_role\(\)\s*<>\s*''admin'''
       or p.prosrc ~ '(public\.)?current_user_role\(\)\s*not in\s*\(''admin''\s*,\s*''financeiro''\)'
       or p.prosrc ~ 'if not \(v_role = any\(v_cfg\.approver_roles\)\) then');

  if v_restantes is not null then
    raise exception 'Ainda há guardas vulneráveis a perfil nulo: %', v_restantes;
  end if;
end $$;
