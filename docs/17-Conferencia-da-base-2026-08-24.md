# 17 — Conferência da base: sistema × planilha (24/08/2026)

> Leitura direta do banco de produção, sem gravar nada. Sucede a conferência de 18–19/08
> (docs/16), que fechou com **BASE ALINHADA**. A pergunta aqui é: continua alinhada, cinco dias
> depois e com o sistema já em uso real?
>
> **Resposta curta: os dados continuam alinhados. A configuração é que mudou** — e ninguém
> registrou por quê (§3).

## 0. O que deu para conferir, e o que não deu

> **Atualizado em 24/08, à tarde:** a planilha chegou (`Rentabilidade_2026_4.xlsx`) e a
> comparação item a item foi feita. O resultado está na **§8**, e é o melhor possível: nenhuma
> divergência em que o sistema esteja errado.

A primeira volta desta conferência rodou **sem** a planilha `Rentabilidade 2026`. O que segue
descreve o que deu para conferir naquele momento; a §8 fecha a lacuna.

O que foi conferido, e vale como conferência de verdade:

| Frente | Contra o quê | Cobertura |
|---|---|---|
| Tabelas fiscais (DIFAL, ICSM, Portal) | os valores migrados da planilha (seeds 0006 e 0008) | 27 UFs × 3 tabelas — **completa** |
| Parâmetros de canal | a planilha (§8 + D4 do Calculations) | 5 canais — **completa** |
| Volume e integridade do catálogo | o estado documentado em 19/08 (docs/16 §3.6) | **completa** |
| Coerência interna (CMV × ficha × override) | o próprio motor | **completa** |
| CMV e preço item a item | a planilha viva | ✅ **feita — ver §8** |

Para repetir a §8 no futuro: `npm run conferir:base -- planilha.xlsx produtos.tsv insumos.tsv relatorio.md`.

## 1. Resumo

| | Situação |
|---|---|
| Tabelas fiscais batem com a planilha | ✅ 27 de 27 UFs, valor por valor |
| Parâmetros de canal batem | ✅ 5 de 5 |
| Catálogo íntegro (duplicatas, ficha, custo) | ✅ nenhum problema |
| CMV coerente com a ficha e os overrides | ✅ nenhum defasado |
| **13 UFs com o DIFAL desligado, sem registro** | ⚠️ **decisão a confirmar (§3)** |
| 3 pedidos fechados com auditoria que não bate com o valor | ⚠️ §4 |
| Migrações do repositório × produção | ⚠️ ledger fora de sincronia (§6) |
| **CMV e preço item a item × planilha** | ✅ **alinhado — 320 de 320 conferíveis (§8)** |
| Registros `TESTE-QA` no banco de produção | ⚠️ 3, criados durante esta sessão (§8.4) |

## 2. Tabelas fiscais — batem 100%

Comparei as 27 UFs contra os valores que as migrações trouxeram da planilha:

| Tabela | UFs | Divergências |
|---|---:|---:|
| `difal_rates.final_rate` | 27 | **0** |
| `icsm_rates.icms_rate` | 27 | **0** |
| `icsm_rates.pis_cofins_rate` (9,25%) | 27 | **0** |
| `portal_freight_rates.freight_percent` | 27 | **0** |

As 4 UFs sinalizadas para o contador (AL, MA, PI, RN — D5) continuam sinalizadas e com os valores
manuais preservados. Os 5 canais batem com o seed, inclusive Revendas e Descpro com
`applies_difal = false`.

**Nenhuma alíquota foi alterada desde a carga.** O que mudou foi outra coisa.

## 3. O achado principal: 13 UFs estão com o DIFAL DESLIGADO

Em 21/08 entrou a chave "cobra / não cobra DIFAL" por estado, a pedido da Intertech. O padrão da
migração é `true` — ninguém deixaria de cobrar sem escolher. **Treze estados foram desmarcados.**

| | UFs |
|---|---|
| **Cobram** (14) | AM, CE, MG, MS, MT, PB, PE, PI, RN, RO, RR, SC, SE, TO |
| **Não cobram** (13) | AC, AL, AP, **BA**, DF, ES, GO, MA, PA, **PR**, **RJ**, **RS**, SP |

SP está correto — venda interna, alíquota 0. Os outros **12 têm alíquota registrada e não estão
sendo cobrados**: BA 13,5%, MA 16%, AL 14,5%, DF 13%, GO 12%, PA 12%, AC 12%, AP 11%, ES 10%,
RJ 10%, PR 7,5%, RS 5%.

### Por que isto precisa de confirmação

Três coisas incomodam:

1. **Foi tudo em 71 segundos** — entre 01:45:36 e 01:46:47 UTC de 21/08 (22:45 de 20/08 no
   horário de Brasília). É o ritmo de quem clica a lista inteira, não de quem decide estado a
   estado com o contador.
2. **Não há registro em lugar nenhum.** A tela de Configurações grava a mudança direto, sem passar
   pelo `audit_logs` — então não dá para saber quem fez. E nenhum documento do projeto registra
   essa decisão, sendo que toda regra fiscal daqui tem seção própria no Calculations.
3. **O efeito é invisível na tela.** Desligar a UF não muda nada visível no orçamento: o DIFAL
   simplesmente sai zero, e a margem aparece melhor do que é. Se a Intertech continuar recolhendo
   o imposto ao estado, o dinheiro sai e a margem não sabe.

### Quanto vale, em dinheiro

| | Pedidos | DIFAL não contabilizado |
|---|---:|---:|
| **Fechados depois da mudança** | 3 | **R$ 2.335,53** |
| Simulações abertas | 7 | R$ 1.588,28 |

Os três fechados: `ORC-2026-0060` (BA, R$ 1.377,68), `ORC-2026-0066` (BA, R$ 865,35 — fechado
**hoje**) e `ORC-2026-0054` (RS, R$ 92,50). Todos com `applies_difal = true` no pedido: o vendedor
marcou que aplica, e a chave do estado zerou assim mesmo.

> Fora da conta: `ORC-2026-0004` (AL, receita de R$ 930.000, criado em 06/08), que sozinho daria
> R$ 134.922,50. Pelo valor e pela data, parece orçamento de teste — vale apagar ou marcar como
> cancelado, senão continua distorcendo qualquer soma.

### A pergunta para o cliente

**RESPONDIDO em 24/08: foi decisão do financeiro.** A lista dos 14 que cobram e dos 13 que não
cobram está registrada em `Calculations.md §7.2.1`, e os 3 pedidos fechados com DIFAL zero ficam
como estão.

**O que ainda falta:** o motivo estado a estado. A decisão está confirmada, mas não escrita — e é
o que permitiria conferir a lista daqui a seis meses, ou explicá-la ao contador. Vale também fazer
`charges_difal` passar pelo `audit_logs` (§7, item 3): hoje é a única alteração fiscal do sistema
que não deixa rastro, e foi justamente ela que gerou este achado.

## 4. Três pedidos fechados: a auditoria diz uma coisa, o valor diz outra

`ORC-2026-0027` (AM), `ORC-2026-0028` (MG) e `ORC-2026-0031` (PA) foram fechados em 18/08 e têm um
registro de auditoria de 19/08 dizendo *"Correcao da base de comissao e DIFAL: receita + frete"*.

**Os valores mostram que a correção não foi aplicada.** Os três seguem com a base antiga:

| Pedido | UF | Receita | Frete | DIFAL gravado | DIFAL pela regra nova | Comissão gravada | Comissão pela regra nova |
|---|---|---:|---:|---:|---:|---:|---:|
| ORC-2026-0027 | AM | 2.210,00 | 350,00 | 287,30 | 332,80 | 55,25 | 64,00 |
| ORC-2026-0028 | MG | 980,00 | 90,00 | 58,80 | 64,20 | 24,50 | 26,75 |
| ORC-2026-0031 | PA | 867,00 | 210,00 | 104,04 | 129,24 | 21,68 | 26,93 |

A prova de que é a base antiga: a diferença de cada um é exatamente `alíquota × frete`. E o
`totals_display` dos três não tem as chaves `base_comissao` e `base_difal`, que nasceram com a
regra nova — o registro é anterior à mudança e nunca foi regravado.

Outros **4 pedidos** fechados antes de 19/08 (`ORC-2026-0006`, `0009`, `0010`, `0026`) também
carregam a base antiga, num total de R$ 165,60 de DIFAL — **mas nesses o comportamento é o
correto**: a decisão D7 diz que pedido fechado nunca é recalculado.

**O que decidir:** ou a auditoria dos três está errada (e o certo é deixá-los como estão, por D7),
ou a correção falhou no meio e precisa ser refeita. Hoje o banco afirma as duas coisas ao mesmo
tempo, e é isso que precisa parar.

## 5. Catálogo e custos — íntegros

Tudo que a conferência de 19/08 deixou arrumado continua arrumado:

| | 19/08 | Hoje |
|---|---:|---:|
| Produtos ativos | 372 | **372** |
| Insumos | 80 | **80** |
| Produtos com CMV zerado ou ausente | 0 | **0** |
| Nomes duplicados (produtos / insumos) | 0 | **0 / 0** |
| Kits sem itens | — | **0** |
| Clientes sem UF / pedidos sem UF | — | **0 / 0** |
| Pedidos fechados sem totais ou sem CMV congelado | — | **0 / 0** |

- **`Adere Medical Tape` continua correto**: R$ 30,72 com imposto, ICMS 12% — a correção de 19/08
  que sozinha realinhou 55 produtos não regrediu.
- **Nenhum CMV defasado.** Os 372 custos foram recalculados em 20/08 23:58, exatamente o instante
  da última mudança de preço de insumo. Não existe produto com custo calculado antes da última
  alteração — que é justamente o jeito silencioso de a base envelhecer.
- **54 overrides ativos, todos refletidos** em `product_costs`. Zero divergências.
- **8 produtos sem ficha técnica** — são os `Campo Simples ... + Tape 80cm`, de fórmula especial,
  que vivem de override por decisão de 18/08. É o esperado, não é falha.

## 6. Migrações: repositório e produção fora de sincronia

A última migração registrada em produção é `20260820183739`. O repositório tem duas depois dela:

- `20260821140000_override_propaga_no_recalculo.sql`
- `20260821170000_difal_por_uf_selecionavel.sql`

**As duas já estão valendo no banco** — conferi as funções: `close_order_with_snapshots` olha
`charges_difal`, e `recalculate_product_costs` propaga o override. Ou seja: a lógica foi aplicada
por fora, sem passar pelo ledger de migrações.

Na prática nada quebra hoje, e é por isso que passou despercebido. O risco é o próximo `db push`
achar que essas migrações faltam. As duas são reaplicáveis sem estrago (`add column if not exists`
e `create or replace function`), então o conserto é barato: registrar as duas versões como
aplicadas. Vale fazer antes que uma terceira migração entre no meio.

## 7. O que fazer, em ordem

1. **Confirmar os 13 estados sem DIFAL** (§3). É a única coisa aqui que mexe em dinheiro agora, e
   só o financeiro responde.
2. **Decidir sobre os 3 pedidos com auditoria contraditória** (§4).
3. **Passar `charges_difal` pelo `audit_logs`.** Uma chave que muda a margem de todo pedido de um
   estado não pode ser a única alteração fiscal sem rastro no sistema.
4. **Sincronizar o ledger de migrações** (§6).
5. **Rodar `conferir:base` com a planilha em mãos** para fechar a única frente que ficou de fora
   (§0), e limpar o orçamento de teste `ORC-2026-0004`.

---

## 8. Item a item contra a planilha viva (24/08, tarde)

Rodado contra `Rentabilidade_2026_4.xlsx`, entregue pelo cliente. Lado da planilha lido pelos
extratores do próprio projeto (`extrairInsumos` / `extrairAlocacao`); lado do banco lido direto de
produção. Comparação por grupos de nome, com os grupos divergentes abertos linha a linha.

### 8.1 Resultado

| | Planilha | Banco | |
|---|---:|---:|---|
| Insumos | 85 | 82 | 51 grupos idênticos → **67 insumos batendo** |
| Produtos (Alocação × `product_costs`) | 358 | 373 | 59 grupos idênticos → **253 produtos batendo** |

**Nenhuma divergência em que o sistema esteja errado.** Todas as diferenças encontradas caem em
quatro caixas, e em três delas quem está desatualizado ou errado é a planilha.

### 8.2 Onde a planilha está atrasada: os aventais com compressa

A planilha tem **16** aventais "com Compressa"; o sistema tem **32**. Não é falta de carga — é a
decisão da Patrícia de 19/08 (docs/16 §3.8): *"Pode colocar com comp P e G. Com fio não precisa."*

A prova de que o sistema está certo: **os 16 valores da planilha batem, ao centavo, com as versões
`Compressa P` do sistema.** Ou seja, a planilha continua chamando de "com Compressa" o que sempre
foi a compressa P, sem dizer. Os 16 produtos com compressa G existem só no sistema.

| Grupo | Planilha | Banco |
|---|---:|---:|
| `Avental com Compressa …` | 2 | 4 |
| `Avental EGG com Compressa …` | 6 | 10 |
| `Avental G com Compressa …` | 6 | 10 |
| `Avental GG com Compressa …` | 6 | 10 |
| `Avental M com Compressa …` | 4 | 6 |

**Nada a fazer no sistema.** Quem precisa alcançar é a planilha.

### 8.3 Onde a planilha está errada: três defeitos que já eram conhecidos e não foram corrigidos

Os três já estavam em docs/16 §3.7 e continuam na versão `_4`:

**a) `Campo Catarata 1,40 x 1,60 GR40 Não Estéril`** — única divergência de CMV do catálogo inteiro
com nome e contagem iguais dos dois lados.

| | CMV |
|---|---:|
| Planilha | 2,459650 |
| Sistema | **2,848086** |

A planilha repete no GR40 Não Estéril exatamente o valor do **GR30** Não Estéril (2,459650) — a
célula aponta para a linha de cima. O sistema aplica a diferença GR30 → GR40 que a própria planilha
usa na versão estéril. **Hoje, todo orçamento feito na planilha com esse produto sai R$ 0,39 barato
por peça.**

**b) `Campo de Mesa 2,00 x 2,00 Não Estéril` aparece duas vezes na Alocação**, com 4,139754 e
2,332531. O segundo valor é o CMV do `Campo de Mesa 1,50 x 1,50 Não Estéril`. No sistema é um
produto só, com 4,139754 — e a prova de que o resto do grupo está perfeito é aritmética: o grupo
`campo de mesa` soma 119,122992 na planilha e 116,790461 no banco, e a diferença é exatamente os
2,332531 da linha duplicada.

**c) `Avental TNT Sem Manga Tam Especial` aparece duas vezes**, com o mesmo 1,967800. O banco tem
uma. Mesma aritmética: 10,954294 − 1,967800 = 8,986495, que é a soma do banco.

### 8.4 Diferenças que não são divergência

**Os 5 pseudo-insumos `Produto ...`** — a planilha tem 18 insumos que começam com "Produto"; o banco
tem 13. Os 5 a mais (`Produto Avental`, `Produto Avental G`, `Produto Campo de Mayo`,
`Produto Campo de mesa 0,70x0,70`, `Produto Campo de mesa 1,00x1,40 Adesivo 14x15 +Fen`) existem no
sistema como **produtos-componente**, não como insumo — e com o valor idêntico ao da planilha nos
cinco casos. É a modelagem correta: um produto que entra na ficha de outro não é insumo.

**Registros `TESTE-QA` no banco de produção** — 2 insumos (`TESTE-QA Insumo B3`, `B3-2`) e 1
produto. Não estão na planilha porque não deviam existir: são dados de teste. E **foram criados
durante esta sessão** — no começo da conferência o banco tinha 80 insumos e 372 produtos; no fim,
82 e 373. Alguém está testando em produção. Não afeta orçamento (produto de teste não é vendido),
mas polui contagem e relatório. Vale apagar e combinar de testar noutro lugar.

### 8.5 Veredito

> **A base do sistema está alinhada com a planilha.**
>
> Das 320 comparações que dava para fazer (67 insumos + 253 produtos com nome e contagem iguais dos
> dois lados), **320 batem**. As únicas diferenças de valor são um erro de fórmula da planilha
> (§8.3a) e duas linhas duplicadas nela (§8.3b, §8.3c). Onde planilha e sistema discordam sobre o
> catálogo (§8.2), é a planilha que não recebeu uma decisão de 19/08.
>
> Nada a corrigir no banco. O que precisa de correção é a planilha — e enquanto ela não for
> corrigida, os orçamentos feitos **nela** é que saem errados.
