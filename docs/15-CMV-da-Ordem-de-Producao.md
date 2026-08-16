# 15 — CMV dos pedidos da Ordem de Produção (julho e agosto/2026)

> **Versão:** 1.0 — 16/08/2026
> Pedido do cliente: calcular o CMV correto dos pedidos da planilha **Ordem de
> Produção**, usando como base de custo a planilha **Rentabilidade 2026**, e
> dizer quais abreviações dá para entender sozinho.

## 1. O problema

A Ordem de Produção é o caderno do chão de fábrica: uma linha por item, escrita
à mão, em abreviação (`200 ocl`, `catarata CH não`, `kit 2M, 2T, 1 sem fen, 1
mesa 1x1,4`). Ela não tem preço, nem código de produto — só quantidade, apelido
do produto e cliente. A Rentabilidade tem o CMV unitário dos 325 produtos, mas
pelo **nome completo do catálogo** (`Campo Catarata 1,00 x 1,20 GR40`).

Calcular o CMV da produção é, portanto, um problema de **tradução**, não de
cálculo: o cálculo em si é `CMV_unitário × quantidade`. O trabalho todo está em
saber que `catarata` é o `Campo Catarata 1,00 x 1,20 GR40`.

**Resultado de julho + agosto/2026:** 380 pedidos, 876 itens, **R$ 547.431,73**
de CMV — R$ 391.215,82 em julho e R$ 156.215,91 em agosto (a aba de agosto vai
até o dia 15).

## 2. O dicionário que saiu da própria planilha

Nada aqui foi inventado: cada regra veio de comparar como a ordem escreve com
como o catálogo escreve, e com a nomenclatura fiscal que já está em
`lib/nomenclatura/` (é de lá que sai, por exemplo, que **Tag = Toalha** e que
**Compressa Wiper = Toalha de Mão**).

| Como aparece | O que é |
|---|---|
| `catarata`, `cataratinha`, `cataratinha 80` | Campo Catarata 1,00 x 1,20 / 0,60 x 0,60 / 0,80 x 0,80 |
| `sem fen` / `com fen` / `com ades` | Campo Simples / Com Fenestra / Com Adesivo |
| `mesa`, `mayo`, `ocl`, `bino`, `mono`, `saco` | Campo de Mesa, de Mayo, Oclusor, Lasik Binocular, Lasik Monocular, Saco |
| `lat`, `sup`, `inf` | Campo Lateral, Superior, Inferior |
| `av`, `cj`, `comp G`/`comp P`, `drape G`/`drape P` | Avental, Conjunto, Compressa G/P, Steri Drape Grande/Pequeno |
| `T`, `Toalha` | Compressa Wiper (a "toalha de mão" da nota fiscal) |
| `não` | Não Estéril — **sem a palavra, o produto é estéril** |
| `CH` | origem China; `GR30`/`GR40` = gramatura; `TNT`/`SMS`/`lam` = tecido |
| `com T` | com Tag |
| `ML`, `SM`, `GO` | manga longa, sem manga, ginecológico |

**Medidas.** Um número só quer dizer campo quadrado (`80` = 0,80 x 0,80; `1,5` =
1,50 x 1,50); dois números com `x` são os dois lados (`1x1,4` = 1,00 x 1,40;
`70x1` = 0,70 x 1,00). Números a partir de 20 estão em centímetros, abaixo disso
em metros. O catálogo às vezes escreve o lado maior primeiro (`1,2x2,00` na ordem
é `Campo Simples 2,00 x 1,20` no catálogo), então a busca tenta as duas ordens.

## 3. Kits

Kit escrito com a composição (`kit 2M, 2T, 1 sem fen, 1 mesa 1x1,4`) é calculado
pela regra do `Calculations.md` §4.1:

```
CMV_kit = Σ (CMV NÃO ESTÉRIL do componente × qtd)  +  embalagem/esterilização do kit
```

O componente entra **não estéril** de propósito: o envelope e a esterilização são
**um só por kit**, não um por produto dentro dele. Somar produtos estéreis
cobraria a esterilização tantas vezes quantos itens o kit tem. É exatamente o que
as fichas de kit da própria Rentabilidade fazem — o `Kit Veterinário` usa
`Produto Avental` = 2,811423, que é o CMV do **Avental Não Estéril**.

Para a parcela de embalagem usei o valor do **"Kit Aleatório"** da própria
planilha (R$ 2,026695 = caixa + envelope 30x40 + esterilização + etiqueta +
gráfica). É uma aproximação assumida: o envelope real e o rateio real da caixa
dependem do que foi montado, e essa informação está no sistema da Intertech, não
na Ordem de Produção.

## 4. O que ficou de pé e o que não ficou

| Situação | Itens | CMV |
|---|---|---|
| **Alta** — a abreviação bate direto com um produto do catálogo | 339 | R$ 219.105,30 |
| **Média** — faltava a medida ou a gramatura; usei o padrão documentado | 364 | R$ 253.219,13 |
| **A confirmar** — leitura provável, precisa do OK do cliente | 130 | R$ 75.107,31 |
| **Sem CMV** — não deu para calcular | 43 | — |

Os 43 sem CMV são quase todos kits escritos só como `kit`, `kit 1`, `kit padrão`,
`Kit ver composição`: **a composição desses kits não existe na planilha**. Esse é
o único buraco grande, e ele não se resolve com mais engenharia reversa — precisa
do cadastro do kit de cada cliente.

O **de-para para conferência do cliente** sai de `gerar_depara.py`: uma linha por
abreviação distinta (268 nos dois meses), com o que foi entendido, o produto do
catálogo, o volume, e duas colunas em branco para a resposta. Vem com quatro
abas: as dúvidas priorizadas por impacto em R$, os kits que precisam de
composição, o de-para completo e as regras gerais de leitura.

**Perguntas em aberto para o cliente** (as três primeiras valem dinheiro):

1. Composição dos kits fixos (`kit`, `kit 1`, `kit 2`, `kit padrão`, `kit vet
   1..4`, `kit uni 1/2/6`, `kit I 40`). Nos numerados usei o kit genérico
   equivalente do catálogo como referência, o que é aproximação.
2. O que é **`BF`** (`catarata BF`, `cataratinha 80 BF`) — 9 itens, R$ 4.782.
   Não achei no catálogo nem na nomenclatura do sistema.
3. **`av sm`** é `Avental Sem Manga SMS` ou `Avental TNT Sem Manga`? E **`av
   marinho`** (12 itens, R$ 23.046) sai de qual avental — o catálogo não tem cor.
4. **`com P` / `com G`** no avental: entendi como "com Compressa" (o catálogo não
   separa o tamanho da compressa).
5. **`com B`** no conjunto (`Cj M com B`), **`inga`** e **`inv`** no drape.
6. Medidas que a produção faz e o catálogo **não tem**: `Campo Simples 1,00 x
   1,50`, `1,40 x 2,00`, `1,60 x 2,00`, `Campo Com Fenestra 0,20 x 0,20`,
   `Compressa Pacote 2`. Ou faltam produtos no catálogo, ou são apelidos de
   outros que já existem.
7. `mangueira` e `refletor` (acessórios de kit odonto) não têm ficha na
   Rentabilidade.

**Gramatura.** Quando a ordem não escreve GR30 nem GR40, assumi GR40 (é a de
maior produção estimada na Rentabilidade). Trocando para GR30 o total cai para
R$ 540.350,53 — 1,2% de diferença. Não é o ponto crítico.

## 5. Um achado sobre a base de custo

O bug do `Calculations.md` §9 item 3 continua vivo na planilha: a linha "Campo de
Mesa 2,00 x 2,00 Não Estéril" aparece **duas vezes** na Alocação Despesa, e a
segunda traz na verdade o CMV do "Campo de Mesa 1,50 x 1,50 Não Estéril", que
ficou sem linha própria. O script corrige isso ao ler o catálogo — sem a
correção, o 1,50 x 1,50 não estéril usado dentro dos kits sairia com CMV zero.

O CMV lido bate com os golden tests: `Campo Catarata 1,00 x 1,20 GR40` =
2,935400 (T3) e `Avental` = 4,043151.

## 6. Onde cada coisa mora

| Peça | Arquivo |
|---|---|
| Leitura e índice do catálogo (com a correção do §9.3) | `scripts/ordem-producao/catalogo.py` |
| Dicionário de abreviações e resolução de produto/kit | `scripts/ordem-producao/resolver.py` |
| Separação da Ordem de Produção em pedidos | `scripts/ordem-producao/pedidos.py` |
| Geração da planilha de CMV | `scripts/ordem-producao/gerar_planilha.py` |
| Geração da planilha de-para, para o cliente confirmar | `scripts/ordem-producao/gerar_depara.py` |

Isto é uma **análise avulsa**, não um módulo do produto: nenhuma tela e nenhuma
função de `lib/calculations/` foi tocada. Se o cliente aprovar o dicionário, o
caminho natural é virar um importador de verdade em `lib/import/`, com a tabela
de apelidos no banco (cada produto ganha seus apelidos) em vez de regras num
script — aí o cálculo passa a valer para qualquer mês, e não só para estes dois.
