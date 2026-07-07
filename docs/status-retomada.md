# Status de retomada - Intertec CMV e Rentabilidade

Data da leitura: 2026-07-07

## Resumo executivo

O repositorio GitHub `vinicruza/Intertec` ainda nao contem a aplicacao versionada. No momento da analise, havia apenas o commit inicial com `README.md`.

A parte concreta do projeto esta no Supabase `Intertec CMV e Rentabilidade` (`wdnontebtxnrsenvtucd`), criado em 2026-07-06. O banco ja tem uma modelagem relevante para um sistema de CMV, rentabilidade, simulacao de pedidos, custos de produtos, composicao de kits, canais, vendedores, clientes, impostos e rateio de despesas.

Minha leitura: o projeto nao esta parado em uma Sprint 6 implementada no GitHub. Ele esta em uma fase de fundacao de backend/modelagem, provavelmente antes ou durante a criacao da interface completa no Lovable.

## O que ja existe no Supabase

### Fundacao multi-tenant e seguranca

- `tenants`
- `profiles`
- `audit_logs`
- RLS por `tenant_id`
- funcoes `current_tenant_id()` e `current_user_role()`
- roles: `admin`, `financeiro`, `comercial`, `producao`

### Cadastros principais

- `suppliers`
- `inputs`
- `products`
- `product_components`
- `kits`
- `kit_items`
- `customers`
- `channels`
- `sellers`

### Custos, impostos e margem

- `product_costs`
- `input_cost_history`
- `icsm_rates`
- `difal_rates`
- `portal_freight_rates`
- `margin_rules`

### Pedidos e simulacao comercial

- `orders`
- `order_items`
- snapshots de receita, impostos, frete, comissao, CMV, despesas, margem e resultado
- status de pedido: `simulation` e `closed`

### Rateio de despesas

- `real_monthly_expenses`
- `expense_allocation_periods`
- `expense_allocations`
- `factor_history`

### Protecoes e historico

- triggers para `updated_at`
- protecao de pedidos fechados
- validacao de fechamento de pedidos
- historico de alteracao de custo de insumos
- historico de fator de rateio
- prevencao de ciclo em composicao de produto

## Dados atuais

As tabelas de dominio existem, mas quase todas estao vazias.

Dados encontrados:

- `tenants`: 1 registro
- `profiles`: 4 registros
- `channels`: 5 registros
- `icsm_rates`: 27 registros
- `margin_rules`: 4 registros

Tabelas ainda sem dados operacionais:

- clientes
- fornecedores
- insumos
- produtos
- componentes
- kits
- pedidos
- itens de pedido
- custos calculados
- despesas reais
- rateios
- fretes por UF
- DIFAL

## Risco principal

O maior risco agora nao e tecnico, e de continuidade: a aplicacao nao esta versionada no GitHub. Se ela foi criada no Lovable, precisa localizar o projeto Lovable correto e garantir sincronizacao com este repositorio.

Enquanto isso nao for feito, qualquer continuidade de frontend pode ficar perdida fora do GitHub.

## Minha recomendacao

1. Usar o Supabase atual como fonte oficial do backend.
2. Versionar a aplicacao no GitHub antes de avancar forte em telas.
3. Reconstruir a Sprint 6 como uma sprint de retomada, focada em transformar a fundacao do banco em uma aplicacao utilizavel.
4. Priorizar primeiro cadastros e simulador, depois relatorios e analises.

## Status sugerido

Eu classificaria o projeto como:

**Backend/modelagem: adiantado para MVP**

**Frontend/app versionado: nao iniciado ou nao sincronizado no GitHub**

**Dados reais/testes: quase inexistentes**

**Proximo passo tecnico: criar ou recuperar a aplicacao Lovable e conectar ao Supabase existente**
