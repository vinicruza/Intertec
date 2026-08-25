-- ============================================================
-- Remove `difal_rates.charges_difal`, substituída por `difal_destacado`
-- ============================================================
--
-- APLICAR SOMENTE DEPOIS de a versão de 25/08/2026 estar publicada. Enquanto o
-- front antigo estiver no ar, ele lê esta coluna pelo nome e quebra sem ela —
-- é por isso que a migração anterior adicionou a nova em vez de renomear.
--
-- Conferir antes de rodar:
--   select uf, charges_difal, difal_destacado from public.difal_rates
--    where charges_difal is distinct from difal_destacado;
-- Se vier alguma linha, alguém mexeu na tela antiga depois da migração: o
-- valor certo é o de `difal_destacado`, e a diferença precisa ser conferida
-- com o financeiro antes de apagar a coluna.

alter table public.difal_rates
  drop column if exists charges_difal;
