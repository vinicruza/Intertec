-- ============================================================
-- "Cartão de Crédito" nas condições de pagamento
-- Pedido da Intertech em 21/08/2026.
-- ============================================================
--
-- Entra depois de "A vista" e antes dos prazos: é pagamento imediato para a
-- Intertec. Não muda cálculo nenhum — `payment_terms` é só o rótulo que a
-- ficha imprime e o financeiro lê para cobrar.
insert into public.payment_terms (tenant_id, label, sort_order, active)
select t.id, 'Cartão de Crédito', 15, true
  from public.tenants t
 where not exists (
   select 1 from public.payment_terms pt
    where pt.tenant_id = t.id and lower(btrim(pt.label)) = 'cartão de crédito');
