-- ============================================================
-- 0009 — Códigos gerados automaticamente (produtos e kits)
-- O usuário nunca mais digita um código: o sistema atribui Pxxx / Kxxx.
-- Sequência no banco (não no navegador) evita colisão entre dois usuários
-- cadastrando ao mesmo tempo — é atômico por natureza.
-- ============================================================

-- Produtos: continua de onde a carga inicial parou (P001..P325 → próximo P326)
create sequence product_code_seq;
select setval('product_code_seq',
  coalesce((select max(substring(code from '^P([0-9]+)$')::int) from products), 0));

create or replace function next_product_code()
returns text language sql as $$
  select 'P' || lpad(nextval('product_code_seq')::text, 3, '0')
$$;

alter table products alter column code set default next_product_code();
grant usage on sequence product_code_seq to authenticated;

-- Kits: código passa a ser obrigatório e único, gerado como K001, K002...
-- (tabela vazia hoje, a sequência já nasce em 1 sem precisar de setval)
create sequence kit_code_seq;

create or replace function next_kit_code()
returns text language sql as $$
  select 'K' || lpad(nextval('kit_code_seq')::text, 3, '0')
$$;

alter table kits alter column code set default next_kit_code();
update kits set code = next_kit_code() where code is null;
alter table kits alter column code set not null;
alter table kits add constraint kits_tenant_code_unique unique (tenant_id, code);
grant usage on sequence kit_code_seq to authenticated;
