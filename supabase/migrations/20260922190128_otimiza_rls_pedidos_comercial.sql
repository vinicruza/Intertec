-- Intertech, 22/09/2026:
-- A lista de pedidos da Mari carregava devagar porque as policies recalculavam
-- tenant/perfil/vendedor para cada linha de pedidos e itens. As regras abaixo
-- preservam a mesma visibilidade, mas deixam o Postgres calcular o contexto do
-- usuário uma vez por consulta.

create index if not exists orders_tenant_seller_created_idx
  on public.orders (tenant_id, seller_id, created_at desc);

create index if not exists order_items_tenant_order_idx
  on public.order_items (tenant_id, order_id);

drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select to authenticated
using (
  tenant_id = (select public.current_tenant_id())
  and (
    (select public.current_user_role()) in ('admin', 'financeiro')
    or (
      (select public.current_user_role()) = 'comercial'
      and seller_id = (select public.meu_vendedor())
    )
  )
);

drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items for select to authenticated
using (
  tenant_id = (select public.current_tenant_id())
  and (
    (select public.current_user_role()) in ('admin', 'financeiro')
    or (
      (select public.current_user_role()) = 'comercial'
      and exists (
        select 1
          from public.orders o
         where o.id = order_items.order_id
           and o.tenant_id = order_items.tenant_id
           and o.seller_id = (select public.meu_vendedor())
      )
    )
  )
);

drop policy if exists order_versions_select on public.order_versions;
create policy order_versions_select on public.order_versions for select to authenticated
using (
  tenant_id = (select public.current_tenant_id())
  and (
    (select public.current_user_role()) in ('admin', 'financeiro')
    or (
      (select public.current_user_role()) = 'comercial'
      and exists (
        select 1
          from public.orders o
         where o.id = order_versions.order_id
           and o.tenant_id = order_versions.tenant_id
           and o.seller_id = (select public.meu_vendedor())
      )
    )
  )
);

drop policy if exists order_items_write_simulation_operacional on public.order_items;

create policy order_items_select_simulation_operacional on public.order_items for select to authenticated
using (
  tenant_id = (select public.current_tenant_id())
  and (select public.current_user_role()) in ('admin', 'financeiro', 'comercial')
  and exists (
    select 1
      from public.orders o
     where o.id = order_items.order_id
       and o.tenant_id = order_items.tenant_id
       and o.status = 'simulation'
  )
);

create policy order_items_insert_simulation_operacional on public.order_items for insert to authenticated
with check (
  tenant_id = (select public.current_tenant_id())
  and (select public.current_user_role()) in ('admin', 'financeiro', 'comercial')
  and exists (
    select 1
      from public.orders o
     where o.id = order_items.order_id
       and o.tenant_id = order_items.tenant_id
       and o.status = 'simulation'
  )
);

create policy order_items_update_simulation_operacional on public.order_items for update to authenticated
using (
  tenant_id = (select public.current_tenant_id())
  and (select public.current_user_role()) in ('admin', 'financeiro', 'comercial')
  and exists (
    select 1
      from public.orders o
     where o.id = order_items.order_id
       and o.tenant_id = order_items.tenant_id
       and o.status = 'simulation'
  )
)
with check (
  tenant_id = (select public.current_tenant_id())
  and (select public.current_user_role()) in ('admin', 'financeiro', 'comercial')
  and exists (
    select 1
      from public.orders o
     where o.id = order_items.order_id
       and o.tenant_id = order_items.tenant_id
       and o.status = 'simulation'
  )
);

create policy order_items_delete_simulation_operacional on public.order_items for delete to authenticated
using (
  tenant_id = (select public.current_tenant_id())
  and (select public.current_user_role()) in ('admin', 'financeiro', 'comercial')
  and exists (
    select 1
      from public.orders o
     where o.id = order_items.order_id
       and o.tenant_id = order_items.tenant_id
       and o.status = 'simulation'
  )
);
