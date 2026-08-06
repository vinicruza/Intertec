-- Comercial ve apenas os proprios pedidos (06/08/2026)
--
-- Regra:
--   - Admin e Financeiro mantem visao geral dos pedidos.
--   - Comercial so le pedidos do vendedor resolvido por public.meu_vendedor().
--   - Itens e versoes seguem a mesma regra do pedido pai.

drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select to authenticated
using (
  tenant_id = public.current_tenant_id()
  and (
    public.current_user_role() in ('admin', 'financeiro')
    or (
      public.current_user_role() = 'comercial'
      and seller_id = public.meu_vendedor()
    )
  )
);

drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items for select to authenticated
using (
  tenant_id = public.current_tenant_id()
  and (
    public.current_user_role() in ('admin', 'financeiro')
    or (
      public.current_user_role() = 'comercial'
      and exists (
        select 1
          from public.orders o
         where o.id = order_items.order_id
           and o.tenant_id = order_items.tenant_id
           and o.seller_id = public.meu_vendedor()
      )
    )
  )
);

drop policy if exists order_versions_select on public.order_versions;
create policy order_versions_select on public.order_versions for select to authenticated
using (
  tenant_id = public.current_tenant_id()
  and (
    public.current_user_role() in ('admin', 'financeiro')
    or (
      public.current_user_role() = 'comercial'
      and exists (
        select 1
          from public.orders o
         where o.id = order_versions.order_id
           and o.tenant_id = order_versions.tenant_id
           and o.seller_id = public.meu_vendedor()
      )
    )
  )
);
