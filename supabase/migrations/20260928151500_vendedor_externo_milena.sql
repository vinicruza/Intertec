-- ============================================================
-- Vendedora externa MILENA — cadastro sem acesso ao sistema
-- Pedido da Intertech em 28/09/2026.
-- ============================================================
--
-- A Milena entra como vendedora externa: quem lanca o pedido em nome dela e o
-- administrativo. Portanto, cria apenas a linha em `sellers`, sem usuario,
-- perfil ou senha.
--
-- Canal: Externos, mantendo a comissao padrao do canal e permitindo que Admin
-- ajuste manualmente a comissao quando necessario.
insert into public.sellers (tenant_id, name, channel_id, active)
select c.tenant_id, 'Milena', c.id, true
  from public.channels c
 where c.name = 'Externos'
   and not exists (
     select 1 from public.sellers s
      where s.tenant_id = c.tenant_id and lower(btrim(s.name)) = 'milena');
