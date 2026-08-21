-- ============================================================
-- Vendedor externo JOÃO — cadastro sem acesso ao sistema
-- Pedido da Intertech em 21/08/2026.
-- ============================================================
--
-- O João não usa o sistema: quem lança o pedido em nome dele é o
-- administrativo. Então ele precisa existir só como VENDEDOR, e não como
-- usuário — sem login, sem perfil, sem senha para guardar.
--
-- É como Edmilson e Priscilene já estão hoje: linha em `sellers`, nada em
-- `profiles`. O `meu_vendedor()` casa acesso com vendedor por igualdade de
-- nome; sem perfil não há o que casar, e é justamente o que se quer.
--
-- Canal: Externos, que é onde ficam as vendas externas — comissão padrão de
-- 6,1%. O tipo de venda continua trocável pedido a pedido no simulador.
insert into public.sellers (tenant_id, name, channel_id, active)
select c.tenant_id, 'João', c.id, true
  from public.channels c
 where c.name = 'Externos'
   and not exists (
     select 1 from public.sellers s
      where s.tenant_id = c.tenant_id and lower(btrim(s.name)) = 'joão');
