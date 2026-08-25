# 18 — Conciliação dos pedidos: sistema × planilha viva (25/08/2026)

> Rodado em 25/08/2026 sobre a **planilha viva do Drive** (`Rentabilidade 2026`,
> id `1qwwKGTEFWrLfxKZ6dOi-UtZXGkwiUUjQJjRq2BHXbJU`), exportada em xlsx às 11:05,
> última alteração do cliente às 10:54 do mesmo dia.
> Comando: `npm run validar:pedidos -- "<planilha.xlsx>" relatorio.md`.
> Nada foi gravado no banco nem alterado na planilha.

Diferente das rodadas anteriores (docs/15 e docs/17), que usaram cópias baixadas, esta pegou o
arquivo **como ele está agora** no Drive. Isso muda o retrato: duas abas estavam sendo editadas
no momento da leitura.

## 1. Resultado

| | Abas |
|---|---|
| ✅ Batem no centavo, linha por linha | **6** — Isabela, Suellen, Priscilene, Patricia, Nathalia, Mari |
| 🟡 Divergem em alguma linha | **4** — Externos, Revendas, Temporária Patricia, Edmilson |
| 🔴 Recusadas pelo motor | **2** — Camila, Descpro |

**Em nenhuma das divergências o sistema está errado.** Em todas, a conta do sistema é a que
segue a regra combinada; o que diverge é fórmula velha ou fórmula quebrada na planilha. As duas
recusas são pedidos incompletos na planilha, não erro de cálculo.

Receita bruta, CMV do pedido, despesa rateada, frete, imposto sobre frete e DIFAL bateram em
**todas** as abas conferíveis. As diferenças estão concentradas em comissão e imposto sobre venda.

## 2. Melhoria desde 18/08: Revendas voltou a descontar imposto

O achado 🔴 do docs/15 §4.2 — a aba Revendas com as linhas de imposto **vazias**, inflando a
margem em ~7,5 pontos — **está corrigido na planilha viva**. A célula tem fórmula de novo
(`N8 =SUMIF(ICSM!$A:$A;$D$4;ICSM!$D:$D)*(F24)`, R$ 714,00) e bate com o sistema no centavo.
A comissão da aba também já usa a regra nova (receita + frete).

## 3. As 4 divergências, e de quem é o erro

### 3.1 Externos e Temporária Patricia — fórmula de comissão antiga 🟡

O cliente confirmou em 18/08 que **a comissão incide sobre receita + frete**, em todos os canais
(docs/15 §4.1, golden tests T16–T16d). Estas duas abas continuam com a fórmula velha:

| Aba | Fórmula na planilha | Comissão planilha | Comissão sistema | Diferença |
|---|---|---|---|---|
| Externos | `N11 =N10*$F$24` | R$ 2.671,80 | R$ 2.693,15 | R$ 21,35 |
| Temporária Patricia | `N10 =2,5%*$F$24` | R$ 0,44 | R$ 0,45 | R$ 0,02 |

Falta somar o frete (`$N$6`) dentro do parêntese, como Revendas e Edmilson já fazem.
**O sistema está certo; a planilha é que precisa ser atualizada.**

### 3.2 Externos — a alíquota de comissão ainda é somada como se fosse dinheiro 🟡

O bug do docs/15 §5.2 continua vivo. A receita líquida é `=F24-SUM(N6:N13)`, e dentro desse
intervalo está `N10 = 0,061` — que é a **alíquota**, não um valor. A planilha desconta
**R$ 0,06 a mais** por isso.

O valor é irrisório; o sintoma não é: qualquer número digitado entre N6 e N13 vira dedução
silenciosa. É o que explica a diferença de receita líquida ser R$ 21,29 e não R$ 21,35 —
os R$ 0,06 andam no sentido contrário.

### 3.3 Edmilson — dois erros da planilha ao mesmo tempo 🔴

Esta é a divergência que vale dinheiro de verdade: **R$ 2.165,50** de receita líquida e
**6,07 pontos** de margem num pedido de R$ 19.850.

**a) O imposto está sendo calculado sobre a célula errada.** A fórmula é
`N8 =SUMIF(ICSM!$A:$A;$D$4;ICSM!$D:$D)*(F44)` — usa **F44**, que não é o total do pedido
(esse é o **F24**, R$ 19.850). F44 vale R$ 4.370. Resultado: a planilha desconta R$ 710,13 de
imposto onde a BA cobra 16,25% sobre R$ 19.850, ou seja **R$ 3.225,63**. Faltam R$ 2.515,50.
É o bug do Calculations.md §9.2, ainda de pé.

**b) O estorno do frete do cliente sai pela metade.** A fórmula é
`N11 =-SUMIF(N10;"X";N6)/2` — aquele `/2` devolve **metade** do frete. Em 18/08 isso estava
dormente porque o frete da aba era zero; **agora não está**: `Frete Cliente = "x"` e frete de
R$ 700, então a planilha estorna R$ 350 em vez de R$ 700.

Os dois erros andam em sentidos opostos e se disfarçam parcialmente:

| | Sistema | Planilha | Diferença |
|---|---|---|---|
| Imposto sobre venda | R$ 3.225,63 | R$ 710,13 | R$ 2.515,50 |
| Estorno do frete do cliente | −R$ 700,00 | −R$ 350,00 | −R$ 350,00 |
| **Receita líquida** | **R$ 15.996,88** | **R$ 18.162,38** | **−R$ 2.165,50** |
| **Margem de contribuição** | **49,12%** | **55,19%** | **−6,07 pp** |

A margem que o vendedor enxerga hoje na planilha está **6 pontos acima da real**.

### 3.4 Revendas — DIFAL: diferença de estrutura, não de valor ✅

A planilha não tem linha de DIFAL na aba; o sistema aplica R$ 0,00 pela configuração de canal
(Decisão D4: revenda é venda a contribuinte). O relatório marca "linha ausente" só para deixar
claro que a estrutura difere. **Todas as outras linhas da aba batem no centavo.**

## 4. As 2 abas recusadas — pedidos incompletos na planilha

O motor recusa o que a planilha aceitava em silêncio (regra T9). Nenhuma das duas é erro de conta:

**Camila (ALEX ABDO, SP, R$ 5.097).** Os 4 itens reais estão certos. O problema é a linha 19:
alguém digitou um **`0` na célula de produto** de uma linha vazia. O SUMIF não acha produto
nenhum, o CMV volta zero, e custo zero é bloqueante. Basta **limpar a célula C19** e a aba passa
a ser conferível.

**Descpro (BA).** O pedido foi **esvaziado**: a linha 7 está com preço 0, quantidade 0 e sem
nome de produto. Não há o que comparar. Como consequência, a pergunta aberta do docs/15 §4.3 —
**Descpro é Simples 6,5% ou ICMS por UF?** — continua sem resposta, porque não há pedido vivo
na aba para medir o impacto.

## 5. Tabelas de parâmetro

Os 4 achados são os mesmos de sempre e já têm decisão tomada (D5: migrar como está, sinalizado
para o contador): AL, MA, PI e RN têm DIFAL final diferente de Pobreza + Alíquota.
Nenhum achado novo em ICSM ou Portal.

## 6. O que fazer

**Do lado da planilha** (cliente):
1. **Edmilson**: trocar `F44` por `F24` na fórmula do imposto e tirar o `/2` do estorno de frete.
   É o único item com impacto financeiro relevante.
2. **Externos** e **Temporária Patricia**: somar o frete na comissão (`=2,5%*($F$24+$N$6)`).
3. **Externos**: tirar a alíquota `N10` de dentro do intervalo somado na receita líquida.
4. **Camila**: limpar o `0` da célula C19.

**Do lado do sistema**: nada a corrigir. As três perguntas de negócio que seguem abertas são as
mesmas do docs/15 §7 — e uma delas ficou sem base de medição nesta rodada:

| Pergunta | Situação |
|---|---|
| Comissão incide sobre o frete? | ✅ respondida em 18/08 (sim, todos os canais) |
| Revenda paga imposto sobre a venda? | ✅ resolvida na prática — a planilha voltou a descontar (§2) |
| Descpro é Simples 6,5% ou ICMS por UF? | ⏳ aberta, e sem pedido vivo para medir (§4) |

## 7. Observação sobre conferir a planilha viva

Vale repetir contra o Drive, e não contra cópia baixada — foi assim que apareceram o estorno de
frete pela metade (que estava dormente) e as duas abas em edição. Mas o retrato é de um instante:
a planilha mudou às 10:54 e foi lida às 11:05. Uma aba em meio a uma digitação aparece como
"recusada", e isso é ruído, não defeito.

---

## 8. Adendo (25/08, à tarde) — o DIFAL, e a única divergência que sobrava

Depois desta conferência, a vendedora mandou o pedido da **CLINICA DR LUIZ MADEIRA** (aba Isabela,
PA) impresso da planilha, e a mesma tela no sistema. Os dois não batiam:

| | Planilha | Sistema | |
|---|---|---|---|
| DIFAL | R$ 145,80 | R$ 0,00 | ⚠️ |
| Receita líquida | R$ 641,39 | R$ 787,19 | |
| Margem | 51,49% | **60,48%** | 9 pontos |

Todas as outras linhas eram idênticas. A diferença inteira era o DIFAL, zerado pela chave por UF
que entrou em 21/08 — o achado do docs/17 §3, agora com preço.

**A cliente ditou a regra (áudio de 25/08):** o PA "realmente não tem essa cobrança", mas ela
"precisa entrar no cálculo, mas não pode ser destacada". É "quase a mesma situação do frete —
destacado e não destacado": os estados sinalizados a Intertech já paga, e saem destacados; os não
sinalizados não estão sendo cobrados **neste momento**, mas a cobrança pode vir a qualquer hora,
então continuam deduzidos da margem.

Ou seja: **a chave era de destaque, não de cobrança.** A planilha sempre esteve certa — a fórmula
dela puxa a alíquota da aba DIFAL sem liga/desliga nenhum.

**Corrigido no mesmo dia:** o DIFAL voltou a entrar na conta em toda UF com alíquota, e a chave
virou `difal_destacado`. Os 12 estados com alíquota e destaque desligado voltam a deduzir
(BA 13,5%, MA 16%, AL 14,5%, DF 13%, GO 12%, PA 12%, AC 12%, AP 11%, ES 10%, RJ 10%, PR 7,5%,
RS 5%). Detalhes e golden test no Calculations.md §7.2.1.

**O que isso muda no placar desta conferência:** nada — a conciliação das 12 abas usa as tabelas
fiscais da própria planilha, não a chave do banco. O que muda é o pedido digitado no sistema, que
agora fecha com a planilha.

**Fica em aberto:** o que "destacado" faz na ficha impressa e na nota. Hoje ainda não faz nada — a
folha mostra o DIFAL pela regra do canal, sem olhar o destaque da UF.
