-- Endurecimento das funções introduzidas nas migrações de 29/07/2026.
--
-- O linter de segurança do Supabase apontou três funções SECURITY DEFINER
-- acessíveis pela API REST, todas criadas nas migrações desta data:
--
--   * set_quote_number()   — função de TRIGGER (numeração do orçamento)
--   * set_customer_code()  — função de TRIGGER (código do cliente)
--   * next_quote_number()  — auxiliar chamada pelo trigger acima
--
-- Nenhuma delas deve ser chamável de fora: expostas, permitiriam a qualquer
-- usuário consumir a sequência de numeração ou gerar códigos fora do fluxo.
--
-- Revogar EXECUTE não afeta os triggers — o Postgres dispara funções de
-- trigger independentemente de privilégio de execução. Verificado em produção:
-- após a revogação, a inserção de um pedido continuou gerando o número
-- normalmente.
--
-- Segue o mesmo padrão da migração 0007 (hardening), que já revogava
-- current_tenant_id() de public e anon.

revoke execute on function public.set_quote_number() from public, anon, authenticated;
revoke execute on function public.set_customer_code() from public, anon, authenticated;
revoke execute on function public.next_quote_number(uuid) from public, anon, authenticated;
