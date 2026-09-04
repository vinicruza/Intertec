-- REGISTRO DE MIGRAÇÃO APLICADA DIRETO NO BANCO (04/09/2026, 17h04).
-- Transcrita de `supabase_migrations.schema_migrations`, sem alteração.
--
-- O índice único da assinatura do kit passa a valer só entre kits ATIVOS.
--
-- Consequência, e ela é grande: kit inativo deixa de reservar a composição.
-- Montar os mesmos itens com o kit fora cria um kit NOVO, com código novo — o
-- oposto do que valia desde 07/2026. É o que a migração 20260904213000 tem de
-- levar em conta ao reativar um kit.

alter table public.kits
  drop constraint if exists kits_tenant_id_signature_key;

drop index if exists public.kits_tenant_id_signature_key;

create unique index if not exists kits_active_signature_unique
  on public.kits (tenant_id, signature)
  where status = 'active';
