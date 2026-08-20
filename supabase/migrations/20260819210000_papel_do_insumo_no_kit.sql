-- Papel de cada insumo na embalagem do kit.
--
-- O cliente descreveu o modelo em 19/08/2026, e ele é mais estreito do que o
-- formulário livre que existia: a vendedora informa DUAS coisas — qual envelope
-- e quantos envelopes cabem na caixa. O resto é consequência.
--
--   envelope       1 por kit
--   caixa          1/N por kit, onde N = envelopes por caixa
--   esterilização  1/N por kit — o MESMO N, porque a esterilizadora cobra
--                  por caixa e é a mesma caixa que vai ao cliente
--   etiquetinha    1 por kit, automática
--   gráfica        1 por kit, automática (acompanha o envelope)
--
-- Confirmado nos 10 kits estéreis do catálogo: envelope sempre 1, e caixa e
-- esterilização sempre com a mesma fração (1/10, 1/12, 1/16, 1/20, 1/25, 1/30,
-- 1/35, 1/50). Nenhum diverge.
--
-- Por que uma coluna e não casar pelo nome: o formulário passa a ter três
-- listas separadas (envelope, caixa, esterilização) e duas linhas automáticas.
-- Decidir isso por prefixo de nome quebraria no dia em que alguém renomear
-- "Caixa 6" para "Caixa 06" — e quebraria calado, no custo de um orçamento.

alter table public.inputs
  add column if not exists kit_role text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inputs_kit_role_check'
  ) then
    alter table public.inputs
      add constraint inputs_kit_role_check
      check (kit_role is null or kit_role in ('envelope','caixa','esterilizacao','automatico'));
  end if;
end $$;

update public.inputs set kit_role = 'envelope'      where name like 'Envelope%'      and kit_role is distinct from 'envelope';
update public.inputs set kit_role = 'caixa'         where name like 'Caixa%'         and kit_role is distinct from 'caixa';
update public.inputs set kit_role = 'esterilizacao' where name like 'Esteriliza%'    and kit_role is distinct from 'esterilizacao';
update public.inputs set kit_role = 'automatico'    where name in ('Etiquetinha','Gráfica') and kit_role is distinct from 'automatico';

-- A lista do seletor passa a dizer o papel de cada insumo. Continua SEM preço:
-- o custo é calculado no servidor (migração 20260819180000).
--
-- Precisa de DROP: mudou o tipo de retorno (ganhou a coluna `papel`), e o
-- Postgres não deixa trocar isso com CREATE OR REPLACE.
drop function if exists public.insumos_para_embalagem();

create function public.insumos_para_embalagem()
returns table (id uuid, nome text, embalagem boolean, mao_de_obra boolean, papel text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select i.id, i.name, coalesce(i.is_packaging, false), coalesce(i.is_labor, false), i.kit_role
    from public.inputs i
   where i.tenant_id = public.current_tenant_id()
     and i.status = 'active'
     and public.current_user_role() is not null
   order by i.name;
$function$;

revoke execute on function public.insumos_para_embalagem() from public, anon;
grant execute on function public.insumos_para_embalagem() to authenticated;
