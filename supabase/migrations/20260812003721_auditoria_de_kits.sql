-- Auditoria de kits (Intertech, 12/08/2026).
--
-- A tela de Kits ja mostra codigo e composicao, mas a revisao operacional
-- precisa cruzar essa informacao com origem e uso em pedidos. Esta funcao
-- devolve um resumo por kit sem abrir tabelas sensiveis: tudo fica limitado ao
-- tenant ativo e ao usuario autenticado.

create or replace function public.get_kits_audit()
returns table (
  kit_id uuid,
  created_at timestamptz,
  created_by_name text,
  source_order_id uuid,
  source_order_quote_number text,
  source_order_number text,
  source_order_customer_name text,
  source_order_status text,
  used_in_orders_count bigint,
  generated_orders_count bigint,
  total_quantity numeric,
  last_used_at timestamptz,
  recent_orders jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with usos as (
    select
      oi.kit_id,
      oi.order_id,
      sum(oi.quantity) as quantidade,
      max(oi.created_at) as item_created_at
    from public.order_items oi
    where oi.tenant_id = public.current_tenant_id()
      and oi.kit_id is not null
    group by oi.kit_id, oi.order_id
  ),
  usos_com_pedido as (
    select
      u.*,
      o.quote_number,
      o.order_number,
      o.status::text as order_status,
      c.name as customer_name,
      coalesce(o.closed_at, o.updated_at, o.created_at, u.item_created_at) as used_at,
      row_number() over (
        partition by u.kit_id
        order by coalesce(o.closed_at, o.updated_at, o.created_at, u.item_created_at) desc, u.order_id
      ) as ordem
    from usos u
    join public.orders o on o.id = u.order_id
      and o.tenant_id = public.current_tenant_id()
    left join public.customers c on c.id = o.customer_id
      and c.tenant_id = o.tenant_id
  )
  select
    k.id as kit_id,
    k.created_at,
    p.full_name as created_by_name,
    k.source_order_id,
    so.quote_number as source_order_quote_number,
    so.order_number as source_order_number,
    sc.name as source_order_customer_name,
    so.status::text as source_order_status,
    count(distinct u.order_id) as used_in_orders_count,
    count(distinct u.order_id) filter (where u.order_status = 'closed') as generated_orders_count,
    coalesce(sum(u.quantidade), 0) as total_quantity,
    max(u.used_at) as last_used_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'order_id', u.order_id,
          'quote_number', u.quote_number,
          'order_number', u.order_number,
          'status', u.order_status,
          'customer_name', u.customer_name,
          'quantity', u.quantidade,
          'used_at', u.used_at
        )
        order by u.used_at desc, u.order_id
      ) filter (where u.ordem <= 5),
      '[]'::jsonb
    ) as recent_orders
  from public.kits k
  left join public.profiles p on p.id = k.created_by
  left join public.orders so on so.id = k.source_order_id
    and so.tenant_id = k.tenant_id
  left join public.customers sc on sc.id = so.customer_id
    and sc.tenant_id = so.tenant_id
  left join usos_com_pedido u on u.kit_id = k.id
  where k.tenant_id = public.current_tenant_id()
    and public.current_user_role() is not null
  group by
    k.id,
    k.created_at,
    p.full_name,
    k.source_order_id,
    so.quote_number,
    so.order_number,
    sc.name,
    so.status;
$$;

revoke execute on function public.get_kits_audit() from public, anon;
grant execute on function public.get_kits_audit() to authenticated;
