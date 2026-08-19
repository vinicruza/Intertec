# 16 — Prontidão para o primeiro dia de uso real

> Conferência de 18/08/2026 e **correção da base em 19/08/2026**, véspera do dia em que a Intertech
> passa a registrar os orçamentos no sistema. Rodada contra a planilha **viva** (baixada do Google
> Drive com fórmulas) e contra o **banco de produção**.
>
> A §3 descreve o estado encontrado; a §3.6 registra o que foi corrigido e o que sobrou.
>
> Comandos: `npm run validar:pedidos` (lógica) e `npm run conferir:base` (dados).

## 1. As duas perguntas, respondidas separadamente

Um sistema só produz o mesmo orçamento que a planilha se **as duas** estiverem alinhadas:

| | Pergunta | Situação |
|---|---|---|
| **Lógica** | O motor calcula igual à planilha? | ✅ alinhado, com 3 exceções conhecidas (§2) |
| **Dados** | O banco tem os mesmos números da planilha? | ✅ alinhado após a correção de 19/08 (§3.6) |

Motor certo sobre base velha erra o orçamento com a mesma confiança de um motor errado — e sem
nenhum sintoma na tela. Por isso as duas conferências existem e são independentes.

## 2. Lógica — o que vai divergir amanhã, e por quê

O motor foi alinhado hoje em duas frentes (comissão §6.2 e DIFAL §6.3 do Calculations.md). ICMS,
PIS/COFINS, tabela DIFAL, tabela Portal e parâmetros de canal **batem exatamente** com a planilha.

Restam **três casos** em que o sistema vai, de propósito ou por pendência, mostrar número diferente
do print da planilha:

### 2.1 Frete por conta do cliente — diferença DECIDIDA, não é erro

A planilha zera o frete mas continua cobrando imposto sobre ele. O sistema zera os dois, por decisão
do cliente de 04/08/2026.

Qualquer orçamento com a caixa "frete por conta do cliente" marcada vai divergir pelo valor do
imposto sobre o frete. No pedido da aba Camila isso são **R$ 48,75**.

**Não corrigir.** Se aparecer na comparação, é o sistema fazendo o combinado.

### 2.2 Revendas sem imposto — PENDENTE de resposta

Na planilha, as células de imposto da aba Revendas estão vazias. O sistema aplica a tabela ICSM
normalmente. Num pedido de R$ 2.800 para o PI a diferença é **R$ 455,00** — margem 62,36% na
planilha contra 54,83% no sistema.

**Todo orçamento de revenda vai divergir amanhã** até esta pergunta ser respondida.

### 2.3 Descpro com alíquota própria — PENDENTE de resposta

A planilha usa 6,5% ("Alíquota Simples"); o sistema usa a tabela ICSM da UF. Num pedido de R$ 1.920
para o RN: R$ 124,80 contra R$ 312,00.

**Todo orçamento Descpro vai divergir amanhã** até esta pergunta ser respondida.

### 2.4 Abas da planilha que ficaram para trás

Conferido na planilha viva em 19/08, restam **2 abas** com a comissão antiga (as outras duas já
foram corrigidas):

| Aba | Fórmula da comissão | |
|---|---|---|
| Externos | `=N10*$F$24` | usa uma célula de alíquota e ignora o frete |
| Temporária Patricia | `=2,5%*$F$24` | regra antiga |

O sistema já usa a regra nova em todos os canais. Aqui **a planilha é que está desatualizada**.

### 2.5 A planilha cobra o imposto sobre o frete DUAS vezes — 10 das 12 abas

Achado em 19/08, comparando o orçamento da Seguemed (Revendas, R$ 16.556,00, frete R$ 520,00).

A cascata tem duas linhas de imposto, e a de cima já embute o frete:

```
Imposto Frete  =alíquota * N6              -> 110,50
Imposto        =alíquota * (F24 + N6)      -> 3.628,65   <- o frete entra aqui também
Receita Líquida =F24 - SOMA(N6:N11)                       <- subtrai as duas
```

Resultado: o frete é tributado em 110,50 na linha própria **e mais 110,50 dentro da linha
"Imposto"** — R$ 221,00 no total, quando o devido é R$ 110,50. O sistema cobra uma vez só.

**A correção é trocar `*(F24+N6)` por `*F24` na linha "Imposto".** A aba Patricia já está assim —
serve de modelo.

| Aba | Linha "Imposto" | |
|---|---|---|
| Patricia, Temporária Patricia | `*F24` | ✅ correta |
| Camila, Isabela, Suellen, Descpro, Priscilene, Nathalia, Mari, Externos, Revendas, Edmilson | `*(F24+N6)` | ❌ cobra em dobro |

Enquanto não for corrigido, **todo orçamento com frete > 0 nessas 10 abas mostra margem menor do
que a real**, e vai divergir do sistema pelo valor do imposto sobre o frete.

## 3. Dados — o que foi encontrado em 18/08

| | Planilha viva | Banco | |
|---|---:|---:|---|
| Insumos | 85 | 80 | os 5 a mais são pseudo-insumos "Produto X" (viram componente-produto no sistema) |
| Produtos | 356 | 329 | |
| Produtos nos dois lados | | 325 | dos quais **267 batem** e **58 divergem** |
| Produtos só na planilha | | **31** | o vendedor **não vai achar** na tela |
| Produtos só no banco | | 4 | prováveis renomeações |

### 3.1 Uma única causa explica 55 das 58 divergências de CMV

O insumo **Adere Medical Tape** está com preço diferente:

| | Preço c/ imposto | Preço s/ imposto |
|---|---:|---:|
| Planilha | 30,7200 | 24,1920 |
| Banco | 58,0700 | 42,2459 |

Quase o dobro. Todo produto com "Tape" na composição herda a diferença, proporcional à quantidade
consumida — daí as diferenças de R$ 0,18, R$ 0,29, R$ 0,54 se repetirem em blocos.

**Corrigir esse preço resolve 55 dos 58 produtos de uma vez.** Como a planilha é a fonte de
verdade do projeto, o valor a valer é 30,72 — mas vale confirmar com o cliente, porque a queda pela
metade sugere troca de fornecedor (existe também "China Medical Tape" a 75,27).

### 3.2 Três produtos com nome duplicado no banco

Comparação ambígua — o banco tem duas linhas com o mesmo nome e CMVs diferentes:

- `Campo de Mesa 2,00 x 2,00 Não Estéril` — 2,6297 e 4,6681
- `Campo Com Adesivo 0,80 x 0,80 Não Estéril GR40` — 1,0188 e 1,5647
- `Campo Com Fenestra 0,80 x 0,80 + Tape 20cm Não Estéril GR40` — 0,5775 e 0,6219

É o bug §9.3 do Calculations.md, herdado da planilha na carga inicial. Enquanto existirem duas
linhas, não há como dizer qual custo o orçamento vai usar.

### 3.3 Trinta e um produtos existem na planilha e não no sistema

Famílias inteiras que nasceram depois da carga: Campo Catarata 1,00×1,50 e 1,40×1,60, Campo com
Fenestra 1,20×2,00 e 1,80×1,80, Campo Simples 1,60×2,60, Campo de Mesa 1,30×2,00 e 1,40×2,00, entre
outros. A lista completa sai no relatório do `npm run conferir:base`.

### 3.4 Quatro produtos só no banco — provável renomeação

`Campo de Mesa 2,00 x 1,30` e `2,00 x 1,40` (com as versões Não Estéril) saíram da planilha, que
agora tem `1,30 x 2,00` e `1,40 x 2,00`. Parecem os mesmos produtos com as dimensões invertidas no
nome. **Confirmar antes de cadastrar como novos**, ou o catálogo fica com duplicata.

## 3.6 O que foi corrigido em 19/08 — e o que sobrou

Todos os itens 1 a 4 da lista de pendências foram aplicados no banco de produção. O resultado:

| | Antes | Depois |
|---|---:|---:|
| Insumos que divergem em preço | 1 | **0** de 80 |
| Produtos só na planilha | 31 | **0** |
| Produtos só no banco | 4 | **0** |
| Produtos com CMV divergente | 58 | **3** — e os 3 são erro **da planilha** (§3.7) |
| Nomes duplicados no banco | 3 | **0** |

O que foi feito, em ordem:

1. **Adere Medical Tape** — preço corrigido de 58,07 para 30,72 e o ICMS de 18% para 12%, conforme a
   planilha viva. Isso sozinho realinhou 55 produtos.
2. **Trinta e um produtos cadastrados**: 26 produtos novos com suas 170 linhas de ficha, mais 5 que
   só faltavam por causa das renomeações do item 4.
3. **As 3 duplicatas de nome resolvidas** (§3.7).
4. **As 4 renomeações confirmadas**: `Campo de Mesa 2,00 x 1,30` e `2,00 x 1,40` (e as versões Não
   Estéril) são de fato os mesmos produtos que a planilha hoje chama de `1,30 x 2,00` e `1,40 x 2,00`
   — provado pelo CMV idêntico. Foram renomeados, não recadastrados: nenhuma duplicata no catálogo.
5. **Oito CMVs congelados foram destravados.** Os produtos `+ Tape 80cm` tinham o valor certo
   registrado, mas a tabela de custo ainda guardava o número antigo. Corrigido.

## 3.7 As 3 divergências que sobraram são erro da planilha

Nos três casos o banco está certo e a planilha está errada. Vale corrigir a planilha antes da
comparação de amanhã, senão esses três produtos vão sair com preço errado no orçamento **da
planilha**, não no do sistema.

### a) `Campo Catarata 1,40 x 1,60 GR40 Não Estéril`

| | CMV |
|---|---:|
| Planilha | 2,692712 |
| Sistema | 2,848086 |

A planilha repete no GR40 Não Estéril exatamente o número do GR30 Não Estéril — a célula está
apontando para a linha errada. A prova: a diferença entre GR30 e GR40 é R$ 0,155374 na versão
estéril, e o sistema aplica essa mesma diferença na não estéril. A planilha aplica zero.

### b) `Campo Com Adesivo 0,80 x 0,80` — GR30 e Não Estéril GR40 trocados

A própria planilha se contradiz: a **ficha** (aba Input Preço) e a **Alocação** discordam.

| Produto | Ficha da planilha | Alocação da planilha | Sistema |
|---|---:|---:|---:|
| GR30 | 1,564724 | **1,063161** | 1,564724 |
| GR40 | 1,609116 | 1,609116 | 1,609116 |
| Não Estéril GR30 | 1,018768 | 1,018768 | 1,018768 |
| Não Estéril GR40 | 1,063161 | **1,564724** | 1,063161 |

A Alocação trocou os dois valores de lugar. Quem está certo é a ficha: um produto estéril tem 7
insumos (embalagem, esterilização, gráfica) e não pode custar menos que o não estéril equivalente,
que tem 3. **Hoje, todo orçamento feito na planilha com esses dois produtos sai com o custo errado.**

### c) `Campo de Mesa 2,00 x 2,00 Não Estéril` aparece duas vezes na Alocação

Com dois valores diferentes: 4,668095 e 2,629723. O segundo é o CMV do `Campo de Mesa 1,50 x 1,50
Não Estéril`. No sistema ficou um produto só, com 4,668095, e o 1,50 x 1,50 com o seu próprio valor.

## 4. O que ainda precisa acontecer antes de liberar

Os itens de **dados** estão fechados. Sobram os de **regra fiscal** e os de **planilha**:

1. **Responder as duas perguntas fiscais** (Revendas §2.2 e Descpro §2.3) — sem isso, esses dois
   canais divergem por desenho, não por erro.
2. **Corrigir as 4 abas da planilha** que ficaram com a comissão antiga (§2.4).
3. **Corrigir os 3 erros da planilha** apontados na §3.7 — são erros de custo que hoje afetam o
   orçamento feito na planilha.
4. Lembrar que o frete por conta do cliente (§2.1) diverge de propósito.

## 5. Como reproduzir esta conferência

```bash
# 1. Retratos do banco (só leitura), salvos fora do Git:
#    produtos.tsv  →  name, cmv
#    insumos.tsv   →  name, price_with_tax, price_without_tax
#    (as consultas estão no cabeçalho de scripts/conferir-base.ts)

npm run conferir:base -- planilha.xlsx produtos.tsv insumos.tsv relatorio.md
npm run validar:pedidos -- planilha.xlsx relatorio-pedidos.md
```

A planilha viva pode ser exportada do Google Drive em `.xlsx` — o export preserva as fórmulas, que é
o que permite achar erro de fórmula e não só de valor.
