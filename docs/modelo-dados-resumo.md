# Modelo de dados - resumo funcional

## Visao geral

O banco atual suporta uma aplicacao de CMV e rentabilidade para uma operacao multi-tenant.

A estrutura combina quatro blocos principais:

1. Cadastros operacionais
2. Custos e composicao de produtos
3. Simulacao/fechamento de pedidos
4. Rateio de despesas e rentabilidade

## Bloco 1 - Cadastros

### `tenants`
Empresa/ambiente de dados.

### `profiles`
Usuarios vinculados a tenant e role.

Roles existentes:
- admin
- financeiro
- comercial
- producao

### `suppliers`
Fornecedores de insumos.

### `customers`
Clientes usados em simulacoes/pedidos.

### `channels`
Canais comerciais, com configuracao de DIFAL, fonte de imposto, comissao padrao e modelo de frete.

### `sellers`
Vendedores vinculados a canais.

## Bloco 2 - CMV e composicao

### `inputs`
Insumos com custo, unidade de compra, unidade de consumo, fator de conversao, ICMS, PIS/COFINS e custo sem imposto.

### `input_cost_history`
Historico de alteracoes de custo de insumos.

### `products`
Produtos finais/intermediarios.

### `product_components`
Composicao de produto por insumo ou outro produto.

Suporta tipos de quantidade:
- `direct`
- `area`
- `lot`

### `product_costs`
CMV calculado por produto.

## Bloco 3 - Kits e pedidos

### `kits`
Agrupamento comercial de produtos.

### `kit_items`
Itens de um kit.

### `orders`
Pedido ou simulacao comercial.

Guarda snapshots de:
- receita bruta
- impostos
- imposto sobre frete
- DIFAL
- comissao
- receita liquida
- CMV total
- despesas rateadas
- margem de contribuicao
- resultado apos rateio
- totais de exibicao

Status:
- `simulation`
- `closed`

### `order_items`
Itens do pedido, com snapshots de CMV, despesas, impostos, DIFAL, comissao, frete e composicao do kit.

## Bloco 4 - Impostos, frete, margem e despesas

### `icsm_rates`
Tabela por UF com ICMS e PIS/COFINS.

Observacao: o nome da tabela esta como `icsm_rates`, provavelmente deveria ser `icms_rates`, mas nao alterar sem decisao consciente porque ja esta criado e referenciado.

### `difal_rates`
Taxas de DIFAL por UF.

### `portal_freight_rates`
Percentual de frete por UF para canais/modelos que usam tabela.

### `margin_rules`
Faixas de margem para classificar resultado.

### `real_monthly_expenses`
Despesas reais mensais.

### `expense_allocation_periods`
Periodo de rateio de despesas.

### `expense_allocations`
Rateio por produto, considerando producao estimada e fator de complexidade.

### `factor_history`
Historico de alteracao de fator de complexidade.

## Bloco 5 - Auditoria

### `audit_logs`
Tabela generica para registrar alteracoes relevantes por entidade.

## Pontos de atencao

- O banco esta bem estruturado, mas ainda quase sem dados operacionais.
- A RLS esta ativa e baseada em `current_tenant_id()` e `current_user_role()`.
- O frontend precisa buscar o perfil do usuario antes de operar telas por role.
- A grafia `icsm_rates` deve ser preservada por enquanto para evitar quebra.
- O calculo de CMV pode estar planejado no app ou em funcoes futuras; ainda nao encontrei uma funcao SQL explicita de recalculo de CMV.
