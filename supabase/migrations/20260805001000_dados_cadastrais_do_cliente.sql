-- Dados cadastrais do cliente — formulário de pedido, 05/08/2026.
--
-- O formulário de papel que acompanha o pedido até a mesa da conferência pede
-- CNPJ, dois CEPs, contato, telefone e e-mail. O sistema não tinha nenhum
-- desses campos: os 13 mil clientes vieram da planilha só com nome e UF, e a
-- única tela existente apenas categorizava. Sem isto, a ficha impressa
-- continuaria saindo com o cabeçalho em branco para alguém preencher à mão.
--
-- Por que dois CEPs: o formulário separa faturamento de entrega porque na
-- prática são endereços diferentes — a nota vai para a matriz e a caixa vai
-- para o almoxarifado do hospital. Somar os dois num campo só obrigaria a
-- expedição a adivinhar qual dos dois vale.
--
-- Armazenamento: SÓ DÍGITOS, sem máscara. "11.222.333/0001-81" e
-- "11222333000181" são o mesmo documento; guardar a pontuação criaria dois
-- cadastros do mesmo cliente e quebraria a busca. A máscara é aplicada na
-- exibição por lib/cadastro/documentos.ts, que é onde ela é testada.

alter table public.customers
  -- CNPJ (14) ou CPF (11): vende-se para hospital e para autônomo.
  add column if not exists tax_id text,
  add column if not exists billing_zip text,
  add column if not exists shipping_zip text,
  add column if not exists contact_name text,
  add column if not exists phone text,
  add column if not exists email text;

-- As checagens são de FORMATO, não de existência. O dígito verificador do
-- CNPJ é conferido em TypeScript (lib/cadastro/documentos.ts), onde dá para
-- explicar o erro para quem digitou; reimplementar módulo 11 em SQL criaria
-- uma segunda cópia da regra, que é exatamente o que este projeto evita.
-- O banco garante só o que precisa ser verdade sempre: se veio preenchido,
-- veio sem máscara e com a quantidade certa de dígitos.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_tax_id_formato') then
    alter table public.customers add constraint customers_tax_id_formato
      check (tax_id is null or tax_id ~ '^[0-9]{11}$' or tax_id ~ '^[0-9]{14}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'customers_billing_zip_formato') then
    alter table public.customers add constraint customers_billing_zip_formato
      check (billing_zip is null or billing_zip ~ '^[0-9]{8}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'customers_shipping_zip_formato') then
    alter table public.customers add constraint customers_shipping_zip_formato
      check (shipping_zip is null or shipping_zip ~ '^[0-9]{8}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'customers_phone_formato') then
    alter table public.customers add constraint customers_phone_formato
      check (phone is null or phone ~ '^[0-9]{10,11}$');
  end if;
end $$;

-- Mesmo CNPJ duas vezes é o mesmo cliente cadastrado em duplicidade — o
-- problema que a planilha tinha com nome ("Campo SImples" contra "Campo
-- Simples", §9.4 do Calculations.md) e que aqui dá para impedir de verdade,
-- porque documento é chave e nome não é. Índice parcial: os 13 mil cadastros
-- herdados estão sem documento e continuam válidos.
create unique index if not exists customers_tax_id_unico
  on public.customers (tenant_id, tax_id)
  where tax_id is not null;

-- Busca por documento na tela de clientes.
create index if not exists customers_tax_id_busca
  on public.customers (tenant_id, tax_id)
  where tax_id is not null;
