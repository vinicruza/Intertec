# Calculations.md — Regras de Cálculo do Sistema Intertec CMV e Rentabilidade

> **Fonte:** engenharia reversa da planilha "Cópia de Rentabilidade 2026" (Google Sheets, 17 abas, 325 produtos, 85 insumos), realizada em 06/07/2026.
> **Uso:** este documento é a fonte única de verdade dos cálculos. Toda função financeira implementada deve reproduzir os exemplos numéricos da Seção 11 (golden tests) antes de qualquer tela ser construída.

---

## 1. Arquitetura do cálculo (4 camadas)

```
Camada 1  INSUMOS          preço com imposto → preço sem imposto
Camada 2  FICHA TÉCNICA    consumo por produto → CMV unitário
Camada 3  ALOCAÇÃO         despesa total ÷ (fator × produção) → despesa unitária
Camada 4  PEDIDO           receita − impostos − DIFAL − frete − comissão → margem
```

Cada camada depende só da anterior. No sistema, devem ser funções puras, testáveis isoladamente.

---

## 2. Camada 1 — Insumos: preço sem imposto

Cada insumo tem: preço com imposto (F), alíquota de ICMS da UF de compra (D) e PIS/COFINS (E).

```
preco_sem_imposto = preco_com_imposto × (1 − ICMS − PIS_COFINS)
```

**Atenção — decisão da empresa, não teoria tributária:** a planilha remove os impostos "por fora" (multiplicando por `1 − alíquotas`), e não "por dentro" (dividindo por `1 + alíquotas`). O sistema deve reproduzir o método da planilha. Se a empresa quiser mudar o método no futuro, isso é uma migração de dados, não um bug fix.

**Padrões observados no preço com imposto** (o campo F frequentemente é uma fórmula, não um número):
- Bobinas: `preço_por_kg × gramatura_em_kg/m²` → ex.: SMS 40gr = `21,80 × 0,04 = 0,872/m²`
- Punho: `preço_por_kg ÷ unidades_por_kg` → `36,06 ÷ 180 = 0,200333/un`
- Bag: soma de componentes → `0,50 + 0,30 + 0,003 + 0,07 = 0,873`

**Implicação para o sistema:** o cadastro de insumo precisa suportar preço derivado (preço da unidade de compra + fator de conversão para a unidade de consumo), não apenas um número digitado. Campos: unidade de compra, preço de compra, fator de conversão, unidade de consumo.

### Exemplos reais (fixtures)

| Insumo | Preço c/ imposto | ICMS | PIS/COFINS | Preço s/ imposto |
|---|---|---|---|---|
| Fita adesiva 9830 | 377,49 | 18% | 9,25% | 274,623975 |
| Bobina SMS 40gr m² | 0,872 | 12% | 9,25% | 0,6867 |
| Bobina TNT Branco 40gr m² | 0,8956 | 12% | 9,25% | 0,705285 |
| Bag | 0,873 | 18% | 9,25% | 0,6351075 |
| Esterilização Horizont | 23,72 | 0% | 0% | 23,72 |
| Punho | 0,2003333 | 18% | 9,25% | 0,1457425 |

---

## 3. Camada 2 — Ficha técnica e CMV

Cada produto consome N insumos. Para cada linha da ficha:

```
custo_componente = preco_sem_imposto_insumo × quantidade_consumida
CMV_produto      = Σ custo_componente
participacao_%   = custo_componente ÷ CMV_produto
```

**Padrões observados na quantidade consumida** (também costuma ser fórmula):
- Área com perda: `1 × 1,2 ÷ 0,99` = largura × comprimento ÷ rendimento de 99%
- Rateio por lote: `1 ÷ 150` = uma caixa (ou uma carga de esterilização) serve 150 unidades
- Rateio por rolo: `1 ÷ 450` = um rolo de fita rende 450 unidades

**Implicação para o sistema:** a ficha técnica precisa guardar a quantidade como expressão estruturada (dimensões + rendimento, ou lote), não só o número final — senão ninguém saberá de onde veio `1,212121` daqui a um ano.

### Fixture completo — Campo Catarata 1,00 x 1,20 GR40

| Insumo | Quantidade | Preço s/ imposto | Custo |
|---|---|---|---|
| Fita adesiva 9830 | 1/450 = 0,002222 | 274,623975 | 0,610275 |
| Bag | 1 | 0,6351075 | 0,635108 |
| Bobina SMS 40gr m² | 1×1,2/0,99 = 1,212121 | 0,6867 | 0,832364 |
| Caixa 6 | 1/150 = 0,006667 | 9,9813 | 0,066542 |
| Envelope 25x30 | 1 | 0,51802 | 0,518020 |
| Esterilização Horizont | 1/150 = 0,006667 | 23,72 | 0,158133 |
| Etiqueta adesiva catarata | 1 | 0,04 | 0,040000 |
| Etiquetinha | 1 | 0,008958 | 0,008958 |
| Gráfica | 1 | 0,066 | 0,066000 |
| **CMV** | | | **2,935400** |

Variantes "Não Estéril" excluem a esterilização e parte da embalagem — no sistema, são produtos distintos com fichas distintas (como já é hoje).

---

## 4. Camada 2b — Produtos compostos (kits atuais)

A planilha já tem kits, modelados como produto cujos "insumos" são outros produtos. Existem 24 pseudo-insumos com prefixo "Produto" (ex.: `Produto Avental`, `Produto Campo catarata`), cujo preço referencia dinamicamente o CMV do produto de origem:

```
Insumo "Produto Avental"  →  preço = CMV do produto Avental (referência viva)
```

**Implicação para o sistema:** a ficha técnica deve aceitar dois tipos de componente — insumo ou produto — com recálculo em cascata (mudou a bobina → muda o CMV do avental → muda o CMV do kit). Proibir referência circular (produto A contém B que contém A).

### 4.1 Embalagem e esterilização do kit (reunião Intertech 16/07/2026)

O envelope é **um só** e a caixa de esterilização é **uma só por kit** — não por produto dentro dele. Somar esses custos produto a produto multiplica uma despesa que na prática ocorre uma vez.

Até esta decisão, a rentabilidade usava um valor aproximado (o "kit aleatório"), que a própria empresa apontou como errado: *"pra ter o CMV correto, 100%, a gente só precisa adicionar isso e aí mata"*.

```
CMV_kit = Σ (CMV_produto × qtd)  +  Σ (preco_sem_imposto_insumo × qtd_por_kit)
               produtos                      embalagem/esterilização
```

A parcela de embalagem deve ser exibida **destacada**, não diluída no total — pedido explícito na reunião.

**Os dois modos de consumo (retorno da Intertech em 29/07/2026).** Envelope e caixa não se comportam igual:

| Modo | Fórmula | Caso |
|---|---|---|
| Direto | `quantidade × preço` | **Envelope** — um por kit |
| Rateio | `preço ÷ itens por caixa` | **Caixa de esterilização** — atende vários kits |

Nos produtos individuais esse rateio já está na ficha e é fixo (o Campo Catarata tem a caixa como `1÷150`, porque já se sabe quantos cabem). No kit ele **varia conforme o que foi montado**: um kit grande vai num envelope 40×55, duas ou três campinhas vão num 10×15. Por isso a escolha é feita na hora de montar o kit.

Lançar a caixa como "1 por kit" cobraria a caixa **inteira** de cada kit — se cabem 10, o custo sai dez vezes maior. Golden test T11c.

O modo entra na assinatura pela expressão, não pelo número resolvido: `caixa:/10` contra `caixa:2`. Comparar o decimal (0,1 contra 2) funcionaria, mas `1÷3` e `1÷6` viram dízimas, e a comparação por texto ficaria sujeita a arredondamento. Golden test T11d.

**Identidade do kit:** a embalagem entra na assinatura. Dois kits com os mesmos produtos mas com 1 ou 2 caixas de esterilização têm CMV diferente; se compartilhassem assinatura, colidiriam no índice único e o segundo herdaria o custo do primeiro. Kits sem embalagem mantêm a assinatura anterior, então o catálogo já cadastrado continua válido. Golden test T11.

### 4.2 CMV com e sem mão de obra (reunião Intertech 16/07/2026)

O custo de costureira fica **dentro** do CMV do produto — é o CMV cheio, usado no pedido e na margem de contribuição. Mas o DRE por competência precisa enxergar o CMV **sem** ele, porque se paga costureira referente à produção passada: paga-se por 40 mil aventais no mês em que se vendem 30 mil.

```
CMV_cheio          = Σ custo_componente                       ← usado no pedido
custo_mao_de_obra  = Σ custo_componente onde insumo.mao_de_obra
CMV_sem_mao_obra   = CMV_cheio − custo_mao_de_obra            ← usado no DRE de competência
```

A mão de obra **propaga em cascata**: se um kit leva um avental que tem costureira na ficha, o "sem mão de obra" do kit também a exclui, na proporção da quantidade. Golden test T12.

O insumo é marcado com a flag `is_labor`. A participação percentual de cada componente continua sendo calculada sobre o CMV cheio — a costureira pesa de verdade no custo.

---

## 5. Camada 3 — Despesa alocada — **DESCONTINUADA (29/07/2026)**

> **Este módulo saiu do produto por decisão do cliente em 29/07/2026.**
>
> Motivo: a empresa passou a raciocinar por margem de contribuição, e o rateio só alimentava uma linha informativa depois dela. Na reunião: *"esse item de alocação de despesas é quando a gente não utilizar a margem de contribuição — não sei se tem sentido a gente ter esse armário"*.
>
> A decisão também elimina três problemas que esta própria seção já registrava: o fator de complexidade é um número subjetivo sem documentação, a despesa unitária do Campo Catarata (3,12) supera o próprio CMV (2,94), e nunca se soube se os R$ 450.000 eram mensais ou anuais.
>
> **O que saiu:** as telas de alocação, a linha `(−) Despesa alocada` da cascata do pedido e a linha de variação de absorção do DRE.
>
> **O que ficou, e por quê:** as funções puras (`lib/calculations/allocation.ts`) e os golden tests T4 e T5 continuam no repositório — a regra do projeto proíbe remover golden tests, e mantê-los não custa nada nem aparece em tela. Os snapshots `expense_unit_snapshot` de pedidos já fechados também ficam: são dado histórico congelado, e reescrever o passado é exatamente o que o sistema existe para impedir. O DRE segue fechando porque a despesa que entra nele é a **despesa fixa real do mês**, digitada pelo Financeiro, que nunca veio do rateio.
>
> A especificação abaixo fica preservada como memória do que foi construído.

Distribui um valor total de despesa operacional (hoje **R$ 450.000, hardcoded**) entre os 322 produtos, ponderando volume × complexidade:

```
peso_produto      = producao_estimada × fator_complexidade
participacao      = peso_produto ÷ Σ pesos          (Σ hoje = 14.445.616)
despesa_alocada   = 450.000 × participacao
despesa_unitaria  = despesa_alocada ÷ producao_estimada
```

Simplificando: `despesa_unitaria = 450.000 × fator ÷ 14.445.616` — a despesa unitária depende do fator do produto **e** do mix de produção inteiro. Se a produção estimada de qualquer produto mudar, a despesa unitária de **todos** muda.

### Fixtures

| Produto | CMV | Produção | Fator | Participação | Desp. alocada | Desp. unitária |
|---|---|---|---|---|---|---|
| Avental | 4,043151 | 20.000 | 70 | 9,6915% | 43.611,85 | 2,180592 |
| Campo Catarata 1,00x1,20 GR40 | 2,935400 | 10.000 | 100 | 6,9225% | 31.151,32 | 3,115132 |

Note: no Campo Catarata a despesa unitária (3,12) é **maior que o CMV** (2,94). O custo total unitário é muito sensível ao fator, que é um número subjetivo sem documentação. O sistema deve exibir a memória de cálculo e manter histórico de alterações de fator.

**Perguntas em aberto (responder antes da Sprint do banco):** o total de 450.000 e as produções estimadas são mensais ou anuais? Quem revisa e com que frequência? (Isso define o conceito de "período de vigência" da alocação.)

---

## 6. Camada 4 — Simulação de pedido

Estrutura de cada aba de vendedor: cliente, UF de destino, vendedor; até 15 itens (32 na aba Isabela); bloco de deduções do pedido.

### Por item

```
receita_item  = preco_venda × quantidade
CMV_un        = lookup do CMV do produto        (hoje: SUMIF por NOME na Alocação Despesa)
despesa_un    = lookup da despesa unitária      (idem)
CMV_total     = CMV_un × quantidade
despesa_total = despesa_un × quantidade
margem_item   = (receita_item − CMV_total − despesa_total) ÷ receita_item
```

### Por pedido (modelo padrão — abas Patricia, Camila, Isabela, Priscilene, Suellen, Nathalia)

```
receita_pedido   = Σ receita_itens
imposto_frete    = aliquota_ICSM(UF) × frete
imposto          = aliquota_ICSM(UF) × receita_pedido
DIFAL            = aliquota_DIFAL(UF) × (receita_pedido + frete)   (ver §6.3)
comissao         = 2,5% × (receita_pedido + frete)          (fixo, exceto Externos — ver §6.2)
frete            = 0, se flag "Frete Cliente" = X           (ver correção abaixo)
imposto_frete    = 0 quando o frete é 0
receita_liquida  = receita_pedido − frete − imposto_frete − imposto − DIFAL − comissao
margem_pedido    = (receita_liquida − CMV_pedido) ÷ |receita_liquida|
```

**⚠️ Correção de 04/08/2026 — frete por conta do cliente.** Até esta data, esta seção
descrevia `ajuste_frete = −frete` **somado** a uma receita líquida que já havia subtraído o
frete: ele saía **duas vezes**. A própria linha se contradizia, dizendo entre parênteses que o
cliente paga o frete de volta. Herdado da planilha e não listado na Seção 9 — ninguém tinha
percebido. Encontrado num teste de tela em 04/08/2026, num pedido de R$ 150 com frete R$ 150,
onde a receita líquida despencou para −217,50.

Regra correta, decidida pelo cliente: **frete por conta do cliente zera o frete do pedido** —
e, com ele, o imposto sobre o frete, porque não há transporte pago pela Intertech para ser
tributado. Na tela, o campo de frete fica bloqueado em R$ 0,00 quando a caixa é marcada, em vez
de aceitar um valor que o sistema depois descontaria.

**⚠️ Correção de 04/08/2026 — sinal do percentual de margem.** O denominador passa a ser o
**módulo** da receita líquida. Com o divisor sinalizado, um pedido de prejuízo (margem negativa
sobre receita líquida negativa) devolvia percentual **positivo**, e a faixa de status carimbava
"Boa", em verde — no simulador, na fila de Aprovações e na contagem do painel Início. Com o
módulo, o sinal do percentual é sempre o sinal do dinheiro. Pedido com receita líquida positiva,
que é o caso de T6 e T7, não muda.

**⚠️ A margem do pedido NÃO desconta a despesa alocada** (ver Seção 9, item 1).

### Fixture completo — pedido real da aba Patricia

Cliente Unimed Salto Itu, UF **BA**, item: Avental TNT Sem Manga Não Estéril, preço 4,20 × 4.000 un.

| Etapa | Cálculo | Valor |
|---|---|---|
| Receita | 4,20 × 4.000 | 16.800,00 |
| CMV do pedido | 1,537605 × 4.000 | 6.150,42 |
| Despesa do pedido | 0,778783 × 4.000 | 3.115,13 |
| Frete (manual) | | 1.000,00 |
| Imposto frete | 16,25% × 1.000 | 162,50 |
| Imposto | 16,25% × 16.800 | 2.730,00 |
| DIFAL | 13,5% × (16.800 + 1.000) | 2.403,00 |
| Comissão | 2,5% × (16.800 + 1.000) | 445,00 |
| Receita líquida | 16.800 − 6.740,50 | 10.059,50 |
| **Margem (fórmula da planilha)** | (10.059,50 − 6.150,42) ÷ 10.059,50 | **38,86%** |
| Margem se descontasse a despesa | (10.059,50 − 6.150,42 − 3.115,13) ÷ 10.059,50 | **7,89%** |
| Margem por item (col. P) | (16.800 − 6.150,42 − 3.115,13) ÷ 16.800 | 44,85% |

O mesmo pedido exibe três "margens" diferentes (38,86%, 7,89% implícita, 44,85%). Ver Seção 10, decisão 1.

### 6.2 Base da comissão: receita + frete (18/08/2026)

**Decisão do cliente, comunicada em 18/08/2026.** A comissão do vendedor passa a incidir sobre a
receita **mais o frete do pedido**:

```
base_comissao = receita_pedido + frete_informado
comissao      = aliquota_comissao × base_comissao
```

**O que mudou e o que não mudou.** A alíquota continua a mesma (2,5% padrão, 6,1% no Externos, com
override por pedido — D6). Só a base mudou. Antes desta data o sistema comissionava apenas a
receita dos itens, como este documento descrevia a partir da planilha antiga.

**Vale para todos os canais.** Na planilha `Rentabilidade_2026_3`, 8 das 12 abas já usavam
`=2,5%*($F$24+$N$6)` e 4 continuavam com `=2,5%*$F$24` (Externos, Revendas, Edmilson e Temporária
Patricia). O cliente confirmou que essas 4 são cópias que ficaram para trás, não exceções: o
sistema aplica a regra nova em todos os canais. Enquanto a planilha não for atualizada, a
conferência de `scripts/validar-pedidos.ts` vai acusar divergência de comissão nessas 4 abas — e
o divergente ali é a planilha.

**Usa o frete INFORMADO, não o efetivo.** Quando o frete é por conta do cliente, a dedução do frete
vai a zero (§6, correção de 04/08/2026) — mas a base da comissão **não** cai junto. O transporte foi
vendido, e o vendedor comissiona sobre ele. É também o que a planilha faz: a fórmula aponta para a
célula do frete digitado (`$N$6`), não para a linha já líquida do estorno. Golden test T16b.

**Efeito no pedido-fixture** (BA, receita 16.800, frete 1.000):

| | Antes | Depois |
|---|---|---|
| Base da comissão | 16.800,00 | 17.800,00 |
| Comissão (2,5%) | 420,00 | **445,00** |
| Receita líquida | 10.219,50 | **10.194,50** |
| Margem de contribuição | 39,82% | **39,67%** |

O resultado passa a expor `base_comissao` como linha própria — a memória de cálculo tem de ficar
visível, senão ninguém explica ao vendedor de onde saíram os R$ 445,00.

Golden tests T16, T16b, T16c e T16d.

### 6.3 Base do DIFAL: receita + frete (18/08/2026)

**Decisão do cliente, comunicada em 18/08/2026**, no mesmo dia e na mesma direção da comissão (§6.2).

```
base_com_frete = receita_pedido + frete_informado
DIFAL          = aliquota_DIFAL(UF) × base_com_frete
```

**Por que o ICMS não mudou junto.** O imposto sobre venda já alcança o frete, mas por outro caminho:
a linha **"Imposto sobre frete"**, separada, aplica a mesma alíquota da UF sobre o frete. Somando as
duas linhas, o ICMS já incide sobre receita + frete. O DIFAL **não tem linha equivalente** — somar o
frete na base é exatamente como se tributa o frete nele. O resultado é o mesmo tratamento para os
dois impostos, escrito de duas formas. Quem "consertar" o ICMS somando o frete na base dele também
vai tributar o frete duas vezes; há teste travando isso.

**Origem.** A planilha `Rentabilidade_2026_3` trocou `*F24` por `*(F24+N6)` na linha do DIFAL em
**9 das 12 abas**. As 3 que não mudaram (Revendas, Descpro, Edmilson) não têm linha de DIFAL — a
regra não se aplica a elas. A **tabela** `difal_rates` não mudou: mesmos 26 estados, mesmos 4
valores manuais de AL/MA/PI/RN (D5).

**Usa o frete INFORMADO, não o efetivo** — mesma regra da comissão. Frete por conta do cliente zera
a dedução do frete, mas não a base do DIFAL: o transporte foi vendido e o estado cobra sobre ele.
Golden test T17b.

**Não muda quem decide se o DIFAL roda.** O override por pedido (§12.1) continua igual: o canal dá o
padrão, o pedido pode ligar/desligar. Só a base mudou. Golden test T17c.

**Efeito no pedido-fixture** (BA, receita 16.800, frete 1.000):

| | Antes | Depois |
|---|---|---|
| Base do DIFAL | 16.800,00 | 17.800,00 |
| DIFAL (13,5%) | 2.268,00 | **2.403,00** |
| Receita líquida | 10.194,50 | **10.059,50** |
| Margem de contribuição | 39,67% | **38,86%** |

Golden tests T17, T17b, T17c e T17d. A mudança saiu também na função de fechamento do banco
(migração `20260818210000`) — a validação de fechamento recalcula a cascata do lado do banco, e
mudar num lado só recusaria todo pedido com frete.

### 6.1 Ficha impressa do pedido (05/08/2026)

O formulário de papel que vai para a mesa da conferência tem uma coluna `VALOR TOTAL` por linha e
um `SUBTOTAL` embaixo:

```
total_linha = preco_unitario × quantidade
subtotal    = Σ total_linha            ← é a MESMA receita bruta acima, com outro nome
```

Implementado em `lib/calculations/fichaPedido.ts`, e não dentro da tela, porque multiplicar preço
por quantidade em JSX é o caminho mais curto para o dinheiro virar float e a soma das linhas
impressas não bater com o subtotal impresso — que é exatamente o que a conferência confere à mão.
Sem arredondamento por linha (§9.9): arredondar antes de somar daria um subtotal diferente.

---

## 7. Tabelas de parâmetros

### 7.1 ICSM (imposto sobre venda por UF de destino) — aba `ICSM`

`alíquota = PIS/COFINS (9,25% para todas) + ICMS interestadual`. ICMS: 7% (Norte/Nordeste/CO + ES), 12% (Sul + MG + RJ), 18% (SP, venda interna). Resultado: 16,25% / 21,25% / 27,25%.

### 7.2 DIFAL por UF — aba `DIFAL`

Colunas: Pobreza (FCP) + Alíquota → DIFAL final. **SP não tem linha** (venda interna → SUMIF retorna 0, comportamento correto por acaso). Em 4 UFs o valor final não bate com Pobreza + Alíquota (ver Seção 9, item 5).

#### 7.2.1 Destaque por UF — `difal_destacado` (regra corrigida em 25/08/2026)

**O DIFAL entra na conta em toda UF que tenha alíquota.** A chave por estado decide apenas se ele
sai **destacado**, nunca se ele existe:

```
DIFAL = (pedido aplica) ? alíquota_final(UF) × base : 0
```

Quem desliga o DIFAL é o **pedido** — `orders.applies_difal`, pelo canal (Revendas, Descpro) ou pela
marcação manual do simulador (§12.1). A UF entra pela alíquota: alíquota zero dá DIFAL zero, que é
como SP funciona (venda interna).

**A regra, nas palavras da cliente (25/08/2026):** é "quase a mesma situação do frete — destacado e
não destacado".

| Estado | Situação | Destaque | Entra na margem? |
|---|---|---|---|
| Sinalizado pela Cristi (14) | a Intertech **já paga** hoje | **sim** | sim |
| Não sinalizado (12 com alíquota) | a cobrança **não está acontecendo agora, mas pode vir a qualquer momento** | não | **sim** |
| SP | venda interna, alíquota 0 | — | não há o que deduzir |

O raciocínio é de provisão: se a cobrança pode chegar, o pedido tem de ter sido vendido com margem
que a suporte. Não destacar é sobre a nota; não deduzir seria mentir sobre o resultado.

**Como isto estava errado.** Entre 21 e 25/08/2026 a coluna se chamava `charges_difal` e desmarcá-la
**zerava** o DIFAL. Treze estados foram desmarcados (docs/17 §3), e os pedidos deles passaram a
exibir margem sem o imposto. O caso que expôs o erro foi o da CLINICA DR LUIZ MADEIRA (aba Isabela,
PA 12%): o sistema mostrava **60,48%** e a planilha da Intertech, **51,49%** — R$ 145,80 de DIFAL
fora da conta num pedido de R$ 1.015. A planilha é a base e sempre esteve certa: a fórmula dela
puxa a alíquota da aba DIFAL sem chave nenhuma de liga/desliga.

Golden test em `tests/calc/difal-por-uf.test.ts` ("golden: PA não destacado deduz DIFAL igual à
planilha"), que trava os R$ 145,80, a receita líquida de R$ 641,39 e os 51,49%.

**Ainda em aberto:** o **destaque** ainda não muda nada na ficha impressa. Hoje a folha mostra o
DIFAL pela regra do canal (`applies_difal`), sem olhar o destaque da UF. Falta decidir o que
"destacado" faz no papel e na nota — e, se a ficha passar a depender disso, o destaque precisará
ser congelado no snapshot do pedido, como as alíquotas.

**Três pedidos fechados** nasceram com o DIFAL zerado (docs/17 §3), somando R$ 2.335,53 fora da
margem. Snapshot não se reescreve (D7): eles continuam como estão, e a diferença é de conferência
com o financeiro, não de recálculo.

### 7.3 Frete estimado por UF (canal portal/marketplace) — aba `Portal`

Percentual da receita por UF (ex.: SP 9%... AM 27%). Usado apenas nas abas Mari e Temporaria Patricia: `frete = %(UF) × receita_pedido`. Nas demais abas o frete é digitado.

> **Observado em 18/08/2026** na planilha `Rentabilidade_2026_3.xlsx`: o percentual de SP passou de
> 9% para **3,6%**. Atualização de parâmetro, não erro — entra na tabela editável de Configurações.

### 7.4 Comissão

2,5% hardcoded em todas as abas, exceto Externos (campo editável, hoje 6,1%). No sistema: parâmetro por vendedor/canal.

> **✅ DECIDIDO em 18/08/2026 pelo cliente — a base da comissão inclui o frete.**
> Ver §6.2 abaixo. A alíquota (2,5% padrão, 6,1% Externos) não mudou; o que mudou foi a base.

---

## 8. Divergências entre as abas de vendedor

As 12 abas são cópias que divergiram. O sistema unifica em um modelo só com parâmetros por canal:

| Aba | Frete | DIFAL | Comissão | Alíquota imposto | Observação |
|---|---|---|---|---|---|
| Patricia, Camila, Isabela, Priscilene, Suellen, Nathalia | manual | sim | 2,5% fixo | tabela ICSM | blocos de itens de tamanhos diferentes (15 a 32 linhas) |
| Mari, Temporaria Patricia | % da receita por UF (Portal) | sim | 2,5% fixo | tabela ICSM | canal marketplace |
| Externos | manual | sim | % editável (6,1%) | tabela ICSM | flag frete cliente numérica, não "X" |
| Revendas | manual | **não** | 2,5% | tabela ICSM | sem DIFAL (venda a contribuinte — confirmar se intencional) |
| Descpro | manual | **não** | 2,5% | **10% hardcoded (N37)** | não usa a tabela ICSM |
| Edmilson | manual | **não** | 2,5% | tabela ICSM | **bug grave — Seção 9, item 2** |

> **⚠️ Observado em 18/08/2026** ao conferir a planilha `Rentabilidade_2026_3.xlsx` contra o motor
> (relatório completo em `docs/15-Validacao-Camada-4.md`). A tabela acima descreve a planilha
> antiga; na nova, três linhas mudaram e **nenhuma decisão foi tomada ainda**:
>
> - **Revendas** não desconta mais imposto nenhum — as células "Imposto" e "Imposto Frete" estão
>   vazias, sem fórmula. Impacto medido: 7,5 pontos de margem (§4.2 do doc 15).
> - **Descpro** usa **6,5%** ("Alíquota Simples"), não os 10% registrados acima (§4.3 do doc 15).
> - **Edmilson** continua com o bug do item 2 da Seção 9, agora com `F44` vazio: o imposto do
>   pedido dá **R$ 0,00** e a margem exibida fica 15 pontos acima da real (§5.1 do doc 15).
>
> Enquanto o cliente não decide, o sistema segue as regras já documentadas aqui.

---

## 9. Bugs e inconsistências encontrados (corrigir na migração, não copiar)

**1. Margem do pedido ignora a despesa alocada.** A planilha calcula a despesa por item (coluna K), mas a fórmula de margem do pedido usa só a receita líquida menos CMV. No pedido-fixture: 38,86% exibido vs 7,89% se a despesa entrasse. Enquanto isso, a margem por item (col. P) desconta a despesa mas ignora impostos/frete/comissão. Nenhuma das duas é a margem completa. → Decisão 1.

**2. Aba Edmilson: imposto calculado sobre a base errada.** `Imposto = alíquota × F44`, onde F44 = 3.102 (um bloco secundário de células), enquanto a receita do pedido é F24 = 15.198. O imposto do pedido real dessa aba está calculado sobre ~20% da receita — margem superestimada. Todas as outras abas usam a receita total.

**3. Produto duplicado com CMVs diferentes → custo dobrado via SUMIF.** "Campo de Mesa 2,00 x 2,00 Não Estéril" aparece 2× na Alocação Despesa (linhas 183 e 184), apontando para colunas diferentes do Input Preço (CMVs 4,668 e 2,630). A linha 184 na verdade referencia o CMV do "Campo de Mesa 1,50 x 1,50 Não Estéril" — rótulo errado. Como as abas de vendedor buscam por SUMIF (que **soma** duplicatas): simular o 2,00x2,00 NE usa CMV 7,298 (dobrado) e o 1,50x1,50 NE, que ficou sem linha própria, retorna **CMV = 0** silenciosamente.

**4. 19 produtos do Input Preço sem linha correspondente na Alocação** (e 18 no sentido inverso) por divergência de grafia: "Campo SImples  1,00 x 1,40" (espaço duplo + I maiúsculo), "0,70x0,70" vs "0,70 x 0,70", nomes truncados ("GR4", "GR"), "Kit Odonto Pério não Estéril" vs "Estéril". Qualquer simulação com esses nomes retorna CMV/despesa = 0 sem aviso. → No sistema: chave por ID, nunca por nome; validação "CMV = 0" bloqueante.

**5. Tabela DIFAL com 4 valores manuais que não batem com a soma das colunas:** AL (0,13 esperado vs 0,145), MA (0,15 vs 0,16), PI (0,14 vs 0,155), RN (0,11 vs 0,13). Podem ser overrides intencionais (FCP diferente) ou erro — confirmar com o financeiro antes de migrar.

**6. 310 fórmulas com `#REF!` dormentes na linha 16 do Input Preço** (Bobina TNT Azul 30gr). Estão protegidas por `IF(qtd>0, ...)` e só explodem se alguém preencher consumo ali. Os 6 produtos que realmente usam o insumo têm fórmulas corretas.

**7. Sem histórico:** cada aba comporta 1 pedido; simular o próximo apaga o anterior. Não existe registro de pedidos fechados nem de evolução de custos.

**8. Nomes de vendedor não batem com as abas** (aba Patricia → vendedor "Isa"; aba Isabela → "SUELEN"), impossibilitando apuração confiável por vendedor.

**9. Sem arredondamento definido:** nenhuma fórmula usa ROUND; tudo flui em precisão total e só o display arredonda. O sistema deve fazer igual (calcular sem arredondar, arredondar só na exibição/2 casas em R$) para bater com a planilha nos golden tests.

---

## 10. Decisões de negócio (tomadas em 06/07/2026 — critério: CMV correto de kits e DRE preciso)

**D1 — Margem oficial = Margem de Contribuição, exibida em cascata de 4 níveis (estrutura de DRE).**
```
Receita bruta
(−) Impostos sobre venda + DIFAL          = Receita líquida
(−) CMV (produtos e kits)                 = Lucro bruto
(−) Frete líquido + Comissão              = MARGEM DE CONTRIBUIÇÃO  ← métrica oficial, dispara alertas
(−) Despesa alocada (rateio)              = Resultado após rateio    ← informativo por pedido
```
A margem de contribuição coincide numericamente com a margem que a planilha já exibe (38,86% no pedido-fixture), preservando a intuição do time. O resultado após rateio aparece sempre ao lado, com nome próprio.

**D2 — Denominador dos percentuais = receita líquida.** Padrão de DRE e compatível com a planilha atual; as faixas de status (40/25/10%) permanecem válidas. Valores em R$ sempre exibidos junto ao %.

**D3 — Alocação de despesa com vigência mensal.** Cada mês tem seu total de despesa e produções estimadas (tabela versionada). Na importação, validar se os R$ 450.000 são mensais comparando com a despesa fixa real de um mês; se anuais, dividir por 12 na carga. **Regra do DRE:** o DRE da empresa usa a despesa fixa REAL do mês; a soma dos rateios dos pedidos serve para análise por produto/kit, e a diferença entre os dois é exibida como "variação de absorção". Nunca somar rateios como se fossem a despesa do mês.

**D4 — Tributação e comissão viram parâmetros de canal.** Canal define: aplica DIFAL (sim/não) como PADRÃO, fonte de alíquota de imposto, comissão padrão, modelo de frete (manual ou % por UF). Migração: Revendas = sem DIFAL (venda a contribuinte, **confirmado correto** em 05/08/2026 — §12.1); Descpro = abandona o 10% fixo e passa a usar a tabela ICSM por UF (o relatório de importação quantifica a diferença nos pedidos existentes); Mari/Temporária = frete por % da tabela Portal. **Extensão de 05/08/2026:** DIFAL ganhou override por pedido, igual à comissão (D6) — o padrão do canal decide "sem se digitar nada", mas o vendedor pode ligar/desligar caso a caso, porque contribuinte × não contribuinte varia pedido a pedido dentro do mesmo canal (§12.1).

**D5 — Tabela DIFAL: migrar a coluna final vigente como está**, incluindo os 4 valores que não batem com Pobreza+Alíquota (AL, MA, PI, RN) — presume-se ajuste consciente de FCP. Tabela editável em Configurações; as 4 UFs entram sinalizadas no relatório de importação para confirmação do contador.

**D6 — Comissão por vendedor/canal com override por pedido.** Padrão 2,5%; Externos 6,1%. Override registrado em auditoria (quem, quando, valor anterior).

**D7 — Snapshot imutável no fechamento do pedido.** Ao fechar, o pedido congela: CMV unitário de cada item (com a composição do kit expandida), despesa unitária, alíquotas de imposto/DIFAL, comissão e frete. Simulações usam custos vigentes; pedidos fechados nunca são recalculados. É o que garante que o DRE de um mês reflita os custos daquele mês.

**Implicação direta no banco de dados:** as decisões D3 e D7 criam duas entidades que não estavam no PRD original — `expense_allocation_periods` (vigência mensal do rateio) e campos de snapshot em `order_items` (cmv_snapshot, expense_snapshot, tax_snapshot, composição expandida do kit em JSON). A D4 adiciona a entidade `channels` com os parâmetros tributários/comerciais.

---

## 10.1 Camada 5 — Explosão de consumo (reunião Intertech 16/07/2026)

Pergunta feita várias vezes na reunião: *"quanto que a gente vendeu de produtos com gramatura, TNT azul, 30 gramas?"* e *"o que a gente está vendendo de laminado?"*

O problema apontado é real: **o laminado não tem código próprio** — é um tecido dentro de vários produtos. Não dá para responder olhando o código do que foi vendido; é preciso descer a ficha técnica até o insumo.

```
consumo_unitario(produto) = Σ quantidade_do_componente            (componente = insumo)
                          + Σ consumo_unitario(filho) × qtd       (componente = produto)

consumo_periodo(insumo)   = Σ consumo_unitario(produto)[insumo] × quantidade_vendida
```

Kits entram como produtos compostos — o cálculo é o mesmo. Referência circular é erro bloqueante, como no CMV: um ciclo aqui produziria consumo infinito. Quantidade vendida zero ou negativa é ignorada, nunca subtrai consumo. Golden test T13.

**Fonte das vendas:** o faturamento continua no ERP, então o sistema não terá 100% das vendas. O acordo da reunião foi importar o relatório de vendas por código — *"eu puxo no Simples um relatório de venda por código; ele joga aqui e já passa"* — e cruzar com o CMV unitário que o sistema já calcula. Linha do relatório que não casa com o catálogo fica registrada, mas **não entra no consumo**: não se explode a composição de um produto que o sistema não conhece.

---

## 11. Golden tests (suíte mínima antes de qualquer tela)

Toda implementação das funções de cálculo deve passar, com tolerância de 0,01 centavo.

**T4 e T5 seguem obrigatórios** mesmo com a Camada 3 descontinuada (§5): a regra do projeto proíbe remover golden tests, e as funções que eles cobrem continuam no repositório, apenas sem uso em tela.

| # | Função | Input | Output esperado |
|---|---|---|---|
| T1 | preco_sem_imposto | 377,49; 18%; 9,25% | 274,623975 |
| T2 | preco_sem_imposto | 0,872; 12%; 9,25% | 0,6867 |
| T3 | cmv_produto | ficha da Seção 3 | 2,935400 |
| T4 | despesa_unitaria | Avental: 20.000; 70; total 450.000; Σpesos 14.445.616 | 2,180592 |
| T5 | despesa_unitaria | Campo Catarata GR40: 10.000; 100 | 3,115132 |
| T6 | pedido completo | fixture Seção 6 (BA, 16.800, frete 1.000) | RL 10.059,50; margem 38,86% |
| T7 | pedido, UF=SP | mesmos valores, UF SP | imposto 27,25%; DIFAL 0 |
| T8 | kit em cascata | alterar preço da Bobina SMS e recalcular kit que contém Avental | CMV do kit reflete a mudança |
| T9 | validação | produto sem ficha ou CMV=0 em pedido | erro bloqueante (não zero silencioso) |
| T10 | assinatura de kit | mesma composição em ordem diferente | mesma assinatura |
| T11 | cmv_kit com embalagem | 2 aventais + 3 campos; 1 envelope + 2 caixas | produtos 16,892502 + embalagem 0,651104 = 17,543606 |
| T11c | caixa rateada | caixa 9,9813 com 10 itens por caixa | 0,99813 por kit (contra 9,9813 se lançada como 1 por kit) |
| T11d | identidade por modo | mesma caixa, 10 ou 20 itens | assinaturas distintas (`/10` contra `/20`) |
| T12 | cmv com/sem mão de obra | ficha com costureira 0,85 marcada como `mao_de_obra` | cheio 1,973848; sem MO 1,123848; propaga ao kit |
| T13 | explosão de consumo | 10 aventais + 4 campos, fichas da §3 | bobina 14,121212; punho 20; caixa 0,026667 |
| T14 | frete por conta do cliente | fixture T6 com a flag marcada | frete 0 e imposto_frete 0; RL 11.382,00 (não 9.219,50 nem −217) |
| T15 | sinal da margem | margem −320,85 sobre RL −217,50 | −147,52% e faixa "Negativa" (nunca "Boa") |
| T16 | base da comissão | fixture T6 (receita 16.800, frete 1.000), 2,5% | base 17.800; comissão 445,00 |
| T16b | comissão com frete do cliente | fixture T6 com a flag marcada | frete 0, mas base 17.800 e comissão 445,00 |
| T16c | comissão sem frete | fixture T6 com frete 0 | base 16.800; comissão 420,00 |
| T16d | comissão do Externos | fixture T6, alíquota 6,1% | 1.085,80 (6,1% × 17.800) |
| T17 | base do DIFAL | fixture T6 (receita 16.800, frete 1.000), 13,5% | base 17.800; DIFAL 2.403,00 |
| T17b | DIFAL com frete do cliente | fixture T6 com a flag marcada | frete 0, mas base 17.800 e DIFAL 2.403,00 |
| T17c | canal sem DIFAL | fixture T6, alíquota 0 | base 17.800, DIFAL 0 |
| T17d | mesma base | fixture T6 com frete 737,42 | base do DIFAL = base da comissão = 17.537,42 |

Sugestão: importar a planilha e rodar um teste de reconciliação em massa — recalcular o CMV dos 325 produtos e comparar com a coluna Input da Alocação, listando toda divergência acima de R$ 0,01.

---

## 12. Pendências fiscais do formulário de pedido (05/08/2026, resolvido em parte por áudio da Intertech no mesmo dia)

O formulário de papel da Intertech tem, na coluna da direita, um bloco que o sistema não tinha:

```
SUBTOTAL
FRETE
ST          ← saiu da folha em 24/08/2026: o imposto não se aplica mais (§12.5)
DIFAL
FCP         ← já embutido no DIFAL, sem linha própria (§12.1)
DIFAL+FCP
TOTAL       ← soma informativa do papel; não é cobrança do cliente (§12.1)
```

### 12.1 DIFAL e FCP — RESOLVIDO: custo da Intertech, não cobrança do cliente

**Confirmado pela Intertech (áudio, 05/08/2026):** *"se o cliente é não contribuinte, a gente tem
que pagar DIFAL"*. É a Intertech quem recolhe a diferença de alíquota ao estado de destino — não
o cliente que paga a mais. **A fórmula que já estava no sistema (§6, §10 D1: DIFAL como dedução
da receita) está correta e não mudou.** O `TOTAL` do formulário de papel é uma soma informativa
para o preenchimento — não é o valor cobrado do cliente.

**A regra do "depende" (pergunta em aberto desde a primeira versão desta seção): contribuinte ×
não contribuinte.** Cliente não contribuinte → Intertech paga DIFAL. Cliente contribuinte (vai
revender e recolher o próprio ICMS) → sem DIFAL. Isso **confirma como correta** uma linha que
esta seção já registrava como incerta (§8, tabela de divergências): o canal Revendas com
`applies_difal = false` não era um bug nem uma pendência — revenda é venda a contribuinte.

**FCP não precisa de linha própria no cálculo.** Já está embutido no valor final da tabela
`difal_rates` (§7.2: Pobreza/FCP + Alíquota → DIFAL final). A folha impressa não separa FCP do
DIFAL porque o sistema nunca calculou os dois separados — só a soma que já vale hoje.

**O que faltava, e foi implementado em 05/08/2026: o DIFAL virou override por pedido, não só
configuração fixa de canal.** O mesmo vendedor, no mesmo canal, vende tanto para contribuinte
quanto para não contribuinte — a decisão de aplicar ou não é por PEDIDO. Pedido da própria
Intertech (áudio): *"você pode deixar uma opção de clique que habilita e desabilita [...] o DIFAL
na hora de ela montar o pedido"*.

```
aplica_difal_pedido = override do pedido, se marcado; senão o padrão do canal   (mesmo padrão da comissão, D6)
DIFAL                = aplica_difal_pedido ? alíquota_UF × receita_pedido : 0
```

A fórmula do DIFAL em si (`alíquota × receita`) **não mudou uma vírgula** — só passou a existir
mais um lugar (o pedido) que pode decidir se ela roda, além do canal. `lib/calculations/order.ts`
e os golden tests T1–T15 continuam intocados; a mudança inteira mora na camada de parâmetros
(`app/lib/sim/params.ts`) e no banco (coluna `orders.applies_difal`).

**Achado ao implementar:** a validação de fechamento (`close_order_with_snapshots`) recalculava o
DIFAL lendo `channels.applies_difal` direto do canal, ignorando o override do pedido. Sem
corrigir, o primeiro pedido com override seria recusado no fechamento por "totais não
reconciliam" — o navegador calcula com o override, o banco recalculava sem ele. Corrigido na
mesma migração: a fonte da verdade do DIFAL no fechamento passa a ser `orders.applies_difal`.
Testado contra Postgres real nos dois sentidos (override ligando e desligando) e confirmado que a
validação continua recusando um DIFAL que não bate com o pedido.

### 12.2 ST — ENCERRADA: não se aplica mais (24/08/2026)

Os áudios da Intertech (05/08/2026) definiam o termo (substituição tributária) mas não explicavam
como se calcula, e a pergunta ficou aberta por quase um mês. A resposta veio na revisão da folha
de 24/08/2026 e não era uma fórmula: **o imposto não se aplica mais**. A linha saiu da folha
(§12.5). Nada nunca foi calculado para ela, então não há histórico a preservar nem migração a
fazer.

### 12.4 A folha passa a MOSTRAR o valor do DIFAL (24/08/2026)

**Origem.** A vendedora mandou o print de uma cotação para Patrocínio/MG (CEP 38700-196) dizendo
que *"não está puxando o valor do Difal"* e que *"MG cobra"*. Ela estava certa nas duas coisas — e
mesmo assim não havia erro de cálculo.

**O que estava acontecendo.** O motor calculava o DIFAL normalmente: MG tem 6% na `difal_rates`
(seed 0008), e 6% × (1.865,00 + 145,00) = **R$ 120,60**. O valor só não aparecia para ela. A linha
"DIFAL" do bloco RESUMO FINANCEIRO da ficha vinha com traço **fixo no código**, e o único lugar que
imprimia o número — o bloco "Margem — uso interno" — é `admin` (`podeVerCascataOperacional`). Quem
monta o pedido é o comercial, que portanto não via o DIFAL em lugar nenhum do sistema.

O traço era intencional quando foi escrito (§12.1: nenhum dos três é cobrado do cliente), mas
esconder o valor resolveu o problema errado: o risco é a folha ser lida como fatura, e disso quem
protege é o **TOTAL**, não a ausência do número.

**Decisão.** A folha mostra o valor; a cobrança não muda.

```
DIFAL         = o valor calculado, à vista na folha
DIFAL + FCP   = o mesmo valor (FCP não tem número próprio — §7.2)
FCP           = sem valor: já embutido na alíquota final do DIFAL
ST            = sem valor: não existe no sistema (§12.2)
TOTAL         = subtotal dos itens + frete        ← NÃO soma DIFAL
```

**Nada muda no cálculo.** Cascata, base do DIFAL (§6.3), override por pedido (§12.1), fechamento no
banco e golden tests: tudo intocado. A mudança é de exibição.

**Uma trava nova.** O `TOTAL` era uma soma solta dentro do componente de tela. Com o DIFAL impresso
uma linha acima dele, somar um no outro virou um erro de uma tecla — então a conta desceu para
`lib/calculations/fichaPedido.ts` como `totalACobrarDoCliente(subtotal, frete)`, com teste que fixa
o pedido do print: total 2.010,00, com o DIFAL de 120,60 de fora.

**Quando o pedido não tem DIFAL** (cliente contribuinte, `applies_difal = false`), a linha sai com
o valor calculado e o rótulo diz o motivo — "dispensado — cliente contribuinte" —, em vez de um
traço mudo, que foi exatamente o que gerou este chamado.

### 12.5 Segunda revisão da folha pela Intertech (24/08/2026)

A Intertech revisou a folha impressa item a item. **Nenhuma conta muda** — cascata, base do DIFAL,
fechamento no banco e golden tests seguem intocados. O que muda é o desenho da folha, mais uma
regra de preenchimento no simulador.

**O ST some.** Ver §12.2. Era a única linha do bloco fiscal sem valor por pendência; agora não é
mais pendência, é ausência definitiva.

**Os textos entre parênteses saem das linhas do DIFAL e do FCP.** Eram longos, empurravam o valor
para fora da coluna da direita e, na impressão, "DIFAL + FCP" chegava a sair sem número nenhum. A
explicação desceu para a nota do rodapé do bloco, que já existia. Uma informação não podia se
perder no caminho: quando o pedido é de cliente contribuinte, a folha precisa dizer que o DIFAL foi
**dispensado**, e não imprimir um traço mudo — que foi exatamente o chamado que originou §12.4.
Solução: o rótulo da linha passa a ser "DIFAL dispensado" nesse caso. Curto, cabe na coluna, sem
parênteses.

**A folha ganha o selo de faixa da margem.** A regra de faixa (Vermelha ≤ 40%, Amarela ≤ 50%,
Verde ≤ 65%, Azul acima disso — `seloMargemComercial`, PRD §5.5) já existia e já aparecia na tela
do pedido, mas nunca tinha chegado ao papel. A folha é o que vai para a mesa da conferência, e é
dela que se espera a resposta de "em que situação este pedido foi aprovado". O selo fica no meio
do cabeçalho, entre o logo e o número do pedido.

O **percentual** ao lado da faixa respeita `hide_margin_numbers_from_sales`: o comercial vê só
"Verde", quem pode ver número de margem vê "Verde · 51,48%". A cor sai para todos — é ela que
responde à pergunta. Enquanto os parâmetros não chegam do banco, vale o padrão, que esconde o
número.

**A cotação do frete deixa de preencher o valor do frete.** Escolher a cotação define POR QUEM a
mercadoria vai, nunca quanto se cobra: o valor do campo "Frete (R$)" é digitado pela vendedora e é
o cobrado do cliente, que na prática fica acima da cotação. Antes, trocar de transportadora
sobrescrevia o campo com o valor cotado e apagava o combinado com o cliente. A cotação continua
na folha, como referência.

**A cidade de entrega volta a aparecer**, em três degraus. Saía só a UF sempre que o pedido tinha
CEP gravado — inclusive quando era o mesmo CEP do cadastro, que é o caso comum. Agora vale, nesta
ordem: a cidade digitada NESTE pedido; senão, quando o CEP é o mesmo do cadastro, a do cadastro; e
só então a UF sozinha.

Para o primeiro degrau, `orders` ganhou `shipping_city` e `shipping_state` (migração
20260825120000), espelhando o que `customers` já tinha. Os campos são preenchidos no simulador e
na tela de expedição, com busca pelo CEP no mesmo caminho do cadastro do cliente
(`consulta-receita`, com o caminho direto de reserva).

**`orders.shipping_state` não é `orders.uf`.** A UF fiscal continua sendo `uf` e continua sendo a
base do DIFAL (§6.3, §12.1). Foi por isso que a UF de entrega ganhou coluna própria em vez de
reaproveitar aquela: no dia em que a caixa vai para um estado e a nota para outro, o imposto tem de
seguir a nota. Há teste de migração fixando que `update_order_shipping` não escreve em `uf`.

**Achado ao aplicar.** O banco tinha DUAS versões de `update_order_shipping` convivendo: a
original de 7 argumentos (20260805001100) e a de 9 (20260807133000). A segunda migração tentou
remover a primeira, mas escreveu uma assinatura de 8 argumentos que nunca existiu, e o
`drop function if exists` engoliu o engano em silêncio. A função morta continuava alcançável pelo
PostgREST. Removida agora.

**A folha para de cortar na impressão.** O container era `max-w-[210mm]` — a largura TOTAL do A4 —
enquanto o `@page` reserva 10mm de margem de cada lado. Sobrava conteúdo fora da área útil e o
navegador cortava a direita: o último dígito do número do pedido e a ponta das linhas de baixo.
Agora são 190mm, que é a área realmente imprimível.

### 12.3 O que foi implementado

Dados cadastrais do cliente (CNPJ/CPF, CEP de faturamento, CEP de entrega, contato, telefone,
e-mail), expedição do pedido (transportadora, peso, volumes, CEP de entrega do pedido), condições
(prazo de pagamento, observação), a ficha impressa redesenhada no formato do formulário, e o
override de DIFAL por pedido (§12.1) e o valor do DIFAL impresso na folha (§12.4). Fora o DIFAL — que já era cálculo e continua sendo, só que
mais preciso —, nenhum desses campos entra na cascata de margem.

---

## 14. Selo comercial: faixas por canal e por vendedor (26/08/2026)

O selo do pedido — Vermelha, Amarela, Verde, Azul — decide se o pedido **segue sozinho ou para
numa fila de aprovação**. Vermelha e Amarela exigem aprovação; Verde e Azul seguem.

Até 26/08/2026 os limites eram os mesmos para a empresa inteira, escritos no código. A Intertech
pediu régua própria para o Marketplace, e a resposta foi além do pedido de propósito: as faixas
viraram **dado editável por canal e por vendedor**, em `commercial_margin_bands`. Marketplace vende
com estrutura de custo diferente do Interno, e a próxima vez que isso mudar não deve exigir
programador.

### 14.1 Como se lê

Três tetos, **inclusivos** — a mesma semântica que o código já usava:

```
pct <= red_max     → Vermelha   (para na aprovação)
pct <= yellow_max  → Amarela    (para na aprovação)
pct <= green_max   → Verde      (segue sozinho)
acima disso        → Azul       (segue sozinho)
```

O teto inclusivo é o que faz "vermelha até 29,99%" significar que **30,00% já é amarela**.

### 14.2 Quem manda sobre quem

Do mais específico para o mais geral: **vendedor → canal → padrão da casa**. É o que permite abrir
exceção para uma pessoa sem mexer no canal inteiro. Sem nenhuma linha cadastrada, vale o padrão
embutido no código (40 / 50 / 65) — rede de segurança para que uma falha de leitura não mude a
régua de aprovação de todo mundo em silêncio.

### 14.3 O que está cadastrado

| Vale para | Vermelha até | Amarela até | Verde até |
|---|---|---|---|
| Padrão da casa | 40% | 50% | 65% |
| Marketplace (Mari, Temporária Patricia) | 29,99% | 39,99% | 50% |

O padrão da casa é exatamente o que estava no código antes desta mudança: ninguém mudou de faixa
quando ela foi aplicada.

### 14.4 A régua vive em dois lugares, e os dois foram corrigidos

O fechamento no banco aprova sozinho o pedido de margem boa. Esse limite estava escrito à mão como
`v_margin_pct > 0.50` — o mesmo número do selo, copiado.

Com faixa por canal esse número deixou de ser único. Um pedido de Marketplace com 45% é **Verde**
pela régua nova (segue sozinho), mas seria recusado no fechamento por não passar de 0,50, com a
mensagem "Pedido precisa estar aprovado antes do fechamento" e nenhuma pista do motivo. A Mari
bateria nisso no primeiro pedido.

`public.teto_amarelo_do_pedido()` resolve a mesma precedência do `faixaDoPedido` do navegador, e o
fechamento passou a lê-la. Testes em `tests/calc/faixa-margem.test.ts` (bordas de 30, 40 e 50) e em
`tests/pedidos/regras-do-banco.test.ts` (os dois lados não se separarem de novo).

## 15. Cotação de frete obrigatória para prosseguir (26/08/2026)

Pedido da Intertech: sem ao menos uma cotação de transportadora, o pedido não prossegue. É o frete
cotado que sustenta a margem apresentada e o que a expedição usa para fechar com a transportadora.

**O que conta como cotação:** transportadora (do cadastro ou digitada em "Outra") **e** valor maior
que zero. Linha com transportadora escolhida e valor em branco é linha começada e abandonada;
aceitá-la seria pior do que não ter regra, porque daria a impressão de que alguém cotou.

**Trava o prosseguir, nunca o salvar.** Cotar frete é etapa posterior a montar o pedido; impedir de
salvar obrigaria a vendedora a segurar tudo na tela até a transportadora responder.

Os dois pontos de saída ficam guardados:

| Caminho | Onde |
|---|---|
| Enviar para aprovação | `submit_order_for_approval` |
| Ganhar o pedido | gatilho `protect_closed_order`, na passagem para `closed` |

O segundo importa mais do que parece: **pedido de margem boa é aprovado sozinho e nunca passa pela
primeira porta**. Por isso a trava do fechamento mora no gatilho, e não na tela — ali ela vale venha
o pedido de qual caminho vier.
