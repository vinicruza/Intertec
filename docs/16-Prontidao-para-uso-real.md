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

## 3.8 Tamanho da compressa nos aventais — RESOLVIDO em 19/08

A Patrícia apontou que "Avental com Compressa" não diz o tamanho da compressa. Estava certa: os **16**
produtos de avental com compressa usavam, na planilha e no sistema, sempre a `Compressa P Medihouse`,
e o nome não dizia isso. Não era falha de carga — o catálogo nunca teve a versão G.

**Decisão da Patrícia (19/08): "Pode colocar com comp P e G. Com fio não precisa."**

### O que foi feito no sistema

| | Antes | Depois |
|---|---:|---:|
| Aventais com compressa | 16 (todos P, sem dizer) | **32** — 16 com P e 16 com G |
| Produtos ativos | 356 | **372** |

1. Os 16 existentes foram **renomeados** para `... com Compressa P ...`. O CMV não mudou em nenhum:
   é o mesmo produto, agora com o nome dizendo o que sempre foi.
2. Foram **criados** os 16 com `... com Compressa G ...`, copiando a ficha e trocando uma linha:
   sai `Compressa P Medihouse` (R$ 0,654750 sem imposto), entra `Compressa G Medihouse 40x40`
   (R$ 0,989400). Tudo o mais é idêntico — mesmo tecido, costura, envelope e esterilização.
3. A diferença ficou **exatamente R$ 0,334650** nos 16 pares, conferida um a um.
4. A versão **com fio** (`Compressa G Medihouse com fio 40x40`) não foi criada, conforme decidido.

Nenhum pedido foi afetado. O único pedido fechado que usava um desses produtos (ORC-2026-0025)
manteve o nome congelado no snapshot — `Avental com Compressa` — como manda a decisão D7.

### CMV das 16 versões novas

| Produto | com P | com G |
|---|---:|---:|
| Avental com Compressa | 4,6979 | **5,0326** |
| Avental com Compressa Não Estéril | 3,4662 | **3,8008** |
| Avental G com Compressa | 4,8706 | **5,2052** |
| Avental G com Compressa Não Estéril | 3,6388 | **3,9735** |
| Avental G com Compressa e Tag | 5,0906 | **5,4252** |
| Avental G com Compressa e Tag Não Estéril | 3,8588 | **4,1935** |
| Avental GG com Compressa | 5,3562 | **5,6908** |
| Avental GG com Compressa Não Estéril | 4,0121 | **4,3467** |
| Avental GG com Compressa e Tag | 5,5762 | **5,9108** |
| Avental GG com Compressa e Tag Não Estéril | 4,2321 | **4,5667** |
| Avental EGG com Compressa | 6,1793 | **6,5140** |
| Avental EGG com Compressa Não Estéril | 4,6668 | **5,0014** |
| Avental EGG com Compressa e Tag | 6,3993 | **6,7340** |
| Avental EGG com Compressa e Tag Não Estéril | 4,8868 | **5,2214** |
| Avental M com Compressa e Tag | 4,9179 | **5,2526** |
| Avental M com Compressa e Tag Não Estéril | 3,6862 | **4,0208** |

### O que o Bryan precisa fazer na planilha

Até isso ser feito, `npm run conferir:base` vai acusar 32 divergências de nome — **esperado**, não é
defeito. São duas tarefas na aba `Input Preço`:

1. **Renomear** os 16 blocos de `... com Compressa ...` para `... com Compressa P ...` (linha 2 do
   bloco, e a lista da Alocação). Não muda fórmula nenhuma.
2. **Criar** os 16 blocos `... com Compressa G ...`, copiando o bloco da versão P e trocando a linha
   da compressa: em vez da `Compressa P Medihouse` (linha 23), apontar para a
   `Compressa G Medihouse 40x40` (linha 25). O CMV tem de bater com a coluna "com G" da tabela acima.

As abas de vendedor puxam o custo da Alocação por nome, então os 32 nomes precisam entrar lá também.

## 3.9 Pendências que a Patrícia ainda não respondeu

### a) "Tag" ou "Toalha"? O catálogo se contradiz

Investigando o pedido dela do "Avental com toalha de mão", apareceu uma inconsistência que **não é
segura de resolver sem ela**:

Os 8 produtos `... com Compressa ... e Tag` estão na categoria **"Avental com Toalha"**, com prefixo
de código **AVT** (Avental com Toalha), e a descrição de nota fiscal diz **"com Compressa e Toalha"**.
Mas a ficha consome o insumo **`Tag`** (R$ 0,22), e não o insumo
**`Compressa Wiper/Toalha de mão`** (R$ 0,1897) — que é o que os kits usam como toalha.

Ou seja: ou o insumo `Tag` é o que a Intertech chama de toalha de mão e o nome do insumo está errado,
ou a categoria e a descrição de NF é que estão erradas. **Se for o primeiro caso, o "Avental com
toalha de mão" que a Patrícia procura já existe — é o "com Tag".** Precisa da resposta dela antes de
mexer, porque isso decide se há produto novo a criar ou apenas nome a corrigir.

### b) Os 4 Kits Catarata também ganham versão G?

A Patrícia escreveu "em todos os produtos que utiliza este item na composição". Além dos 16 aventais,
quem consome `Compressa P Medihouse` são os `Kit Catarata com 1` e `com 2` (estéril e não estéril).
Não foram tocados: o "1" e o "2" do nome já indicam a quantidade de compressas, e não há lugar óbvio
para o P/G — precisa ela dizer como quer chamar.

### c) A costureira do GG está cadastrada, mas nenhum produto a usa

Achado ao fechar a conferência dos aventais. Existem duas costureiras de avental:

| Insumo | Preço sem imposto | Produtos que usam |
|---|---:|---:|
| `Custo costureira avental M G` | 0,8350 | **todos** os aventais |
| `Custo costureira avental GG` | 0,9350 | **nenhum** |

Todo avental — inclusive GG e EGG — usa a costureira "M G". A diferença de tamanho aparece só no
tecido: a bobina vai de 2,3050 (M) para 2,5564 (G), 3,1000 (GG) e 4,0533 (EGG).

A planilha faz igual, então **o sistema está fiel e isto não é defeito de carga**. Mas se costurar um
GG custa mesmo mais caro que um M, os 8 produtos GG e os 8 EGG estão subcusteados em R$ 0,10 cada.
Pergunta para a Patrícia: a costureira cobra o mesmo para todos os tamanhos, ou o insumo GG deixou de
ser ligado por engano?

### d) O tamanho M tem dois nomes

Não existe produto `Avental M` simples. O tamanho M aparece como `Avental` (sem letra) nas versões
com compressa, e como `Avental M` nas versões com Tag — mesma costureira e mesmo tecido (2,3050), é o
mesmo tamanho escrito de duas formas. Confunde na hora de cotar. É assim na planilha também;
padronizar é só renomear, sem efeito nenhum no custo.

## 3.10 ORC-2026-0041 (Oclusor / BA) — o selo amarelo de 20/08

**Conclusão: a conta do sistema e a da planilha são a mesma. O que mudou foi o frete digitado.**

O pedido do dia 20/08 às 11h (700 Oclusor a R$ 3,60 = R$ 2.520,00, destino BA) foi gravado no
sistema **sem frete** (R$ 0,00). A aba `Patricia` da planilha tem o mesmo orçamento **com frete de
R$ 82,00 por conta da Intertec** (a marca "X" de Frete Cliente está vazia).

| | Sistema (frete R$ 0,00) | Planilha (frete R$ 82,00) |
|---|---|---|
| Receita | 2.520,00 | 2.520,00 |
| (−) Frete | 0,00 | 82,00 |
| (−) Imposto sobre o frete | 0,00 | 13,325 |
| (−) Imposto sobre a venda (16,25%) | 409,50 | 409,50 |
| (−) DIFAL BA (13,5%) | 340,20 | 351,27 |
| (−) Comissão (2,5%) | 63,00 | 65,05 |
| **Receita líquida** | **1.707,30** | **1.598,855** |
| (−) CMV (700 × 1,337095516) | 935,966861 | 935,966861 |
| **Margem de contribuição** | **45,178536%** | **41,460179%** |

> **Correção de 20/08, tarde.** A primeira versão desta seção dizia que digitar o frete de R$ 82,00
> no sistema devolvia 41,460179%, igual à planilha. Isso vale para o motor `calcularPedido` chamado
> com `fretePorContaCliente: false` — combinação que **o simulador nunca produz**. O simulador
> sempre passa `fretePorContaCliente: true`, e por isso o frete **nunca** é deduzido da margem. Ver
> §3.12: é uma lacuna real, não um campo em branco.

Rodando pelo `simular()`, que é o que a tela usa, o mesmo pedido dá:

| No simulador | Receita líquida | Margem |
|---|---|---|
| frete R$ 0,00 (como ficou gravado) | 1.707,30 | 45,1785% |
| frete R$ 82,00, "Frete destacado" **marcado** | 1.680,855 | 44,3160% |
| frete R$ 82,00, "Frete destacado" **desmarcado** | 1.694,18 | 44,7540% |
| **Planilha** (frete R$ 82,00 por conta da Intertec) | **1.598,855** | **41,4602%** |

Nenhuma das três bate com a planilha, porque em nenhuma delas o sistema tira os R$ 82,00 do
resultado. O CMV e as alíquotas continuam idênticos — a diferença é inteira do tratamento do frete.

### Por que esta aba se comporta diferente das outras três conferências

A aba `Patricia` (e a `Temporaria Patricia`) **já foram corrigidas**: o imposto agora é
`alíquota × F24`, sem somar o frete. As outras **10 abas continuam com o erro** da §2.5
(`alíquota × (F24 + N6)`), e é por isso que nas conferências anteriores (Revendas/Seguemed,
HOFTALMO, OLHO CLINICA) a planilha sempre dava margem **menor** que o sistema, na proporção exata de
`alíquota × frete`.

Abas ainda com o imposto em dobro em 20/08 (reconferido na versão de hoje da planilha): `Camila`,
`Isabela`, `Suellen`, `Priscilene`, `Nathalia`, `Mari`, `Externos`, `Revendas`, `Edmilson` e
`Descpro` — esta última com a alíquota própria de 6,5% (`=$N$37*(F24+N6)`) e sem linha de DIFAL.

### O caso do kit montado

Na planilha a vendedora escolhe `Kit Aleatório` (2,026695) além de listar os componentes. O que esse
número é de verdade está detalhado na §3.11 — não é uma média, é um jogo FIXO de embalagem.

## 3.11 O que é o "Kit Aleatório" da planilha — e o teste do pedido INOVE (PR)

**Descoberta de 20/08: `Kit Aleatório` não é uma média nem uma aproximação. É um jogo FIXO de
embalagem, e o sistema reproduz o número dele exatamente.**

Na planilha, `Alocação Despesa!B329` puxa o CMV de `Kit Aleatório` da coluna `Input Preço!$AEA`.
Abrindo essa coluna, a composição é:

| Insumo | Quantidade | Custo |
|---|---|---|
| Envelope 30x40 | 1 por kit | 0,82836 |
| Caixa 6 | 1 ÷ 30 | 0,33271 |
| Esterilização Horizont | 1 ÷ 30 | 0,7906667 |
| Etiquetinha | 1 por kit | 0,0089583 |
| Gráfica | 1 por kit | 0,0660000 |
| **Total** | | **2,026695** |

É exatamente o modelo que o sistema passou a usar em 19/08 (envelope unitário, caixa e esterilização
rateadas por envelopes-por-caixa, etiquetinha e gráfica automáticas). Rodando `custoKitCompleto` com
essas cinco linhas, o sistema devolve **2,02669500** — bate na sexta casa.

Ou seja: os dois lados calculam a embalagem do kit da MESMA forma. A diferença é que na planilha esse
jogo é fixo para todo kit montado, e no sistema a vendedora escolhe o envelope, a caixa e quantos
envelopes cabem nela.

### O teste: INOVE / PR / Isabela

Kit de 100 unidades a R$ 33,75 (receita R$ 3.375,00), frete R$ 190,00 destacado, PR (ICSM 21,25%,
DIFAL 7,5%). Composição por kit: 2 Compressa Wiper Não Estéril, 2 Avental Não Estéril, 1 Campo de
Mesa 1,30 x 1,70 Não Estéril, 1 Campo Simples 1,00 x 1,20 Não Estéril GR30.

| | Sistema (mesma embalagem da planilha) | Planilha |
|---|---|---|
| Receita | 3.375,00 | 3.375,00 |
| (−) Imposto sobre o frete (21,25% × 190) | 40,38 | 40,38 |
| (−) Imposto sobre a venda | **717,19** = 21,25% × **3.375** | **757,56** = 21,25% × **3.565** |
| (−) DIFAL (7,5% × 3.565) | 267,38 | 267,38 |
| (−) Comissão (2,5% × 3.565) | 89,13 | 89,13 |
| **Receita líquida** | **2.260,94** | **2.220,56** |
| (−) CMV | 1.145,29 | 1.146,47 |
| **Margem** | **49,34% 🟡** | **48,37%** |

Sobram duas diferenças, as duas explicadas:

1. **R$ 40,38 no imposto** — é `21,25% × 190`, o imposto sobre o frete cobrado duas vezes (§2.5). A
   aba `Isabela` é uma das 10 que ainda não foram corrigidas. Terceiro pedido seguido em que a
   diferença é exatamente esse valor.
2. **R$ 1,19 no CMV** — o `Avental Não Estéril` está 0,005934 mais caro na planilha (2,817356975)
   que no banco (2,811423). É **menos de um centavo por unidade**, abaixo da tolerância de R$ 0,01
   do `conferir:base`, por isso nunca apareceu na conferência. A diferença é constante em toda a
   família Avental, então é um insumo compartilhado com preço levemente diferente — vale investigar,
   mas não muda decisão nenhuma (0,035% do pedido).

### O achado que importa neste pedido: esterilização num kit Não Estéril

Os quatro componentes deste kit são **Não Estéril**, mas o `Kit Aleatório` carrega
`Esterilização Horizont` embutida — R$ 0,79 por kit, **R$ 79,07 no pedido**. A planilha não tem como
tirar: o jogo é fixo. No sistema a vendedora desmarca a esterilização, e aí:

| | CMV do pedido | Margem | Selo |
|---|---|---|---|
| Com esterilização (igual à planilha) | 1.145,29 | 49,34% | 🟡 Amarela |
| Sem esterilização (correto para Não Estéril) | 1.066,22 | **52,84%** | 🟢 Verde |

**É essa a razão de o sistema existir para kits montados**: não é dar um número diferente, é deixar a
vendedora montar a embalagem que o kit realmente usa em vez de pagar por uma esterilização que não
aconteceu.

## 3.11b A regra do frete destacado do Bryan — CONFERIDA (ver §3.12 para a decisão final)

Áudio do Bryan de 19/08/2026:

> "Se o frete estiver **destacado na nota**, o imposto deve ser calculado sobre o valor do pedido
> **mais o frete**. Se o frete **não estiver destacado** na nota, ou seja, se ele não aparecer na
> nota fiscal, o imposto deve ser calculado **somente sobre o valor do pedido**, que será o valor
> total da nota fiscal."

**O sistema já faz exatamente isso, nos dois lados.** A confusão é que o sistema não tem uma linha só
de imposto: tem duas — "Imposto sobre a venda" e "Imposto sobre o frete". A regra do Bryan fala do
total, e é o total que precisa bater.

Conferido nos três orçamentos reais, na tela (`simular()`) e no banco
(`close_order_with_snapshots`), com resultado idêntico:

| Orçamento | Alíquota | Frete | Estado | Imposto venda | Imposto frete | **Total** | Regra do Bryan |
|---|---|---|---|---|---|---|---|
| OLHO CLINICA (SP) | 27,25% | 55,00 | destacado | 114,4500 | 14,9875 | **129,4375** | 27,25% × 475 = 129,4375 ✅ |
| OLHO CLINICA (SP) | 27,25% | 55,00 | não destacado | 114,4500 | 0 | **114,4500** | 27,25% × 420 = 114,4500 ✅ |
| Oclusor (BA) | 16,25% | 82,00 | destacado | 409,5000 | 13,3250 | **422,8250** | 16,25% × 2.602 = 422,8250 ✅ |
| Oclusor (BA) | 16,25% | 82,00 | não destacado | 409,5000 | 0 | **409,5000** | 16,25% × 2.520 = 409,5000 ✅ |
| INOVE (PR) | 21,25% | 190,00 | destacado | 717,1875 | 40,3750 | **757,5625** | 21,25% × 3.565 = 757,5625 ✅ |
| INOVE (PR) | 21,25% | 190,00 | não destacado | 717,1875 | 0 | **717,1875** | 21,25% × 3.375 = 717,1875 ✅ |

A caixa **"Frete destacado"** da tela é justamente o "destacado na nota" do Bryan.

A regra ficou travada em teste automatizado — `tests/calc/imposto-frete-destacado.test.ts`, 10
asserções, escritas sobre o TOTAL das duas linhas e não sobre cada uma, para continuarem valendo se
o desenho da tela mudar.

**Onde o Bryan diz que a planilha está errada, ele tem razão** — mas o erro é o oposto do que ele
imaginou. Ele suspeitou que o sistema calculasse só sobre o pedido; o que acontece é que **10 das 12
abas da planilha cobram o imposto sobre o frete DUAS vezes** (§2.5): uma na linha "Imposto Frete" e
outra dentro da linha "Imposto", que usa `alíquota × (F24 + N6)`. Somando, o frete é tributado em
dobro. A aba dele (`Patricia`) e a `Temporaria Patricia` já foram corrigidas para `alíquota × F24`,
e é por isso que só elas batem com o sistema.

**Atenção ao corrigir as outras 10 abas:** a correção é trocar `*(F24+N6)` por `*F24` na linha
"Imposto" — e aí o par de linhas passa a implementar a regra do Bryan sozinho, porque a linha
"Imposto Frete" só é preenchida quando o frete está destacado.

### O que o áudio NÃO responde

O áudio trata da **base do imposto**. Ele não diz se o frete **sai do resultado** quando quem paga é
a Intertec — outra linha da cascata, resolvida na §3.12 em 21/08/2026. As duas coisas são
independentes, e hoje as duas estão implementadas: o imposto pela regra do Bryan, a dedução pela
planilha.

## 3.12 A caixa "Frete destacado" manda no resultado E no imposto — RESOLVIDO em 21/08

Achado em 20/08 varrendo o caminho de fechamento com o login de cada vendedora.
**Decisão de 21/08/2026:** onde há posicionamento claro da empresa, ele vale; a planilha vale no
resto. Para o frete há posicionamento — o áudio do Bryan de 19/08 (§3.11b). Implementado no mesmo
dia, nos dois lados.

### O defeito

Na planilha, a linha **"Frete Cliente"** tem dois estados:

- **com "X"** — o frete não reduz a margem (o `N12 = −N6` cancela o `+N6`). O cliente paga.
- **em branco** — o frete **reduz a margem** (`N12 = 0`, e o `N14 = F24 − SOMA(N6:N12)` desconta o
  frete inteiro). Quem paga o transporte é a Intertec.

No sistema o segundo caso não existia. `simular()` mandava `fretePorContaCliente: true` **fixo**, e
o `close_order_with_snapshots` nunca subtraía `p_freight` do `v_net`. Os dois erravam igual — por
isso o fechamento reconciliava e ninguém percebeu.

### O que mudou

A mesma caixa passa a mandar nas duas pontas:

| | Frete sai do resultado? | Imposto sobre o frete? |
|---|---|---|
| Caixa **marcada** (destacado, está na nota) | não | **sim** |
| Caixa **em branco** (não aparece na nota) | **sim** ← mudou | **não** ← regra do Bryan |

A dedução do frete vem da planilha; o imposto vem do áudio do Bryan. **A planilha ainda cobra o
imposto sobre o frete nos dois casos** — a linha `N7 = alíquota × N6` não olha o "X", e ele mesmo
disse no áudio que *"na planilha eu não consegui configurar qual é a forma correta"*. Correção lá:

```
N7 = SE(N11="X"; alíquota × N6; 0)
```

Enquanto isso, a planilha cobra `alíquota × frete` a mais em pedido não destacado — SP 14,99 ·
BA 13,33 · PR 40,38 nos orçamentos conferidos.

Os golden tests passaram a descrever as duas cascatas, no mesmo pedido-fixture:

- **T6** — a da planilha: frete de R$ 1.000,00 deduzido **e** tributado em 162,50. Inalterado; só
  ganhou `tributarFreteInformado: true` explícito na entrada.
- **T14c** (novo) — a da empresa: o mesmo frete deduzido e **não** tributado. RL 10.222,00.

Alterado em `app/lib/sim/params.ts` e na migração
`20260821120000_frete_nao_destacado_sai_do_resultado.sql`, na mesma entrega. Os dois TÊM de andar
casados: o fechamento recusa o pedido quando os totais da tela não reconciliam com os do banco.

Sete testes que travavam o comportamento antigo foram reescritos (`fixture-patricia`, `snapshot`,
`fluxo-do-vendedor`). Nenhum golden test precisou mudar — o T6 já dizia o certo desde sempre.

### O ORC-2026-0041 depois da mudança

O orçamento do Oclusor (700 un a R$ 3,60, BA, frete R$ 82,00 em branco) passa a dar **41,94%**
contra os 41,46% da planilha. Bate linha a linha em receita, imposto, DIFAL e comissão; a única
diferença é o imposto sobre o frete — 13,325 na planilha, zero aqui, pela regra do Bryan. Travado em
teste (`tests/calc/frete-destacado.test.ts`).

### Os 11 pedidos já fechados com margem otimista

Snapshot é imutável (Decisão D7), então nada mudou retroativamente. Mas ficam registrados:

| Pedido | Cliente | UF | Frete | Margem gravada | Só descontando o frete | Diferença |
|---|---|---|---|---|---|---|
| ORC-2026-0010 | INSTITUTO DR JOSE CARLOS PORTELA | MA | 380,00 | 67,25% | 51,37% | **15,88 pts** |
| ORC-2026-0008 | C & J CLINICA MEDICA | SP | 140,00 | 61,54% | 51,18% | 10,36 pts |
| ORC-2026-0016 | JEFFERSON FREIRE CARDOSO | SP | 80,00 | 60,83% | 51,29% | 9,54 pts |
| ORC-2026-0013 | LUIZ FERNANDO NERY | SP | 60,00 | 70,20% | 62,44% | 7,76 pts |
| ORC-2026-0020 | NUCLEO DE MICROCIRURGIA OCULAR RJ | RJ | 37,00 | 56,16% | 48,60% | 7,56 pts |
| ORC-2026-0043 | INSTITUTO DA VISAO LAGEANO | SP | 153,00 | 52,85% | 47,92% | 4,93 pts |
| ORC-2026-0006 | HOSPITAL MATA DA PRAIA | ES | 35,00 | 44,11% | 41,11% | 3,00 pts |
| ORC-2026-0011 | HOSP. OFTALMOLOGICO SANTA BEATRIZ | RJ | 195,00 | 57,81% | 55,01% | 2,80 pts |
| ORC-2026-0021 | VEROS HOSPITAL VETERINARIO | SP | 70,00 | 54,47% | 51,70% | 2,78 pts |
| ORC-2026-0014 | REDEMO SERVICOS MEDICOS | SP | 200,00 | 46,02% | 43,94% | 2,07 pts |
| ORC-2026-0022 | VEROS HOSPITAL VETERINARIO | SP | 70,00 | 54,47% | 54,13% | 0,34 pts |

Quatro deles (0008, 0016, 0043, 0020) estavam acima de 50% e passariam a ficar abaixo — ou seja,
teriam ido para aprovação em vez de fechar direto. Vale reabrir e refechar se a empresa quiser o
histórico correto; é decisão dela, e são 11 pedidos.

(A coluna do meio isola só o efeito da dedução do frete; o imposto sobre o frete já era cobrado
antes e continua sendo nesses pedidos, todos com a caixa em branco — ali a mudança do imposto joga a
favor e devolve `alíquota × frete`.)

### Onde mora a regra, para quando ela mudar

| | arquivo | linha |
|---|---|---|
| motor | `lib/calculations/order.ts` | `baseImpostoFrete = tributar ? freteInformado : zero` |
| tela | `app/lib/sim/params.ts` | `fretePorContaCliente` e `tributarFreteInformado`, os dois = caixa |
| banco | `close_order_with_snapshots` | `v_freight_out` e `v_freight_tax` |
| conferidor da planilha | `lib/import/conferencia.ts` | `tributarFreteInformado: true` (fixo — reproduz a planilha) |

As três primeiras mudam **na mesma entrega**: o fechamento recusa o pedido quando os totais da tela
não reconciliam com os do banco. A quarta é o conferidor, que existe para apontar a diferença — ele
segue a planilha de propósito.

## 3.13 Os 4 kits do catálogo estão sem embalagem nenhuma

Achado na mesma varredura. `kit_packaging` está **vazia** — os quatro kits cadastrados têm itens mas
nenhuma linha de envelope, caixa, etiquetinha ou gráfica:

| Código | Kit | Itens | Linhas de embalagem | Custo só dos produtos | Já usado em |
|---|---|---|---|---|---|
| KC0020 | kit exclusivo | 3 | **0** | 8,8585 | 2 pedidos |
| KC0021 | KIT DIAVERUM 1 | 4 | **0** | 11,8997 | 1 pedido |
| KC0022 | KIT LUIS FERNANDO NERY | 4 | **0** | 5,5061 | 1 pedido |
| KC0023 | KIT HOSP SANTA BEATRIZ | 2 | **0** | 16,0531 | 1 pedido |

Faz sentido: todos foram criados **antes** de o formulário de embalagem funcionar (o travamento
circular corrigido em 20/08, §3.14). Cada um está barato em algo entre **R$ 1,24** (envelope + caixa
+ etiquetinha + gráfica, sem esterilização) e **R$ 2,03** (o jogo completo do "Kit Aleatório") por
unidade.

Não dá para adivinhar qual envelope cada um usa — precisa da vendedora que montou. Enquanto não for
preenchido, todo pedido com esses kits mostra margem melhor do que a real.

## 3.14 Varredura por login — 20/08

Rodei, com o JWT de cada usuária, tudo o que o simulador chama: as 15 consultas de carga, as três
RPCs de kit, a gravação da cotação, o envio para aprovação, a aprovação e o fechamento. Tudo dentro
de uma transação desfeita ao final — nada ficou gravado (conferido: 45 pedidos e 4 kits antes e
depois).

**Carga do simulador — 8 logins, 17 chamadas cada, zero erro.** Camila, Isabela, Mari, Nathalia,
Suellen, Patricia, Bryan e Giovanna recebem os 372 produtos, os 80 insumos de embalagem (com nome,
sem preço), os 4 kits, as 27 UFs e as 12 transportadoras. As cinco vendedoras têm vendedor vinculado
(`meu_vendedor()` casa por nome e casou para todas as cinco).

**Gravação e fechamento — funcionam para todas.** Testei os dois caminhos reais:

| Caminho | Camila | Suellen |
|---|---|---|
| Margem verde (52,84%) → fecha direto | ✅ fechou | ✅ fechou |
| Margem vermelha (−27,79%) → envia, Patrícia aprova, fecha | ✅ fechou | ✅ fechou |

O custo da embalagem vem certo do servidor para o perfil Comercial (era o problema da Suellen em
19/08): envelope 0,82836, caixa 9,9813÷30 = 0,33271, etiquetinha 0,00896, gráfica 0,066.

**As barreiras que apareceram são todas propositais e com mensagem clara:**

- "Preencha a transportadora antes de enviar para aprovação."
- "Seu perfil não tem permissão para aprovar pedidos" (Comercial tentando aprovar).
- "Esta cotação não está aguardando aprovação" (aprovar um rascunho).
- "Pedido precisa estar aprovado antes do fechamento".

**Uma armadilha de canto, sem efeito prático hoje:** um pedido de margem VERDE que tenha sido enviado
para aprovação não fecha mais sozinho — a auto-aprovação por margem exige `approval_status =
'rascunho'`. Na tela isso não acontece, porque só pedido vermelho ou amarelo é enviado. Fica anotado
caso a régua de aprovação mude.

## 3.13 A planilha mudou 12 preços de insumo em 20/08 — o banco não recebeu

Achado em 21/08 conferindo o orçamento **CENTRO DA VISAO / DF / Camila**.

Comparando a planilha de hoje com a de ontem, **202 dos 358 produtos mudaram de CMV**, todos para
baixo. A causa está em 12 insumos:

| Insumo | Sistema | Planilha hoje | Diferença | Data na planilha |
|---|---|---|---|---|
| Bobina Laminado m² | 1,464300 | 1,298250 | −0,166050 | 04/05/2026 |
| Bobina SMS 30 gr m² | 0,784800 | 0,654000 | −0,130800 | 04/05/2026 |
| Bobina TNT Branco 40gr m² | 0,895600 | 0,756400 | −0,139200 | 04/05/2026 |
| Bobina TNT Branco 30gr m² | 0,671700 | 0,567300 | −0,104400 | 04/05/2026 |
| Bobina TNT Azul 40gr m² | 0,940000 | 0,854400 | −0,085600 | 04/05/2026 |
| Bobina TNT Azul 30gr m² | 0,705000 | 0,640800 | −0,064200 | 04/05/2026 |
| **Linha** | 57,610000 | **61,280500** | **+3,670500** | **20/08/2026** |
| Campo com Fenestra TNT GR 40 1,40 x 2,00 | 1,994745 | 1,684709 | −0,310036 | 10/03/2026 |
| Campo com Fenestra TNT GR 30 1,40 x 2,00 | 1,496059 | 1,263532 | −0,232527 | 10/03/2026 |
| Campo com Fenestra TNT GR 40 1,40 x 0,60 | 0,598424 | 0,505413 | −0,093011 | 10/03/2026 |
| Campo com Fenestra TNT GR 30 1,40 x 0,60 | 0,448818 | 0,379060 | −0,069758 | 10/03/2026 |
| Perneira | 2,697786 | 2,425796 | −0,271990 | 10/03/2026 |

Os quatro "Campo com Fenestra" e a Perneira são intermediários que derivam das bobinas — caíram por
consequência. **A mudança de raiz são as 6 bobinas e a Linha.**

⚠️ **Só a Linha teve a "Data atualização" mexida** (20/08/2026). As seis bobinas continuam marcadas
com 04/05/2026 e os intermediários com 10/03/2026, embora os valores tenham mudado. Ou a data não
foi atualizada junto, ou a edição ainda está em andamento — **precisa de confirmação antes de
espelhar no banco.**

### O efeito no orçamento CENTRO DA VISAO (DF, frete R$ 300,00 destacado)

| | Sistema | Planilha |
|---|---|---|
| Receita (600 × 7,40) | 4.440,00 | 4.440,00 |
| (−) Imposto sobre o frete (16,25% × 300) | 48,75 | 48,75 |
| (−) Imposto sobre a venda (16,25% × 4.440) | 721,50 | 721,50 |
| (−) DIFAL DF (13% × 4.740) | 616,20 | 616,20 |
| (−) Comissão (2,5% × 4.740) | 118,50 | 118,50 |
| **Receita líquida** | **2.935,05** | **2.935,05** |
| CMV unitário | **2,448351394** | **2,263432076** |
| (−) CMV total | **1.469,01** | **1.358,06** |
| **Margem** | **49,95%** 🟡 | **53,73%** 🟢 |

**A cascata bate à perfeição — as cinco linhas de dedução são idênticas, incluindo o imposto sobre o
frete (a aba `Camila` já foi corrigida para `alíquota × F24`).** A única diferença é o CMV:
R$ 110,95, que é `0,184919 × 600`.

É esta a explicação de "no simulador a margem está dando menor que na planilha": não é fórmula, é
**base de custo desatualizada**. E o efeito é grande — 3,78 pontos neste pedido, o bastante para
trocar o selo de Verde para Amarelo e mandar o pedido para aprovação.

### O que precisa ser feito

Espelhar os 12 preços em `inputs`. Não foi feito ainda porque muda o CMV de 202 produtos em produção
de uma vez, e as datas não confirmam a edição. Depende da resposta do Bryan.

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
