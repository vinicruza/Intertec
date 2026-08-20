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

Digitando o frete de R$ 82,00 no sistema **do mesmo jeito** (frete da Intertec, sem marcar
"Frete destacado"), o motor devolve **41,460179%** — bate com o `0,4146017863` da planilha até a
oitava casa decimal. Não há divergência de fórmula neste pedido: há um campo que ficou em branco.

Ou seja: neste orçamento **a planilha é que dá a margem menor**, não o sistema. Com o frete lançado
no sistema, os dois ficam em 41,46% — continua no selo **Amarelo** (faixa de 40% a 50%), só que
3,7 pontos pior do que ficou gravado.

### Por que esta aba se comporta diferente das outras três conferências

A aba `Patricia` (e a `Temporaria Patricia`) **já foram corrigidas**: o imposto agora é
`alíquota × F24`, sem somar o frete. As outras **10 abas continuam com o erro** da §2.5
(`alíquota × (F24 + N6)`), e é por isso que nas conferências anteriores (Revendas/Seguemed,
HOFTALMO, OLHO CLINICA) a planilha sempre dava margem **menor** que o sistema, na proporção exata de
`alíquota × frete`.

Abas ainda com o imposto em dobro em 20/08 (reconferido na versão de hoje da planilha): `Camila`,
`Isabela`, `Suellen`, `Priscilene`, `Nathalia`, `Mari`, `Externos`, `Revendas`, `Edmilson` e
`Descpro` — esta última com a alíquota própria de 6,5% (`=$N$37*(F24+N6)`) e sem linha de DIFAL.

### O único caso em que o sistema dá margem MENOR que a planilha

É o **kit montado**. Na planilha a vendedora escolhe `Kit Aleatório`, que carrega um CMV médio fixo
(2,026695). O sistema soma o custo real dos itens que ela colocou no kit. Quando o kit real é mais
caro que a média, o sistema mostra a margem verdadeira — menor — e a planilha mostra a aproximação.
É o comportamento esperado, e é a razão de o sistema existir. Exemplos vivos em 20/08: aba `Suellen`
marca 82,11% e a aba `Priscilene` marca 51,34%, ambas com `Kit Aleatório`.

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
