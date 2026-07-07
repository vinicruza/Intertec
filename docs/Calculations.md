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

---

## 5. Camada 3 — Despesa alocada

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
DIFAL            = aliquota_DIFAL(UF) × receita_pedido
comissao         = 2,5% × receita_pedido                    (fixo, exceto Externos)
ajuste_frete     = −frete, se flag "Frete Cliente" = X      (cliente paga o frete de volta)
receita_liquida  = receita_pedido − frete − imposto_frete − imposto − DIFAL − comissao + ajuste_frete
margem_pedido    = (receita_liquida − CMV_pedido) ÷ receita_liquida
```

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
| DIFAL | 13,5% × 16.800 | 2.268,00 |
| Comissão | 2,5% × 16.800 | 420,00 |
| Receita líquida | 16.800 − 6.580,50 | 10.219,50 |
| **Margem (fórmula da planilha)** | (10.219,50 − 6.150,42) ÷ 10.219,50 | **39,82%** |
| Margem se descontasse a despesa | (10.219,50 − 6.150,42 − 3.115,13) ÷ 10.219,50 | **9,33%** |
| Margem por item (col. P) | (16.800 − 6.150,42 − 3.115,13) ÷ 16.800 | 44,85% |

O mesmo pedido exibe três "margens" diferentes (39,82%, 9,33% implícita, 44,85%). Ver Seção 10, decisão 1.

---

## 7. Tabelas de parâmetros

### 7.1 ICSM (imposto sobre venda por UF de destino) — aba `ICSM`

`alíquota = PIS/COFINS (9,25% para todas) + ICMS interestadual`. ICMS: 7% (Norte/Nordeste/CO + ES), 12% (Sul + MG + RJ), 18% (SP, venda interna). Resultado: 16,25% / 21,25% / 27,25%.

### 7.2 DIFAL por UF — aba `DIFAL`

Colunas: Pobreza (FCP) + Alíquota → DIFAL final. **SP não tem linha** (venda interna → SUMIF retorna 0, comportamento correto por acaso). Em 4 UFs o valor final não bate com Pobreza + Alíquota (ver Seção 9, item 5).

### 7.3 Frete estimado por UF (canal portal/marketplace) — aba `Portal`

Percentual da receita por UF (ex.: SP 9%... AM 27%). Usado apenas nas abas Mari e Temporaria Patricia: `frete = %(UF) × receita_pedido`. Nas demais abas o frete é digitado.

### 7.4 Comissão

2,5% hardcoded em todas as abas, exceto Externos (campo editável, hoje 6,1%). No sistema: parâmetro por vendedor/canal.

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

---

## 9. Bugs e inconsistências encontrados (corrigir na migração, não copiar)

**1. Margem do pedido ignora a despesa alocada.** A planilha calcula a despesa por item (coluna K), mas a fórmula de margem do pedido usa só a receita líquida menos CMV. No pedido-fixture: 39,82% exibido vs 9,33% se a despesa entrasse. Enquanto isso, a margem por item (col. P) desconta a despesa mas ignora impostos/frete/comissão. Nenhuma das duas é a margem completa. → Decisão 1.

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
A margem de contribuição coincide numericamente com a margem que a planilha já exibe (39,82% no pedido-fixture), preservando a intuição do time. O resultado após rateio aparece sempre ao lado, com nome próprio.

**D2 — Denominador dos percentuais = receita líquida.** Padrão de DRE e compatível com a planilha atual; as faixas de status (40/25/10%) permanecem válidas. Valores em R$ sempre exibidos junto ao %.

**D3 — Alocação de despesa com vigência mensal.** Cada mês tem seu total de despesa e produções estimadas (tabela versionada). Na importação, validar se os R$ 450.000 são mensais comparando com a despesa fixa real de um mês; se anuais, dividir por 12 na carga. **Regra do DRE:** o DRE da empresa usa a despesa fixa REAL do mês; a soma dos rateios dos pedidos serve para análise por produto/kit, e a diferença entre os dois é exibida como "variação de absorção". Nunca somar rateios como se fossem a despesa do mês.

**D4 — Tributação e comissão viram parâmetros de canal.** Canal define: aplica DIFAL (sim/não), fonte de alíquota de imposto, comissão padrão, modelo de frete (manual ou % por UF). Migração: Revendas = sem DIFAL (venda a contribuinte); Descpro = abandona o 10% fixo e passa a usar a tabela ICSM por UF (o relatório de importação quantifica a diferença nos pedidos existentes); Mari/Temporária = frete por % da tabela Portal.

**D5 — Tabela DIFAL: migrar a coluna final vigente como está**, incluindo os 4 valores que não batem com Pobreza+Alíquota (AL, MA, PI, RN) — presume-se ajuste consciente de FCP. Tabela editável em Configurações; as 4 UFs entram sinalizadas no relatório de importação para confirmação do contador.

**D6 — Comissão por vendedor/canal com override por pedido.** Padrão 2,5%; Externos 6,1%. Override registrado em auditoria (quem, quando, valor anterior).

**D7 — Snapshot imutável no fechamento do pedido.** Ao fechar, o pedido congela: CMV unitário de cada item (com a composição do kit expandida), despesa unitária, alíquotas de imposto/DIFAL, comissão e frete. Simulações usam custos vigentes; pedidos fechados nunca são recalculados. É o que garante que o DRE de um mês reflita os custos daquele mês.

**Implicação direta no banco de dados:** as decisões D3 e D7 criam duas entidades que não estavam no PRD original — `expense_allocation_periods` (vigência mensal do rateio) e campos de snapshot em `order_items` (cmv_snapshot, expense_snapshot, tax_snapshot, composição expandida do kit em JSON). A D4 adiciona a entidade `channels` com os parâmetros tributários/comerciais.

---

## 11. Golden tests (suíte mínima antes de qualquer tela)

Toda implementação das funções de cálculo deve passar, com tolerância de 0,01 centavo:

| # | Função | Input | Output esperado |
|---|---|---|---|
| T1 | preco_sem_imposto | 377,49; 18%; 9,25% | 274,623975 |
| T2 | preco_sem_imposto | 0,872; 12%; 9,25% | 0,6867 |
| T3 | cmv_produto | ficha da Seção 3 | 2,935400 |
| T4 | despesa_unitaria | Avental: 20.000; 70; total 450.000; Σpesos 14.445.616 | 2,180592 |
| T5 | despesa_unitaria | Campo Catarata GR40: 10.000; 100 | 3,115132 |
| T6 | pedido completo | fixture Seção 6 (BA, 16.800, frete 1.000) | RL 10.219,50; margem 39,82% |
| T7 | pedido, UF=SP | mesmos valores, UF SP | imposto 27,25%; DIFAL 0 |
| T8 | kit em cascata | alterar preço da Bobina SMS e recalcular kit que contém Avental | CMV do kit reflete a mudança |
| T9 | validação | produto sem ficha ou CMV=0 em pedido | erro bloqueante (não zero silencioso) |
| T10 | assinatura de kit | mesma composição em ordem diferente | mesma assinatura |

Sugestão: importar a planilha e rodar um teste de reconciliação em massa — recalcular o CMV dos 325 produtos e comparar com a coluna Input da Alocação, listando toda divergência acima de R$ 0,01.
