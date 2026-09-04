-- REGISTRO DE MIGRAÇÃO APLICADA DIRETO NO BANCO (02/09/2026, 19h45).
-- Transcrita de `supabase_migrations.schema_migrations`, sem alteração —
-- EXCETO pelo valor padrão de `p_is_pickup`, explicado abaixo.
--
-- `save_carrier` ganhou um quinto argumento para marcar a transportadora de
-- retirada no cadastro.
--
-- ---- O DEFEITO QUE ISSO CAUSOU, E A CORREÇÃO ----
--
-- A versão aplicada em 02/09 DERRUBOU a função de 4 argumentos e criou a de 5
-- SEM valor padrão. O app (`app/lib/db/cadastros.ts`) chama a de 4, e o
-- PostgREST resolve a função pelos argumentos NOMEADOS: sem `p_is_pickup`,
-- nenhuma assinatura casa. Resultado: **salvar transportadora parou de
-- funcionar em produção em 02/09/2026**, e ninguém percebeu porque a tela de
-- Cadastros é pouco usada.
--
-- Aqui `p_is_pickup` recebe `default null`, com dois efeitos:
--
--   - a chamada de 4 argumentos volta a resolver, e a tela volta a salvar;
--   - `null` significa MANTER o valor atual na edição, em vez de desmarcar a
--     RETIRADA sem querer toda vez que alguém editar o nome dela.
--
-- Na inserção, `null` vira `false`, que é o padrão da coluna.

drop function if exists public.save_carrier(uuid, text, integer, boolean);
drop function if exists public.save_carrier(uuid, text, integer, boolean, boolean);

create or replace function public.save_carrier(
  p_id uuid,
  p_name text,
  p_sort_order integer,
  p_active boolean,
  p_is_pickup boolean default null
)
returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_tenant_id uuid := public.current_tenant_id(); v_id uuid := p_id;
begin
  if not public.has_role('admin') then
    raise exception 'Sem permissão para alterar as transportadoras';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Informe o nome da transportadora';
  end if;

  if v_id is null then
    insert into public.carriers (tenant_id, name, sort_order, active, is_pickup)
    values (v_tenant_id, btrim(p_name), coalesce(p_sort_order, 0), coalesce(p_active, true),
            coalesce(p_is_pickup, false))
    returning id into v_id;
  else
    update public.carriers
       set name = btrim(p_name),
           sort_order = coalesce(p_sort_order, 0),
           active = coalesce(p_active, true),
           -- null = não veio na chamada; mantém o que já estava marcado.
           is_pickup = coalesce(p_is_pickup, is_pickup)
     where id = v_id and tenant_id = v_tenant_id;
    if not found then raise exception 'Transportadora não encontrada'; end if;
  end if;
  return v_id;
end $$;

revoke execute on function public.save_carrier(uuid, text, integer, boolean, boolean) from public, anon;
grant execute on function public.save_carrier(uuid, text, integer, boolean, boolean) to authenticated;
