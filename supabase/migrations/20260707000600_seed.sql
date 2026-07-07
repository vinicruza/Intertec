-- ============================================================
-- 0006 — Seeds mínimos (critério de aceite da Sprint 2)
-- Tenant fixo (multi-tenant preparado, não implementado — PRD §8),
-- canais (D4), faixas de margem (PRD §5.5) e tabela ICSM (Calculations §7.1).
-- DIFAL e frete Portal por UF vêm da planilha na importação (Sprint 4).
-- Usuários (profiles) entram na Sprint 5 (autenticação).
-- ============================================================

insert into tenants (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Intertec');

-- Canais e seus parâmetros (Calculations.md §8 + D4)
insert into channels (tenant_id, name, applies_difal, default_commission_rate, freight_model)
values
  ('00000000-0000-0000-0000-000000000001', 'Interno',     true,  0.025, 'manual'),
  ('00000000-0000-0000-0000-000000000001', 'Marketplace', true,  0.025, 'uf_percent'),
  ('00000000-0000-0000-0000-000000000001', 'Externos',    true,  0.061, 'manual'),
  ('00000000-0000-0000-0000-000000000001', 'Revendas',    false, 0.025, 'manual'),  -- venda a contribuinte
  ('00000000-0000-0000-0000-000000000001', 'Descpro',     false, 0.025, 'manual');  -- migra de 10% fixo p/ tabela ICSM (D4)

-- Faixas de status da margem de contribuição (% sobre receita líquida — D2)
insert into margin_rules (tenant_id, label, min_rate, max_rate, color, sort_order)
values
  ('00000000-0000-0000-0000-000000000001', 'Boa',      0.40, null, 'green',  1),
  ('00000000-0000-0000-0000-000000000001', 'Atenção',  0.25, 0.40, 'yellow', 2),
  ('00000000-0000-0000-0000-000000000001', 'Crítica',  0.10, 0.25, 'orange', 3),
  ('00000000-0000-0000-0000-000000000001', 'Negativa', null, 0.10, 'red',    4);

-- Tabela ICSM por UF de destino (Calculations.md §7.1):
-- alíquota total = ICMS interestadual + PIS/COFINS (9,25% para todas)
-- ICMS 7%: Norte, Nordeste, Centro-Oeste e ES | 12%: Sul, MG e RJ | 18%: SP (venda interna)
insert into icsm_rates (tenant_id, uf, icms_rate, pis_cofins_rate)
select '00000000-0000-0000-0000-000000000001', uf, icms, 0.0925
from (values
  ('AC', 0.07), ('AL', 0.07), ('AM', 0.07), ('AP', 0.07), ('BA', 0.07),
  ('CE', 0.07), ('DF', 0.07), ('ES', 0.07), ('GO', 0.07), ('MA', 0.07),
  ('MS', 0.07), ('MT', 0.07), ('PA', 0.07), ('PB', 0.07), ('PE', 0.07),
  ('PI', 0.07), ('RN', 0.07), ('RO', 0.07), ('RR', 0.07), ('SE', 0.07),
  ('TO', 0.07),
  ('MG', 0.12), ('PR', 0.12), ('RJ', 0.12), ('RS', 0.12), ('SC', 0.12),
  ('SP', 0.18)
) as t (uf, icms);
