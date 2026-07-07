# 03 — Banco de Dados (modelagem)

> **Versão:** 1.0 — 07/07/2026
> **Base:** PRD §9 (entidades) + Calculations.md §10 (decisões D3, D4, D7).
> As migrations reais serão escritas na Sprint 2 a partir deste documento.

## 1. Convenções gerais

- **IDs**: `uuid` com `gen_random_uuid()`. Toda busca por ID, **nunca por nome**.
- **Dinheiro, alíquotas e quantidades**: `numeric` **sem precisão fixada** (precisão total, como a planilha). Nunca `float`/`real`/`double`. Exceção: totais persistidos de pedidos **fechados** são gravados também arredondados a 2 casas (PRD §8).
- **Multi-tenant preparado**: coluna `tenant_id uuid not null` referenciando `tenants` em todas as tabelas de negócio, com valor único fixo na v1.
- Todas as tabelas: `created_at timestamptz default now()`, `updated_at timestamptz` (trigger).
- Nomes de tabelas/colunas em inglês (padrão de código); rótulos em português ficam na UI.
- `status`: enums Postgres (`active`/`inactive` etc.) em vez de texto livre.

## 2. Tabelas

### 2.1 Núcleo

**`tenants`** — id, name. (1 linha na v1.)

**`profiles`** — espelha `auth.users` do Supabase: id (uuid = auth.users.id), tenant_id, full_name, role (`admin | financeiro | comercial | producao`), active.

**`channels`** (D4) — parametrizam o cálculo por canal:
- id, tenant_id, name (Interno, Marketplace, Externos, Revendas, Descpro)
- `applies_difal boolean` (Revendas: false)
- `tax_source` (`icsm_table` para todos na carga inicial; Descpro migra de 10% fixo para a tabela — o relatório de importação quantifica a diferença)
- `default_commission_rate numeric` (0,025 padrão; Externos 0,061)
- `freight_model` (`manual | uf_percent`) — `uf_percent` usa a tabela Portal (canais marketplace)

**`sellers`** — id, tenant_id, name, channel_id → channels, active. (Vendedor é entidade separada, vinculada a canal — PRD §5.1. Resolve o bug nº 8 da planilha: nomes de vendedor que não batem com as abas.)

**`suppliers`** — id, tenant_id, name, contato básico, active.

**`customers`** — id, tenant_id, name, uf, notas, active.

### 2.2 Insumos e produtos

**`inputs`** (insumos) — Calculations.md §2:
- id, tenant_id, name, category, supplier_id → suppliers, status
- **preço derivado**: `purchase_unit` (ex.: kg), `purchase_price numeric`, `conversion_factor numeric`, `consumption_unit` (ex.: m²)
- `price_with_tax numeric` (calculado: purchase_price × conversion_factor, ou digitado se direto)
- `icms_rate numeric`, `pis_cofins_rate numeric`
- `price_without_tax numeric` — **calculado** pelo motor (`preço × (1 − ICMS − PIS/COFINS)`, método "por fora"), persistido para leitura rápida
- `price_updated_at timestamptz`

**`input_cost_history`** — id, tenant_id, input_id → inputs, old_price, new_price (com e sem imposto), changed_by → profiles, changed_at. Gravado por trigger a cada alteração de preço.

**`products`** — id, tenant_id, code (único por tenant), name, category, type, `sterile boolean`, size, grammage (gramatura), status. CMV/despesa/custo total **não são colunas digitáveis**: ficam em `product_costs` (abaixo), sempre calculados.

**`product_components`** (ficha técnica) — Calculations.md §3 e §4:
- id, tenant_id, product_id → products
- **componente de dois tipos**: `component_input_id → inputs` OU `component_product_id → products` (CHECK: exatamente um preenchido) — kits em cascata
- **quantidade como expressão estruturada**, não só o número final:
  - `quantity_type` (`direct | area | lot`)
  - `direct`: `quantity numeric`
  - `area`: `width numeric`, `length numeric`, `yield_rate numeric` → qtd = largura × comprimento ÷ rendimento
  - `lot`: `lot_size numeric` → qtd = 1 ÷ lote
  - `computed_quantity numeric` — persistida para leitura; recalculada pelo motor ao salvar
- **Referência circular proibida** (A contém B que contém A): validada no motor **e** por trigger de detecção de ciclo na gravação.

**`product_costs`** — custo vigente calculado (1 linha por produto): product_id (PK), tenant_id, `cmv numeric`, `calculated_at`. Recalculado em cascata quando insumo/ficha muda (T8). Pedidos fechados **não** são afetados (snapshot).

### 2.3 Alocação de despesa (D3 — vigência mensal)

**`expense_allocation_periods`** — id, tenant_id, `period date` (1º dia do mês, único por tenant), `total_expense numeric` (ex.: 450.000 — confirmar periodicidade na importação), status (`open | closed`).

**`expense_allocations`** — id, tenant_id, period_id → expense_allocation_periods, product_id → products, `estimated_production numeric`, `complexity_factor numeric`. Peso, participação, despesa alocada e unitária são **derivados** pelo motor (memória de cálculo exibida na tela); alterar o mês corrente não altera meses fechados.

**`factor_history`** — alterações de fator de complexidade (PRD §6.4 exige histórico): allocation_id, old_factor, new_factor, changed_by, changed_at. (Também vai para `audit_logs`; aqui fica a consulta rápida da tela.)

### 2.4 Kits

**`kits`** — id, tenant_id, code, name, description, status, created_by, created_at.
- `signature text` **única por tenant**: composição ordenada por ID — `produto_3:2|produto_7:1|produto_12:5` (golden test T10). Ao salvar assinatura existente, o sistema oferece reutilizar.

**`kit_items`** — id, tenant_id, kit_id → kits, product_id → products, `quantity numeric`. CMV/despesa/custo do kit = soma ponderada, calculada pelo motor (não persistida como verdade; exibida e congelada só em snapshot de pedido).

### 2.5 Pedidos (D7 — snapshot imutável)

**`orders`** — id, tenant_id, `status` (`simulation | closed`), customer_id → customers, `uf char(2)`, seller_id → sellers, channel_id → channels (copiado do vendedor no momento), `freight numeric`, `freight_paid_by_customer boolean`, `commission_rate numeric` (default do canal; override auditado), closed_at, closed_by → profiles, created_by, created_at.
- Totais do pedido (receita, impostos, DIFAL, comissão, receita líquida, margens da cascata D1) são calculados pelo motor; ao **fechar**, são persistidos em colunas `*_snapshot` (precisão total + versão arredondada a 2 casas).
- Reabrir exige Admin, gera novo snapshot e trilha em `audit_logs`.

**`order_items`** — id, tenant_id, order_id → orders, **`product_id` OU `kit_id`** (CHECK: exatamente um), `quantity numeric`, `unit_price numeric` (preço de venda).
- **Campos de snapshot** (preenchidos só no fechamento; imutáveis depois):
  - `cmv_unit_snapshot numeric`
  - `expense_unit_snapshot numeric`
  - `tax_rate_snapshot numeric`, `difal_rate_snapshot numeric`
  - `commission_rate_snapshot numeric`, `freight_share_snapshot numeric`
  - `kit_composition_snapshot jsonb` — composição do kit **expandida** (produtos, quantidades, CMVs unitários do momento)
- Validação bloqueante (T9): item com CMV = 0 ou produto sem ficha **não fecha** — constraint + validação no motor.

### 2.6 DRE e parâmetros

**`real_monthly_expenses`** — despesa fixa REAL do mês para o DRE (D3: **nunca** somar rateios como se fossem a despesa do mês): id, tenant_id, `period date` único, `amount numeric`, entered_by, source. A diferença para a soma dos rateios é a "variação de absorção" (calculada, não armazenada).

**Tabelas de parâmetros** (o PRD agrupa como `tax_tables`; detalhamos em três tabelas concretas — mais simples de validar e editar):
- **`icsm_rates`** — uf (PK por tenant), `icms_rate numeric`, `pis_cofins_rate numeric` (9,25% todas). Alíquota total = soma (16,25 / 21,25 / 27,25%).
- **`difal_rates`** — uf, `fcp_rate numeric` (pobreza), `base_rate numeric`, `final_rate numeric` (migrada **como está**, D5 — AL/MA/PI/RN sinalizadas para confirmação do contador). SP sem linha → DIFAL 0 explícito na carga (não por acidente de SUMIF).
- **`portal_freight_rates`** — uf, `freight_percent numeric` (canais marketplace).

**`margin_rules`** — faixas de status configuráveis (PRD §5.5): id, tenant_id, label (Boa/Atenção/Crítica/Negativa), `min_rate`, `max_rate`, cor/ordem.

**`audit_logs`** — id, tenant_id, `entity`, `entity_id`, `action`, `old_value jsonb`, `new_value jsonb`, user_id, created_at. Cobre: preço de insumo, fator, parâmetros de canal, override de comissão, reabertura de pedido.

## 3. Relacionamentos (resumo)

```
inputs ──< product_components >── products ──< product_components (cascata/kits atuais)
products ──< kit_items >── kits
products ──< expense_allocations >── expense_allocation_periods
orders ──< order_items >── products | kits
sellers >── channels        orders >── customers, sellers, channels
inputs >── suppliers        profiles >── tenants (todas as tabelas → tenant_id)
```

## 4. Permissões (RLS por perfil)

| Tabela | Admin | Financeiro | Comercial | Produção |
|---|---|---|---|---|
| inputs, input_cost_history | CRUD | CRUD | **sem acesso** | leitura |
| products, product_components, product_costs | CRUD | CRUD | leitura (sem custos de insumo) | leitura |
| expense_allocation_* , real_monthly_expenses | CRUD | CRUD | — | — |
| kits, kit_items | CRUD | CRUD | CRUD | leitura |
| orders, order_items | CRUD | leitura | CRUD (fechar: sim; reabrir: não) | — |
| tabelas de parâmetros, margin_rules, channels | CRUD | leitura | leitura | — |
| audit_logs | leitura | leitura | — | — |

Reabertura de pedido: só Admin. Preço de venda abaixo do custo total: exige confirmação de Admin (PRD §7).

## 5. Integridade — o que o banco garante sozinho

1. `product_components`: CHECK "insumo OU produto"; trigger anti-ciclo.
2. `order_items`: CHECK "produto OU kit"; trigger impede fechar com CMV zero/nulo.
3. `orders` fechados: trigger bloqueia UPDATE/DELETE de snapshot (imutável; reabertura = fluxo próprio auditado).
4. `kits.signature`: UNIQUE por tenant.
5. `expense_allocation_periods.period` e `real_monthly_expenses.period`: UNIQUE por tenant.
6. Alterou `inputs.purchase_price`/alíquotas → trigger grava `input_cost_history` + `audit_logs`.

## 6. Pendências para a Sprint 2 (confirmar com o usuário)

1. **R$ 450.000 é mensal ou anual?** Define a carga inicial de `expense_allocation_periods` (se anual, dividir por 12 — D3).
2. **DIFAL de AL, MA, PI, RN**: manter os valores finais da planilha (D5) — confirmação do contador registrada no relatório de importação.
3. Produções estimadas: quem revisa e com que frequência (define o fluxo de abertura de período mensal).
