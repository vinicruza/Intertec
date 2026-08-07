-- A tela de Cotações e pedidos lê os totais financeiros de `orders`.
-- Cotações em aberto empilham a foto financeira em `order_versions`; esta
-- trigger copia a última foto para `orders`, para o histórico não aparecer
-- com "—" em Receita líquida e Margem contrib.

create or replace function public.sync_order_snapshot_from_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receita_bruta numeric;
  v_receita_liquida numeric;
  v_cmv_total numeric;
  v_margem numeric;
  v_totals jsonb;
begin
  v_receita_bruta := coalesce(
    nullif(new.snapshot #>> '{pedido,gross_revenue_snapshot}', '')::numeric,
    nullif(new.snapshot ->> 'receita_bruta', '')::numeric
  );

  v_cmv_total := coalesce(
    nullif(new.snapshot #>> '{pedido,cmv_total_snapshot}', '')::numeric,
    nullif(new.snapshot ->> 'cmv_total', '')::numeric
  );

  v_margem := coalesce(
    nullif(new.snapshot #>> '{pedido,contribution_margin_snapshot}', '')::numeric,
    nullif(new.snapshot ->> 'margem_contribuicao', '')::numeric
  );

  v_receita_liquida := coalesce(
    nullif(new.snapshot #>> '{pedido,net_revenue_snapshot}', '')::numeric,
    nullif(new.snapshot ->> 'receita_liquida', '')::numeric,
    v_margem + v_cmv_total
  );

  v_totals := coalesce(
    new.snapshot #> '{pedido,totals_display}',
    case
      when v_receita_liquida is null and v_margem is null then null
      else jsonb_strip_nulls(jsonb_build_object(
        'receita_liquida', case when v_receita_liquida is null then null else round(v_receita_liquida, 2)::text end,
        'margem_contribuicao', case when v_margem is null then null else round(v_margem, 2)::text end
      ))
    end
  );

  update public.orders
     set gross_revenue_snapshot = coalesce(v_receita_bruta, gross_revenue_snapshot),
         net_revenue_snapshot = coalesce(v_receita_liquida, net_revenue_snapshot),
         cmv_total_snapshot = coalesce(v_cmv_total, cmv_total_snapshot),
         contribution_margin_snapshot = coalesce(v_margem, contribution_margin_snapshot),
         totals_display = coalesce(v_totals, totals_display)
   where id = new.order_id
     and tenant_id = new.tenant_id;

  return new;
end $$;

drop trigger if exists trg_order_versions_sync_order_snapshot on public.order_versions;
create trigger trg_order_versions_sync_order_snapshot
after insert on public.order_versions
for each row execute function public.sync_order_snapshot_from_version();

revoke execute on function public.sync_order_snapshot_from_version() from public, anon, authenticated;

with ultimas as (
  select distinct on (ov.order_id)
         ov.order_id,
         ov.tenant_id,
         ov.snapshot
    from public.order_versions ov
   where ov.snapshot ? 'pedido'
      or ov.snapshot ? 'receita_liquida'
      or ov.snapshot ? 'margem_contribuicao'
      or ov.snapshot ? 'cmv_total'
   order by ov.order_id, ov.version desc
),
valores as (
  select order_id,
         tenant_id,
         coalesce(
           nullif(snapshot #>> '{pedido,gross_revenue_snapshot}', '')::numeric,
           nullif(snapshot ->> 'receita_bruta', '')::numeric
         ) as receita_bruta,
         coalesce(
           nullif(snapshot #>> '{pedido,cmv_total_snapshot}', '')::numeric,
           nullif(snapshot ->> 'cmv_total', '')::numeric
         ) as cmv_total,
         coalesce(
           nullif(snapshot #>> '{pedido,contribution_margin_snapshot}', '')::numeric,
           nullif(snapshot ->> 'margem_contribuicao', '')::numeric
         ) as margem,
         coalesce(
           nullif(snapshot #>> '{pedido,net_revenue_snapshot}', '')::numeric,
           nullif(snapshot ->> 'receita_liquida', '')::numeric,
           coalesce(
             nullif(snapshot #>> '{pedido,contribution_margin_snapshot}', '')::numeric,
             nullif(snapshot ->> 'margem_contribuicao', '')::numeric
           ) + coalesce(
             nullif(snapshot #>> '{pedido,cmv_total_snapshot}', '')::numeric,
             nullif(snapshot ->> 'cmv_total', '')::numeric
           )
         ) as receita_liquida,
         snapshot #> '{pedido,totals_display}' as totals
    from ultimas
)
update public.orders o
   set gross_revenue_snapshot = coalesce(v.receita_bruta, o.gross_revenue_snapshot),
       net_revenue_snapshot = coalesce(v.receita_liquida, o.net_revenue_snapshot),
       cmv_total_snapshot = coalesce(v.cmv_total, o.cmv_total_snapshot),
       contribution_margin_snapshot = coalesce(v.margem, o.contribution_margin_snapshot),
       totals_display = coalesce(
         v.totals,
         case
           when v.receita_liquida is null and v.margem is null then o.totals_display
           else coalesce(o.totals_display, '{}'::jsonb)
             || jsonb_strip_nulls(jsonb_build_object(
               'receita_liquida', case when v.receita_liquida is null then null else round(v.receita_liquida, 2)::text end,
               'margem_contribuicao', case when v.margem is null then null else round(v.margem, 2)::text end
             ))
         end
       )
  from valores v
 where o.id = v.order_id
   and o.tenant_id = v.tenant_id
   and (
     o.net_revenue_snapshot is null
     or o.contribution_margin_snapshot is null
     or o.totals_display is null
     or not (o.totals_display ? 'receita_liquida')
     or not (o.totals_display ? 'margem_contribuicao')
   );
