# 17 — Conferência da base: sistema × planilha (24/08/2026)

> Leitura direta do banco de produção, sem gravar nada. Sucede a conferência de 18–19/08
> (docs/16), que fechou com **BASE ALINHADA**. A pergunta aqui é: continua alinhada, cinco dias
> depois e com o sistema já em uso real?
>
> **Resposta curta: os dados continuam alinhados. A configuração é que mudou** — e ninguém
> registrou por quê (§3).

## 0. O que deu para conferir, e o que não deu

A planilha `Rentabilidade 2026` **não estava disponível** nesta sessão. Sem o arquivo, o
`npm run conferir:base` não roda, e portanto **não foi possível** comparar produto a produto o CMV
e o preço de cada insumo contra a planilha viva.

O que foi conferido, e vale como conferência de verdade:

| Frente | Contra o quê | Cobertura |
|---|---|---|
| Tabelas fiscais (DIFAL, ICSM, Portal) | os valores migrados da planilha (seeds 0006 e 0008) | 27 UFs × 3 tabelas — **completa** |
| Parâmetros de canal | a planilha (§8 + D4 do Calculations) | 5 canais — **completa** |
| Volume e integridade do catálogo | o estado documentado em 19/08 (docs/16 §3.6) | **completa** |
| Coerência interna (CMV × ficha × override) | o próprio motor | **completa** |
| CMV e preço item a item | a planilha viva | ❌ **não feita — falta o .xlsx** |

Para fechar a lacuna: colocar o `.xlsx` à mão e rodar
`npm run conferir:base -- planilha.xlsx produtos.tsv insumos.tsv relatorio.md`.

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

**Desligar esses 12 estados foi decisão do financeiro, ou alguém desmarcou a lista sem querer?**

- Se foi decisão: precisa virar seção do `Calculations.md`, com o motivo por estado. Hoje é um
  parâmetro de banco que ninguém consegue explicar depois.
- Se não foi: remarcar os 12 e refazer os 3 pedidos fechados, que estão com margem melhor do que a
  real.

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
