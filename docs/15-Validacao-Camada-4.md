# 15 — Validação do sistema contra a planilha de Rentabilidade

> Rodado em 18/08/2026 sobre `Rentabilidade_2026_3.xlsx` (versão nova, entregue pelo cliente).
> Comandos: `npm run reconcile -- <planilha.xlsx>` (Camadas 1 e 2) e
> `npm run validar:pedidos -- <planilha.xlsx>` (Camada 4).
> Nada foi gravado no banco nem alterado na planilha. A planilha não vai para o Git.

## 1. O que foi testado

Pegamos cada um dos 12 pedidos que estão vivos nas abas de vendedor da planilha e mandamos o
sistema refazer a conta **com os mesmos números de entrada** (mesma receita, mesmo CMV, mesmo
frete, mesma UF). Depois comparamos linha por linha: imposto, DIFAL, comissão, receita líquida e
margem. Tolerância de R$ 0,01.

É o teste que responde à pergunta "o sistema calcula igual à planilha?" — e, onde não calcula,
diz **por quê**: ou a planilha tem um erro que já mapeamos, ou é uma regra que o cliente mandou
mudar, ou é algo novo que ninguém tinha visto.

Também rodamos de novo a conferência de custo dos produtos (Camadas 1 e 2) e das tabelas de
imposto, porque esta versão da planilha cresceu: **359 produtos** (eram 325) e os mesmos 85 insumos.

## 2. Resultado geral

**O motor de cálculo está certo.** Em todas as 12 abas, sem exceção, bateram no centavo:

| Linha conferida | Resultado |
|---|---|
| Receita bruta do pedido | ✅ 12 de 12 |
| CMV do pedido | ✅ 12 de 12 |
| Despesa rateada do pedido | ✅ 12 de 12 |
| Frete informado | ✅ 12 de 12 (inclusive o frete calculado por % do Portal) |
| Imposto sobre a venda | ✅ 9 de 12 (as 3 exceções estão na Seção 4) |
| DIFAL | ✅ em todas as abas que têm a linha |

Nas Camadas 1 e 2, o quadro é o mesmo de antes: **nenhuma divergência de preço sem imposto**
(85 insumos conferem), 270 produtos com CMV idêntico, 55 com ficha de fórmula especial e 10 com
o problema de lookup por nome já conhecido (§9.3 do Calculations.md). A alocação continua fechando
em 100% e R$ 450.000.

Uma aba fecha 100% igual à planilha, ponta a ponta: **Temporária Patricia**.

## 3. Divergências que são decisão já tomada — não mexer

Estas aparecem no relatório como diferença, mas o sistema está fazendo o que o cliente pediu.

**3.1 Imposto sobre o frete quando o frete é por conta do cliente.**
A planilha zera o frete (o cliente paga) mas continua cobrando imposto sobre ele. O sistema zera os
dois, por decisão de 04/08/2026 registrada no Calculations.md §6: se a Intertech não pagou
transporte, não há transporte a tributar.

| Aba | Imposto sobre frete na planilha | No sistema |
|---|---|---|
| Camila | R$ 48,75 | R$ 0,00 |
| Isabela | R$ 21,25 | R$ 0,00 |
| Suellen | R$ 13,00 | R$ 0,00 |
| Descpro | R$ 3,90 | R$ 0,00 |

**3.2 Revendas, Descpro e Edmilson sem DIFAL.** A planilha não tem a linha; o sistema aplica zero
pela configuração de canal. É a Decisão D4, confirmada em 05/08/2026 (§12.1): revenda é venda a
contribuinte. O relatório marca como "linha ausente" só para deixar claro que a estrutura difere.

## 4. Divergências novas — precisam de decisão do cliente

Estas **não existiam** na versão da planilha que originou o Calculations.md. Nenhuma foi alterada
no código: o sistema segue com a regra documentada até o cliente decidir.

### 4.1 A comissão passou a incidir sobre receita **+ frete** — ✅ RESOLVIDO em 18/08/2026

> **O cliente confirmou a regra nova: a comissão incide sobre receita + frete, em todos os canais.**
> Implementado em `lib/calculations/order.ts` (golden tests T16–T16d) e documentado no
> Calculations.md §6.2. Depois da mudança, **Patricia, Priscilene e Mari passaram a fechar 100%**
> com a planilha. As 4 abas que na planilha ficaram com `=2,5%*$F$24` (Externos, Revendas,
> Edmilson e Temporária Patricia) agora divergem — e ali o divergente é a planilha, que precisa
> ser atualizada do lado do cliente.
>
> O texto abaixo fica como registro do achado.


O Calculations.md §6 e §7.4 dizem `comissão = 2,5% × receita do pedido`. Nesta versão, 8 das 12
abas mudaram para `2,5% × (receita + frete)`:

```
Planilha (novo):  =2.5%*($F$24+$N$6)     ← receita + frete
Sistema (atual):  2,5% × receita
```

| Aba | Comissão no sistema | Na planilha | Diferença |
|---|---|---|---|
| Patricia | R$ 251,30 | R$ 263,80 | R$ 12,50 |
| Camila | R$ 21,68 | R$ 29,18 | R$ 7,50 |
| Mari | R$ 185,00 | R$ 191,66 | R$ 6,66 |
| Isabela | R$ 25,50 | R$ 28,00 | R$ 2,50 |
| Descpro | R$ 48,00 | R$ 49,50 | R$ 1,50 |

E as outras 4 abas **não** mudaram (Externos, Revendas, Edmilson e Temporária Patricia continuam
sobre a receita só). Ou seja: a planilha hoje paga comissão por dois critérios diferentes,
dependendo de qual aba o vendedor abriu.

**Pergunta ao cliente:** o vendedor ganha comissão sobre o frete? Se sim, vale para todos os canais?
É uma linha de código no motor, mas muda quanto cada vendedor recebe — não dá para decidir sozinho.

### 4.2 Revendas deixou de descontar imposto sobre a venda 🔴

Nesta versão, as linhas "Imposto" e "Imposto Frete" da aba Revendas estão **vazias** — sem fórmula,
sem valor. O §8 do Calculations.md registra Revendas usando a tabela ICSM normalmente.

No pedido que está lá (R$ 2.800, PI), o sistema desconta R$ 455,00 de imposto e a planilha não
desconta nada. A margem exibida ao vendedor passa de 54,83% (com imposto) para 62,36% (sem):

| | Sistema | Planilha |
|---|---|---|
| Imposto sobre venda | R$ 455,00 | — |
| Receita líquida | R$ 2.275,00 | R$ 2.730,00 |
| Margem de contribuição | 54,83% | 62,36% |

**Pergunta ao cliente:** foi intencional (algum regime que isenta a revenda) ou a fórmula foi
apagada sem querer? Se foi sem querer, os pedidos de revenda fechados com essa planilha estão com
margem superestimada em ~7,5 pontos.

### 4.3 Descpro: a alíquota própria caiu de 10% para 6,5% 🟡

O Calculations.md §8 registra "10% hardcoded (N37)". Nesta versão a célula está em **6,5%** e o
rótulo é "Alíquota Simples" — parece ser a alíquota do Simples Nacional.

A Decisão D4 já previa que o Descpro abandonasse a alíquota própria e passasse a usar a tabela
ICSM por UF. Aplicando a D4, o pedido (R$ 1.920, RN) paga R$ 312,00 de imposto em vez de R$ 124,80,
e a margem cai de 47,21% para 41,05%.

**Pergunta ao cliente:** o canal Descpro é tributado pelo Simples (6,5% sobre a nota) ou pelo ICMS
interestadual como os demais? A D4 assumiu o segundo; a planilha nova reforça o primeiro.

### 4.4 Portal: o frete de SP caiu de 9% para 3,6% 🟢

Atualização de parâmetro, não erro. Precisa entrar na tela de Configurações junto com a tabela.
As 27 UFs estão cobertas.

## 5. Erros da planilha confirmados neste arquivo

**5.1 Edmilson: o imposto agora dá zero.** O bug do §9.2 (imposto calculado sobre `F44`, um bloco
secundário, em vez da receita) piorou: nesta versão `F44` está vazio, então o imposto do pedido é
**R$ 0,00** sobre uma venda de R$ 1.260. A margem exibida é 45,67%; a real, com o imposto de MG, é
30,52% — **15 pontos de diferença**.

**5.2 Externos: a alíquota de comissão está sendo somada como se fosse dinheiro.** A célula
`% Comissão` (0,061) fica dentro do intervalo que a fórmula da receita líquida soma
(`=F24-SUM(N6:N13)`), então a planilha desconta **R$ 0,06** a mais. O valor é irrisório; o sintoma
não é — qualquer número digitado naquele intervalo vira dedução silenciosa.

**5.3 Edmilson: o estorno de frete do cliente sai pela metade.** A fórmula é
`=-SUMIF(N10,"X",N6)/2` — devolve metade do frete, não o frete. Está dormente porque o frete
daquela aba é zero, mas explode no primeiro pedido com frete.

**5.4 Nathalia: item com custo zero passou em silêncio.** O item "Compressa P Não Estéril" tem
CMV = R$ 0,00 na Alocação (nome sem correspondência, §9.4). A planilha somou zero e seguiu; **o
sistema recusou o pedido inteiro**, com a mensagem apontando o item. É a regra T9 funcionando
exatamente como projetada — o teste não "falhou", ele pegou o erro.

**5.5 A tabela DIFAL continua com as mesmas 4 UFs fora da conta** (AL, MA, PI e RN, onde o valor
final não é Pobreza + Alíquota). Nada mudou desde a Decisão D5: migrar como está, sinalizado para
o contador.

## 6. Erro encontrado no nosso próprio importador — já corrigido

Conferindo a aba Edmilson, um valor de R$ 0,00 aparecia como "linha não existe". Investigando: a
biblioteca que lê o arquivo Excel (`exceljs`) monta o valor da célula com um teste de "se tem
valor" que **considera o zero como ausência**. Resultado em cache igual a zero era descartado, e o
arquivo tem o zero gravado.

Isso apagava a diferença entre "imposto de R$ 0,00" e "campo nunca preenchido" — exatamente o que
a conferência precisa distinguir. Corrigido em `lib/import/exceljs-loader.ts`: células de fórmula
passam a ser lidas por `cell.result`, que não tem esse filtro. Fórmula sem valor calculado continua
devolvendo nulo — o leitor nunca inventa um zero que a planilha não tem.

Depois da correção, três abas mudaram de veredito (Temporária Patricia passou a fechar 100%, e
Mari e Edmilson perderam divergências que eram falso positivo). Tem teste de regressão em
`tests/import/pedidos.test.ts`.

## 7. O que fica pendente

Nada foi mudado no motor de cálculo. Antes de mexer, precisamos da resposta de três perguntas —
todas de negócio, nenhuma técnica:

1. ~~**Comissão incide sobre o frete?**~~ ✅ **Respondida em 18/08/2026: sim, em todos os canais.**
   Implementada (§4.1), com golden tests T16–T16d.
2. **Revenda paga imposto sobre a venda?** (§4.2 — 7,5 pontos de margem)
3. **Descpro é Simples 6,5% ou ICMS por UF?** (§4.3 — 6 pontos de margem)

Cada resposta vira uma alteração pequena e com golden test próprio. Enquanto as duas restantes não
chegam, o sistema continua com as regras do Calculations.md, que é o combinado.

**Situação após a mudança da comissão:** 3 abas fecham 100% (Patricia, Priscilene, Mari e
Temporária Patricia perdeu o empate só por causa da fórmula antiga na planilha), contra 1 antes.
