# 05 — Relatório de Reconciliação da Planilha

> Gerado em 2026-07-07 a partir de `c5e212f9-C_pia_de_Rentabilidade_2026.xlsx` pelo script `scripts/reconcile.ts`.
> Recálculo dos CMVs pelo motor puro (lib/calculations) comparado com a coluna "Input" da Alocação.
> Tolerância: R$ 0,01. Nada foi alterado na planilha nem gravado no banco (opção A).

## 1. Resumo

Comparamos **três CMVs** por produto: o do nosso motor (modelo preço × quantidade),
o que a planilha calcula na coluna "Custo", e o que a Alocação usa na coluna "Input".

| Métrica | Valor |
|---|---|
| Insumos lidos | 85 |
| Produtos no Input Preço | 325 |
| ✅ Reconciliam perfeitamente (motor = Alocação ≤ R$ 0,01) | 252 |
| 🟡 Ficha com fórmula especial (planilha OK, modelo uniforme não reproduz) | 45 |
| 🔴 Lookup divergente (coluna Custo ≠ Alocação — bug de nome/SUMIF) | 7 |
| Produtos sem linha na Alocação (nome exato) | 21 |
| — dos quais recuperáveis só por grafia | 5 |
| Nomes na Alocação sem bloco no Input | 18 |
| Nomes de produto duplicados (Input) | 3 |
| Nomes de produto duplicados (Alocação) | 1 |
| Insumos com preço sem imposto inconsistente (Camada 1) | 0 |

## 2. Alocação de despesa — consistente ✅

Desconsiderando a linha de resumo "TOTAL" (que não é um produto), a alocação fecha certo:

| Métrica | Valor na planilha | Esperado |
|---|---|---|
| Produtos na Alocação | 322 | 322 (Calc.md) |
| Σ produção × fator (soma dos pesos) | 14445616 | 14.445.616 (Calc.md) |
| Σ participações | 100.00% | 100% |
| Σ despesa alocada | R$ 450000.00 | R$ 450.000 |

Não há o "dobro" que se suspeitou numa primeira leitura: aquilo foi efeito de contar a
linha "TOTAL" da planilha como se fosse um produto. Somando só os 322 produtos, a soma dos
pesos é exatamente 14.445.616 e a despesa rateada, R$ 450.000 — batendo com o Calculations.md.
Permanece em aberto apenas se os **R$ 450.000 são mensais ou anuais** (Decisão D3).

## 3. Fichas com fórmula especial (🟡 modelo a ajustar na importação)

Aqui a planilha está **correta** (a coluna Custo bate com a Alocação), mas o modelo
simples "preço × quantidade" não reproduz o valor. Motivo descoberto: em alguns
insumos caros (ex.: **3M Flexform**, tapes) a planilha coloca o custo já pronto na
célula de quantidade (`=DF5`) em vez de multiplicar pelo preço. Estes produtos
precisarão que a ficha técnica registre a expressão real do consumo (Calculations.md §3).

| Produto | CMV motor (uniforme) | Custo planilha | Alocação | Custo=Alocação? |
|---|---|---|---|---|
| Campo de Mesa 1,50 x 1,50 + Tape 50cm | 775.81 | 3.97 | 3.97 | sim ✓ |
| Campo de Mesa 1,50 x 1,50  + Tape 50cm Não Estéril | 774.89 | 3.05 | 3.05 | sim ✓ |
| Campo de Mesa 1,50 x 1,50 + Tape 1m | 1548.06 | 4.40 | 4.40 | sim ✓ |
| Campo de Mesa 1,50 x 1,50  + Tape 1m Não Estéril | 1547.14 | 3.47 | 3.47 | sim ✓ |
| Campo de Mesa 1,50 x 1,50 + Tape 1m | 39.25 | 4.40 | 4.40 | sim ✓ |
| Campo de Mesa 2,00 x 3,00 com Fenestra + Tape 40cm | 22.70 | 8.76 | 8.76 | sim ✓ |
| Campo de Mesa 2,00 x 3,00 com Fenestra + Tape 40cm Não Estéril | 21.28 | 7.34 | 7.34 | sim ✓ |
| Campo de Mesa 0,70 x 0,70 + Tape 10cm Superior e Inferior | 8.41 | 1.45 | 1.45 | sim ✓ |
| Campo de Mesa 0,70 x 0,70 + Tape 10cm Superior e Inferior Não Estéril | 7.72 | 0.75 | 0.75 | sim ✓ |
| Avental Gineco | 1.63 | 1.62 | 1.62 | sim ✓ |
| Avental Gineco Não Estéril | 1.52 | 1.50 | 1.50 | sim ✓ |
| Campo Simples 1,50 x 1,50 + Tape 50cm GR40 | 19.82 | 2.40 | 2.40 | sim ✓ |
| Campo Simples 1,50 x 1,50 + Tape 50cm Não Estéril GR40 | 19.42 | 1.99 | 1.99 | sim ✓ |
| Campo Simples 1,50 x 1,50 + Tape 50cm GR30 | 19.66 | 2.24 | 2.24 | sim ✓ |
| Campo Simples 1,50 x 1,50 + Tape 50cm Não Estéril GR30 | 19.26 | 1.84 | 1.84 | sim ✓ |
| Campo Simples 1,00 x 1,60 + Tape 50cm GR40 | 19.37 | 1.94 | 1.94 | sim ✓ |
| Campo Simples 1,00 x 1,60 + Tape 50cm Não Estéril GR40 | 18.97 | 1.54 | 1.54 | sim ✓ |
| Campo Simples 1,00 x 1,60 + Tape 50cm GR30 | 19.26 | 1.83 | 1.83 | sim ✓ |
| Campo Simples 1,00 x 1,60 + Tape 50cm Não Estéril GR30 | 18.85 | 1.43 | 1.43 | sim ✓ |
| Campo Simples 1,50 x 1,80 + Tape 1,5m GR40 | 56.33 | 4.06 | 4.06 | sim ✓ |
| Campo Simples 1,50 x 1,80 + Tape 1,5m Não Estéril GR40 | 55.42 | 3.15 | 3.15 | sim ✓ |
| Campo Simples 1,50 x 1,80 + Tape 1,5m GR30 | 56.14 | 3.87 | 3.87 | sim ✓ |
| Campo Simples 1,50 x 1,80 + Tape 1,5m Não Estéril GR30 | 55.24 | 2.96 | 2.96 | sim ✓ |
| Campo Lateral 1,00 x 1,60 | 52.10 | 3.31 | 3.31 | sim ✓ |
| Campo Lateral 1,00 x 1,60 Não Estéril | 51.09 | 2.30 | 2.30 | sim ✓ |
| Campo Inferior 1,60 x 2,00 | 21.53 | 4.11 | 4.11 | sim ✓ |
| Campo Inferior 1,60 x 2,00 Não Estéril | 20.08 | 2.65 | 2.65 | sim ✓ |
| Campo Superior 1,60 x 2,60 | 22.31 | 4.89 | 4.89 | sim ✓ |
| Campo Superior 1,60 x 2,60 Não Estéril | 20.74 | 3.32 | 3.32 | sim ✓ |
| Campo Lateral Laminado 1,00 x 1,60 | 52.85 | 4.06 | 4.06 | sim ✓ |
| Campo Lateral Laminado 1,00 x 1,60 Não Estéril | 51.84 | 3.06 | 3.06 | sim ✓ |
| Campo Inferior Laminado 1,60 x 2,00 | 23.04 | 5.61 | 5.61 | sim ✓ |
| Campo Inferior Laminado 1,60 x 2,00 Não Estéril | 21.58 | 4.16 | 4.16 | sim ✓ |
| Campo Superior Laminado 1,60 x 2,60 | 24.27 | 6.85 | 6.85 | sim ✓ |
| Campo Superior 1,60 x 2,60 Laminado Não Estéril | 22.70 | 5.28 | 5.28 | sim ✓ |
| Campo 1,60 x 2,00 Fenestra U | 39.32 | 4.47 | 4.47 | sim ✓ |
| Campo 1,60 x 2,00 Fenestra U Não Estéril | 37.92 | 3.07 | 3.07 | sim ✓ |
| Campo 1,60 x 2,00 Laminado Fenestra U | 40.83 | 5.98 | 5.98 | sim ✓ |
| Campo 1,60 x 2,00 Laminado Fenestra U Não Estéril | 39.43 | 4.58 | 4.58 | sim ✓ |
| Bota | 29.82 | 1.94 | 1.94 | sim ✓ |
| Bota Não Estéril | 29.31 | 1.43 | 1.43 | sim ✓ |
| Perneira | 24.83 | 3.92 | 3.92 | sim ✓ |
| Perneira Não Estéril | 23.82 | 2.91 | 2.91 | sim ✓ |
| Campo Com Fenestra 0,80 x 0,80 + Tape 20cm GR40 | 8.07 | 1.10 | 1.10 | sim ✓ |
| Avental TNT Sem Manga Tam Especial Não Estéril Descpro | 1.96 | 2.29 | 2.29 | sim ✓ |

## 3b. Lookup divergente (🔴 coluna Custo ≠ Alocação)

Aqui nem a planilha é consistente: o CMV que a Alocação usa difere do que o bloco
calcula — sintoma de nome duplicado/errado no SUMIF (Calculations.md §9.3).

| Produto | Custo planilha | Alocação (Input) | Diferença |
|---|---|---|---|
| Avental EGG | 5.52 | 6.18 | -0.65 |
| Avental Laminado Não Estéril | 4.47 | 5.13 | -0.66 |
| Campo Com Adesivo 0,80 x 0,80 Não Estéril GR40 | 1.06 | 1.02 | 0.04 |
| Campo Com Adesivo 0,80 x 0,80 Não Estéril GR30 | 1.02 | 1.56 | -0.55 |
| Campo Com Fenestra 0,80 x 0,80 + Tape 20cm Não Estéril GR40 | 0.62 | 0.58 | 0.04 |
| Campo Com Fenestra 0,80 x 0,80 + Tape 20cm GR30 | 1.05 | 0.62 | 0.43 |
| Campo Com Fenestra 0,80 x 0,80 + Tape 20cm Não Estéril GR30 | 0.58 | 1.05 | -0.48 |

## 4. Produtos sem CMV por divergência de nome

Na planilha, estes produtos retornam **CMV zero em silêncio** (o SUMIF por nome não acha a linha).
No sistema, a busca será por ID e CMV = 0 é erro bloqueante — a classe de erro é extinta por design.

### Só diferem na grafia (mesmo produto, nome escrito diferente):

| Nome no Input Preço | Nome na Alocação |
|---|---|
| `Campo de Mesa 1,50 x 1,50 + Tape 1m Não Estéril` | `Campo de Mesa 1,50 x 1,50  + Tape 1m Não Estéril` |
| `Campo Simples 1,00 x 1,40 GR40` | `Campo SImples  1,00 x 1,40 GR40` |
| `Campo Simples 1,00 x 1,40 GR40 Não Estéril` | `Campo SImples  1,00 x 1,40 GR40 Não Estéril` |
| `Campo Simples 1,00 x 1,40 GR30` | `Campo SImples  1,00 x 1,40 GR30` |
| `Campo Simples 1,00 x 1,40 GR30 Não Estéril` | `Campo SImples 1,00 x 1,40 GR30 Não Estéril` |

### Sem correspondência nem por grafia (produto realmente ausente da Alocação):

- `Campo de Mesa 0,70x0,70`
- `Campo de Mesa 0,70x0,70 Não Estéril`
- `Campo de Mesa 1,50 x 1,50 Não Estéril`
- `Campo Com Adesivo 1,00 x 1,20 Não Estéril GR`
- `Campo Com Adesivo 0,50 x 0,50 Não Estéril G40`
- `Campo Com Adesivo 0,80 x 0,40 GR40`
- `Campo Com Adesivo 0,80 x 0,40 GR30`
- `Campo Com Fenestra 1,00 x 1,20 GR4`
- `Kit Odonto Pério não Estéril`
- `Campo Catarata 1,00 x 1,40 GR30`
- `Campo Catarata 1,00 x 1,40 GR30 Não Estéril`
- `Campo Com Adesivo 1,00 x 1,20 Não Estéril GR`
- `Campo Com Adesivo 0,50 x 0,50 Não Estéril G40`
- `Campo Catarata 1,00 x 1,40 GR30 China`
- `Campo Catarata 1,00 x 1,40 GR30 Não Estéril China`
- `Avental TNT Sem Manga Tam Especial Descpro`

## 5. Nomes duplicados

Duplicatas causam custo somado (dobrado) no SUMIF das abas de vendedor — Calculations.md §9.3.

| Origem | Nome | Ocorrências |
|---|---|---|
| Input | Campo de Mesa 1,50 x 1,50 + Tape 1m | 2 |
| Input | Campo Com Adesivo 1,00 x 1,20 Não Estéril GR | 2 |
| Input | Campo Com Adesivo 0,50 x 0,50 Não Estéril G40 | 2 |
| Alocação | Campo de Mesa 2,00 x 2,00 Não Estéril | 2 |

## 6. Camada 1 — preço sem imposto

Todos os preços sem imposto recalculados batem com a coluna G da planilha dentro de R$ 0,01. ✅

## 7. Itens para confirmação humana (antes de gravar no banco)

1. **R$ 450.000 é mensal ou anual?** (define o período de alocação — Decisão D3)
2. **Alocação dobrada** (Seção 2): confirmar o denominador correto com o financeiro.
3. **DIFAL de AL, MA, PI, RN** (Decisão D5): valores finais mantidos como estão, a confirmar com o contador.
4. **Descpro**: migração de 10% fixo para a tabela ICSM por UF (Decisão D4) — impacto a quantificar.
