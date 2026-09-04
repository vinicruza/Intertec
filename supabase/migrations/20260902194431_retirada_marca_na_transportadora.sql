-- REGISTRO DE MIGRAÇÃO APLICADA DIRETO NO BANCO (02/09/2026, 19h44).
--
-- Esta migração já estava valendo em produção e não tinha arquivo aqui. O
-- conteúdo abaixo foi lido de `supabase_migrations.schema_migrations` e
-- transcrito sem alteração, para o repositório voltar a descrever o banco —
-- é a regra do projeto: "o schema evolui só por esses arquivos, nunca por
-- alteração manual no banco" (supabase/README.md).
--
-- O que ela faz: marca a transportadora que representa RETIRADA PELO CLIENTE.
-- Nesse caso não há transporte pago, então a cotação de frete obrigatória
-- (Calculations.md §15) não pode exigir um valor que não existe.
--
-- ATENÇÃO: o app ainda não usa este campo. Não há uma linha sobre "retirada"
-- em app/ ou lib/ — a funcionalidade existe só no banco.

alter table public.carriers
  add column if not exists is_pickup boolean not null default false;

comment on column public.carriers.is_pickup is
  'Retirada pelo cliente: não há transporte pago, então a opção escolhida dispensa o valor do frete.';

insert into public.carriers (tenant_id, name, requires_name, sort_order, active, is_pickup)
select t.id, 'RETIRADA', false, 5, true, true
from public.tenants t
on conflict (tenant_id, name) do nothing;

update public.carriers
   set is_pickup = true,
       active = true
 where upper(btrim(name)) in ('RETIRADA', 'RETIRA', 'CLIENTE RETIRA', 'RETIRADA NO LOCAL');
