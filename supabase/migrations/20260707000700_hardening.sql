-- ============================================================
-- 0007 — Endurecimento de segurança
-- Correções dos avisos do Supabase Advisor (lints 0011, 0028, 0029):
-- 1) search_path fixado em todas as funções;
-- 2) funções internas (triggers) não podem ser chamadas via API REST;
-- 3) funções auxiliares de RLS bloqueadas para visitantes não logados.
-- ============================================================

-- 1) search_path fixado (evita sequestro de resolução de nomes)
alter function public.set_updated_at() set search_path = public;
alter function public.check_component_cycle() set search_path = public;
alter function public.validate_order_close() set search_path = public;
alter function public.protect_closed_order_items() set search_path = public;

-- 2) Funções de trigger: ninguém chama diretamente via API
--    (triggers disparam mesmo sem permissão EXECUTE do usuário)
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.check_component_cycle() from public, anon, authenticated;
revoke execute on function public.validate_order_close() from public, anon, authenticated;
revoke execute on function public.protect_closed_order_items() from public, anon, authenticated;
revoke execute on function public.log_input_price_change() from public, anon, authenticated;
revoke execute on function public.log_factor_change() from public, anon, authenticated;
revoke execute on function public.protect_closed_order() from public, anon, authenticated;

-- 3) Auxiliares de RLS: usuários logados precisam (as policies as executam);
--    visitantes anônimos, não
revoke execute on function public.current_user_role() from public, anon;
revoke execute on function public.current_tenant_id() from public, anon;
