# 19 — Conciliação completa: banco + motor × planilha (01/09/2026)

> Planilha viva do Drive, baixada em 01/09/2026 às 21:53 (`Rentabilidade 2026`,
> id `1qwwKGTEFWrLfxKZ6dOi-UtZXGkwiUUjQJjRq2BHXbJU`).
> Banco de produção lido só para leitura, na mesma hora.
> Nada foi gravado no banco nem alterado na planilha.

Esta é a conferência que responde à pergunta que a Intertech vai fazer antes de
abandonar a planilha: **o sistema tem os mesmos números?**

São três perguntas diferentes, e as três foram feitas:

| Camada | Pergunta |
|---|---|
| Tabelas fiscais | as alíquotas do banco são as da planilha? |
| Base | insumos e produtos têm o mesmo custo nos dois? |
| Motor | a conta do sistema dá o mesmo resultado da planilha? |

---

## 1. Tabelas fiscais — batem inteiras

Comparação valor a valor, sem exceção.

| Tabela | Planilha | Banco | Resultado |
|---|---|---|---|
| ICSM (PIS/COFINS + ICMS) | 27 UFs | 27 UFs | **idênticas** |
| DIFAL (Pobreza + Alíquota + Final) | 26 UFs | 27 UFs | **idênticas nas 26** |
| Frete Portal | 27 UFs | 27 UFs | **idênticas** |

A única diferença é o banco ter **SP** na tabela DIFAL, com zero. A planilha
simplesmente não lista SP — que é venda interna e não tem DIFAL. O resultado é o
mesmo; o banco só é explícito onde a planilha é omissa.

## 2. Insumos — nenhuma divergência de valor

| | |
|---|---|
| Insumos na planilha | 85 |
| Insumos no banco | 82 |
| **Com o mesmo preço sem imposto** | **79** |
| **Com preço diferente** | **0** |

As diferenças de contagem são todas explicadas, e nenhuma é de valor:

- **1 renomeado**: `Compressa Toalha de mão` (planilha) é `Compressa Wiper/Toalha
  de mão` (banco). Mesmo preço.
- **5 pseudo-insumos** `Produto ...` que só existem na planilha: são
  intermediários que a planilha precisa criar como insumo e que no sistema são
  produtos-componente de verdade.
- **2 sobras de teste no banco**: `TESTE-QA Insumo B3` e `TESTE-QA Insumo B3-2`.
  Não são usados em produto nenhum, mas aparecem na lista de quem cadastra.
  Devem ser apagados antes da virada.

## 3. Produtos — 278 idênticos até a sexta casa decimal

A comparação foi feita por impressão digital (md5) em blocos, e depois item a
item nos blocos que não bateram.

**Cinco dos oito blocos bateram byte a byte** — 35 produtos idênticos sem uma
única diferença. No bloco C, 13 dos 20 sub-blocos também bateram inteiros.

| | |
|---|---|
| Produtos idênticos ao sexto decimal | **278** |
| Correspondentes com nome diferente e valor idêntico | **22** |
| Diferenças de arredondamento na 6ª casa | 12 |
| **Divergências reais de valor** | **6** |

### 3.1 As seis divergências reais — e em quatro delas o erro é da planilha

| Produto | Planilha | Banco | O que é |
|---|---|---|---|
| Campo Catarata 1,40 x 1,60 GR40 Não Estéril | 2,459650 | **2,848086** | a planilha repete o valor do GR30 |
| Campo Com Adesivo 0,80 x 0,80 GR30 | 1,063161 | **1,498134** | valores trocados entre si |
| Campo Com Adesivo 0,80 x 0,80 Não Estéril GR40 | 1,498134 | **1,063161** | valores trocados entre si |
| Campo de Mesa 2,00 x 2,00 Não Estéril | 2,332531 | **4,139754** | linha duplicada na Alocação |
| Compressa G | 2,668519 | 1,678668 | R$ 0,99 de diferença — **a conferir** |
| Compressa P Pacote 5 Não Estéril | 3,286240 | 3,291782 | R$ 0,0055 — **a conferir** |

O **Campo Catarata 1,40 x 1,60 GR40 Não Estéril** já tinha sido reportado em
24/08 e continua errado na planilha: ela repete o custo da versão GR30, que é
mais barata. Quem cotar esse produto pela planilha subestima o custo.

O **Campo Com Adesivo 0,80 x 0,80** tem os dois valores **trocados**: a versão
estéril GR30 está com o custo da não estéril GR40, e vice-versa.

O **Campo de Mesa 2,00 x 2,00 Não Estéril** aparece **duas vezes** na Alocação
(linhas 207 e 208), com valores diferentes.

As duas últimas ainda não têm explicação e precisam de conferência humana.

### 3.2 Duplicatas na Alocação — a planilha cobra dobrado

| Nome | Ocorrências | Efeito na planilha |
|---|---|---|
| Campo de Mesa 2,00 x 2,00 Não Estéril | linhas 207 e 208 | soma 4,139754 + 2,332531 |
| Avental TNT Sem Manga Tam Especial | linhas 50 e 52 | soma 1,967800 duas vezes |

O `SUMIF` das abas de vendedor **soma** as ocorrências. Todo pedido com esses
dois produtos sai com o custo dobrado na planilha.

### 3.3 Nomes que não casam — 22 produtos, valores corretos

Nenhum destes é divergência de custo: o produto existe nos dois lados, com o
mesmo valor, e só o nome difere.

- **16 aventais com compressa.** A planilha tem `Avental ... com Compressa`; o
  sistema tem as versões **P** e **G**, separadas pela decisão de 19/08/2026.
  Conferido: **os 16 valores da planilha batem exatamente com a versão P** do
  sistema. A planilha nunca recebeu essa decisão.
- **4 `Campo SImples  1,00 x 1,40 ...`** — erro de digitação e espaço duplo.
- **2 `Campo de Mesa 1,30 x 2,00  + Fen Bino`** — espaço duplo.

Na planilha, nome que não casa devolve **custo zero em silêncio**. No sistema a
busca é por código e custo zero é bloqueante.

## 4. Motor de cálculo — 12 abas de pedido

| | Abas |
|---|---|
| Batem no centavo | 3 |
| Divergem em alguma linha | 6 — Descpro, Mari, Externos, Revendas, Temporária Patricia, Edmilson |
| Recusadas pelo motor | 3 — Camila, Nathalia, Priscilene |

As divergências são as já mapeadas em docs/18: fórmula de comissão antiga sem o
frete (Externos, Temporária Patricia), imposto sobre a célula errada (Edmilson),
DIFAL estrutural (Revendas), alíquota do Descpro. Em nenhuma o sistema está
errado.

### 4.1 Duas cotações vivas com custo zero na planilha

**Camila e Nathalia** têm, cada uma, uma cotação de **50 unidades** do produto
escrito como `Kit Odonto Pério Estéril`. Esse nome **não existe** na Alocação —
o correto é `Kit Odonto Pério`, que está lá a R$ 8,109031, idêntico ao sistema.

Resultado: a planilha calcula essas duas cotações com **CMV zero** para o item, e
mostra margem inflada. São R$ 405,45 de custo faltando em cada uma (50 × 8,11),
sobre receitas de R$ 1.250 e R$ 1.300.

O sistema **recusa** as duas, apontando o item. É a regra T9 fazendo o trabalho.

### 4.2 O frete da Mari foi digitado por cima da fórmula

Na aba Mari (RS), o campo "Frete do Pedido" tem o número **90 digitado à mão**,
não a fórmula do Portal. A tabela Portal da planilha diz **RS = 10%**, o que
sobre R$ 450 dá **R$ 45** — exatamente o que o sistema calcula.

O frete dobrado derruba a margem daquela cotação de **23,65% para 2,04%**.

Vale registrar que a tabela Portal da planilha e a do banco são **idênticas**
(§1): o problema não é a tabela, é a fórmula que foi substituída por um número.

## 5. Veredito

**O sistema não tem divergência de valor contra a planilha em nada que a
planilha tenha certo.**

- Tabelas fiscais: idênticas.
- Insumos: zero divergência de preço.
- Produtos: 278 idênticos até a sexta casa; das 6 divergências reais, 4 são erro
  demonstrável da planilha e 2 aguardam conferência.
- Motor: onde a planilha está correta, a conta bate no centavo.

O que a conferência encontrou de errado está, quase todo, **na planilha** — e são
erros que ela comete em silêncio: nome que não casa vira custo zero, nome
duplicado vira custo dobrado, fórmula sobrescrita vira margem irreal. São
exatamente as classes de erro que o sistema extingue por construção: busca por
código em vez de nome, custo zero bloqueante, e fórmula que ninguém digita por
cima.

## 6. O que fazer antes da virada

**Na planilha** (ou simplesmente aposentá-la):
1. `Campo Catarata 1,40 x 1,60 GR40 Não Estéril` — repete o custo do GR30.
2. `Campo Com Adesivo 0,80 x 0,80` — dois valores trocados.
3. Apagar a linha duplicada de `Campo de Mesa 2,00 x 2,00 Não Estéril` e a de
   `Avental TNT Sem Manga Tam Especial`.
4. Corrigir `Kit Odonto Pério Estéril` nas abas da Camila e da Nathalia.
5. Devolver a fórmula do Portal ao frete da aba Mari.

**No sistema**:
6. Apagar os dois insumos `TESTE-QA` e o produto `TESTE-QA Produto B3`.
7. Conferir com a Intertech os dois custos sem explicação: `Compressa G`
   (R$ 0,99 de diferença) e `Compressa P Pacote 5 Não Estéril` (R$ 0,0055).
8. Levar para a planilha a decisão de P/G dos 16 aventais — ou aceitar que a
   planilha ficou para trás nesse ponto, que é o mais provável.
