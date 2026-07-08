-- ============================================================
-- 0008 — Parâmetros por UF (DIFAL e frete Portal) + vendedores
-- Fonte: planilha "Rentabilidade 2026" (abas DIFAL e Portal), migrada
-- como está (Decisão D5). As 4 UFs cujo DIFAL final não bate com
-- Pobreza+Alíquota (AL, MA, PI, RN) entram sinalizadas para confirmação
-- do contador. SP não tem linha na planilha (venda interna) — aqui entra
-- como 0 EXPLÍCITO, não por acidente de SUMIF (Calculations.md §7.2).
-- Vendedores por canal conforme PRD §5.1.
-- ============================================================

insert into difal_rates (tenant_id, uf, fcp_rate, base_rate, final_rate, flagged_for_review)
select '00000000-0000-0000-0000-000000000001', uf, fcp, base, final, flag
from (values
  ('AC', 0.00, 0.12,  0.12,  false),
  ('AL', 0.01, 0.12,  0.145, true),   -- não bate com Pobreza+Alíquota (0,13)
  ('AM', 0.00, 0.13,  0.13,  false),
  ('AP', 0.00, 0.11,  0.11,  false),
  ('BA', 0.00, 0.135, 0.135, false),
  ('CE', 0.00, 0.13,  0.13,  false),
  ('DF', 0.00, 0.13,  0.13,  false),
  ('ES', 0.00, 0.10,  0.10,  false),
  ('GO', 0.00, 0.12,  0.12,  false),
  ('MA', 0.00, 0.15,  0.16,  true),   -- não bate (0,15)
  ('MG', 0.00, 0.06,  0.06,  false),
  ('MS', 0.00, 0.10,  0.10,  false),
  ('MT', 0.00, 0.10,  0.10,  false),
  ('PA', 0.00, 0.12,  0.12,  false),
  ('PB', 0.00, 0.13,  0.13,  false),
  ('PE', 0.00, 0.135, 0.135, false),
  ('PI', 0.00, 0.14,  0.155, true),   -- não bate (0,14)
  ('PR', 0.00, 0.075, 0.075, false),
  ('RJ', 0.02, 0.08,  0.10,  false),
  ('RN', 0.00, 0.11,  0.13,  true),   -- não bate (0,11)
  ('RO', 0.00, 0.125, 0.125, false),
  ('RR', 0.00, 0.13,  0.13,  false),
  ('RS', 0.00, 0.05,  0.05,  false),
  ('SC', 0.00, 0.05,  0.05,  false),
  ('SE', 0.01, 0.12,  0.13,  false),
  ('SP', 0.00, 0.00,  0.00,  false),  -- venda interna: DIFAL 0 explícito
  ('TO', 0.00, 0.13,  0.13,  false)
) as t (uf, fcp, base, final, flag);

-- Frete estimado por UF (canal Marketplace) — aba Portal
insert into portal_freight_rates (tenant_id, uf, freight_percent)
select '00000000-0000-0000-0000-000000000001', uf, pct
from (values
  ('AC', 0.227), ('AL', 0.14), ('AM', 0.27), ('AP', 0.12), ('BA', 0.17),
  ('CE', 0.14),  ('DF', 0.10), ('ES', 0.10), ('GO', 0.15), ('MA', 0.20),
  ('MG', 0.09),  ('MS', 0.19), ('MT', 0.12), ('PA', 0.18), ('PB', 0.20),
  ('PE', 0.10),  ('PI', 0.18), ('PR', 0.12), ('RJ', 0.09), ('RN', 0.10),
  ('RO', 0.13),  ('RR', 0.13), ('RS', 0.10), ('SC', 0.09), ('SE', 0.12),
  ('SP', 0.036), ('TO', 0.12)
) as t (uf, pct);

-- Vendedores vinculados a canais (PRD §5.1). Nome de vendedor deixa de ser
-- "nome de aba": entidade própria (resolve o bug nº 8 da planilha).
insert into sellers (tenant_id, name, channel_id)
select '00000000-0000-0000-0000-000000000001', v.nome, c.id
from (values
  ('Patricia',            'Interno'),
  ('Camila',              'Interno'),
  ('Isabela',             'Interno'),
  ('Priscilene',          'Interno'),
  ('Suellen',             'Interno'),
  ('Nathalia',            'Interno'),
  ('Edmilson',            'Interno'),
  ('Mari',                'Marketplace'),
  ('Temporária Patricia', 'Marketplace'),
  ('Externos',            'Externos'),
  ('Revendas',            'Revendas'),
  ('Descpro',             'Descpro')
) as v (nome, canal)
join channels c on c.name = v.canal
  and c.tenant_id = '00000000-0000-0000-0000-000000000001';
