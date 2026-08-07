-- Algumas cotações antigas foram criadas antes do versionamento da tela e não
-- têm `order_versions`. Para elas, recompõe os totais pelo pedido atual quando
-- todos os itens são produtos com CMV vigente.

alter table public.orders disable trigger trg_orders_immutable;

with itens as (
  select o.id,
         o.tenant_id,
         sum(oi.quantity * oi.unit_price) as receita_bruta,
         sum(oi.quantity * pc.cmv) as cmv_total,
         count(*) as total_itens,
         count(pc.product_id) as itens_com_cmv,
         coalesce(o.freight, 0) as frete,
         coalesce(o.commission_rate, 0) as comissao,
         coalesce(ir.icms_rate, 0) + coalesce(ir.pis_cofins_rate, 0) as taxa_imposto,
         case when coalesce(o.applies_difal, true) then coalesce(dr.final_rate, 0) else 0 end as taxa_difal
    from public.orders o
    join public.order_items oi on oi.order_id = o.id and oi.tenant_id = o.tenant_id
    left join public.product_costs pc on pc.product_id = oi.product_id and pc.tenant_id = o.tenant_id
    left join public.icsm_rates ir on ir.tenant_id = o.tenant_id and ir.uf = o.uf
    left join public.difal_rates dr on dr.tenant_id = o.tenant_id and dr.uf = o.uf
   where (o.net_revenue_snapshot is null or o.contribution_margin_snapshot is null)
     and not exists (select 1 from public.order_versions ov where ov.order_id = o.id)
     and oi.product_id is not null
     and oi.kit_id is null
     and oi.ad_hoc_kit_composition is null
   group by o.id, o.tenant_id, o.freight, o.commission_rate, o.applies_difal,
            ir.icms_rate, ir.pis_cofins_rate, dr.final_rate
),
calculado as (
  select id,
         tenant_id,
         receita_bruta,
         cmv_total,
         (taxa_imposto * receita_bruta) as imposto,
         (taxa_imposto * frete) as imposto_frete,
         (taxa_difal * receita_bruta) as difal,
         (comissao * receita_bruta) as valor_comissao,
         receita_bruta
           - frete
           - (taxa_imposto * frete)
           - (taxa_imposto * receita_bruta)
           - (taxa_difal * receita_bruta)
           - (comissao * receita_bruta) as receita_liquida
    from itens
   where total_itens = itens_com_cmv
)
update public.orders o
   set gross_revenue_snapshot = c.receita_bruta,
       tax_snapshot = c.imposto,
       freight_tax_snapshot = c.imposto_frete,
       difal_snapshot = c.difal,
       commission_amount_snapshot = c.valor_comissao,
       net_revenue_snapshot = c.receita_liquida,
       cmv_total_snapshot = c.cmv_total,
       contribution_margin_snapshot = c.receita_liquida - c.cmv_total,
       totals_display = coalesce(o.totals_display, '{}'::jsonb)
         || jsonb_build_object(
           'receita_liquida', round(c.receita_liquida, 2)::text,
           'margem_contribuicao', round(c.receita_liquida - c.cmv_total, 2)::text
         )
  from calculado c
 where o.id = c.id
   and o.tenant_id = c.tenant_id;

alter table public.orders enable trigger trg_orders_immutable;
