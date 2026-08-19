# 16 — Prontidão para o primeiro dia de uso real

> Conferência de 18/08/2026, véspera do dia em que a Intertech passa a registrar os orçamentos no
> sistema. Rodada contra a planilha **viva** (baixada do Google Drive com fórmulas) e contra o
> **banco de produção**. Nada foi gravado dos dois lados.
>
> Comandos: `npm run validar:pedidos` (lógica) e `npm run conferir:base` (dados).

## 1. As duas perguntas, respondidas separadamente

Um sistema só produz o mesmo orçamento que a planilha se **as duas** estiverem alinhadas:

| | Pergunta | Situação |
|---|---|---|
| **Lógica** | O motor calcula igual à planilha? | ✅ alinhado, com 3 exceções conhecidas (§2) |
| **Dados** | O banco tem os mesmos números da planilha? | ❌ **desalinhado** (§3) |

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

Externos, Revendas, Edmilson e Temporária Patricia ainda calculam a comissão com a fórmula antiga
(`=2,5%*$F$24`, sem o frete). O sistema já usa a regra nova em todos os canais, conforme decidido.
Aqui **a planilha é que está desatualizada** — vale corrigir as 4 fórmulas antes da comparação.

## 3. Dados — a base NÃO está alinhada

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

## 4. O que precisa acontecer antes de liberar

Em ordem de impacto:

1. **Corrigir o preço do Adere Medical Tape** → resolve 55 produtos.
2. **Cadastrar os 31 produtos que faltam** (ou aceitar que orçamentos com eles não saem amanhã).
3. **Resolver as 3 duplicatas de nome** no banco.
4. **Confirmar as 4 renomeações** antes de cadastrar.
5. **Responder as duas perguntas fiscais** (Revendas e Descpro) — sem isso, esses dois canais
   divergem por desenho.
6. **Corrigir as 4 abas da planilha** que ficaram com a comissão antiga.

Depois de cada rodada de correção, `npm run conferir:base` responde se acabou: ele sai com código de
erro enquanto a base estiver desalinhada, e imprime `BASE ALINHADA ✅` quando não estiver.

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
