# 11 — DRE gerencial mensal

Resultado mensal do negócio, calculado a partir dos pedidos **fechados** no mês, com os custos
congelados no momento de cada venda. É a razão de existir do sistema. **Quem pode usar:**
Administrador e Financeiro.

## Aviso: esta tela não aparece mais no menu lateral

Por decisão da empresa (30/07/2026), o link do DRE foi **removido do menu lateral** — mas a tela
continua funcionando normalmente e continua liberada para Administrador e Financeiro. Para
acessá-la, digite o endereço `/dre` diretamente na barra de endereço do navegador (por exemplo,
`https://[endereço-do-sistema]/dre`), ou peça para alguém salvar esse link nos favoritos. Não é um
bug: é uma tela que continua existindo e acessível, só não tem mais um atalho visível no menu.

## O que a tela mostra

No topo, um seletor de **mês** e os botões **Exportar Excel** e **Imprimir / salvar PDF**.

Um texto de apoio lembra a regra: esta visão considera **exclusivamente pedidos fechados**, soma
os **snapshots** do mês (os custos do momento de cada venda, nunca recalculados depois), e a
última linha usa a **despesa fixa real** do mês — o valor que o Financeiro digita, não uma soma de
rateios antigos.

Se não houver nenhum pedido fechado naquele mês, a tela avisa e oferece um atalho para ver as
simulações em aberto — simulações são projeções e nunca entram na DRE.

### A cascata do mês

```
Receita bruta
(−) Impostos sobre venda + DIFAL
= Receita líquida
(−) CMV (dos snapshots)
= Lucro bruto
(−) Frete líquido + Comissões
= MARGEM DE CONTRIBUIÇÃO
(−) Despesa fixa REAL do mês
= RESULTADO OPERACIONAL
```

As duas últimas linhas só aparecem depois que a despesa fixa do mês for informada (veja abaixo).

Em meses com pedidos fechados **antes** de 29/07/2026 (quando existia o módulo de alocação de
despesas), uma linha informativa extra de **variação de absorção** pode aparecer — é só histórico,
nunca é somada como despesa do mês.

### Despesa fixa real do mês

Um card mostra o valor já informado (ou "Ainda não informada pelo Financeiro"), com um botão
**Informar**/**Alterar**. Digite o valor em R$ e clique em **Salvar**. Sem esse valor, a DRE do mês
fica só até a linha "Margem de contribuição" — o resultado operacional depende dele.

### Comparativo com o mês anterior

Uma tabela compara receita bruta, receita líquida, margem de contribuição e resultado operacional
do mês atual com o mês anterior, mostrando a variação percentual.

### Aberturas (quebras do resultado)

Cinco tabelas mostram receita bruta e margem de contribuição quebradas **por vendedor**, **por
canal**, **por cliente**, **por categoria de produto** e **por produto e kit**.
