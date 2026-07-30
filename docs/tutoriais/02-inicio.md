# 02 — Início / painel

A tela inicial mostra um resumo executivo dos pedidos fechados: quantos pedidos, quanto de
receita, qual a margem, e rankings de clientes, vendedores, produtos e kits. **Quem pode usar:**
Administrador, Financeiro e Comercial (é a primeira tela que você vê depois do login, o item
"Início" do menu).

## O que você vê

No topo, um cumprimento com seu nome e um seletor de **Período** (um campo de mês). Deixe-o vazio
para ver todos os períodos, ou escolha um mês específico — um link **todos** aparece ao lado
quando há um filtro ativo, para limpar rapidamente.

Logo abaixo, seis cartões de números:

| Cartão | O que mostra |
|---|---|
| Pedidos fechados | Quantidade de pedidos ganhos no período |
| Cancelamentos | Quantidade de pedidos cancelados (fica destacado em vermelho se houver algum) |
| Receita bruta | Soma da receita bruta dos pedidos fechados |
| Margem de contribuição | Soma da margem de contribuição em R$ |
| Margem média (s/ RL) | Margem de contribuição média, em % sobre a receita líquida |
| Crítica/negativa | Quantos pedidos ficaram na faixa de margem crítica ou negativa (destacado em vermelho se houver algum) |

Se ainda não houver nenhum pedido fechado (ou nenhum no mês escolhido), aparece um aviso
explicando que os rankings só aparecem conforme pedidos forem fechados no Simulador.

## Rankings

Três tabelas lado a lado:

- **Top clientes** — receita e margem de contribuição por cliente.
- **Top vendedores** — receita e margem de contribuição por vendedor.
- **Top produtos e kits** — receita e quantidade vendida por item.

Todos os números vêm dos **pedidos fechados** (com custo já congelado no fechamento) — simulações
que ainda não viraram pedido ganho não entram nesta tela.
