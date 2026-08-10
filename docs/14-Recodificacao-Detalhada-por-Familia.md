# 14 — Recodificação detalhada por família (devolutiva da cliente)

> **Versão:** 1.0 — 10/08/2026
> Devolutiva da cliente sobre a recodificação de 05/08 (docs/12): olhando as
> famílias por letra, pediu uma lista bem mais fina — 28 famílias novas em vez
> das 15 que trocariam de nome, para a vendedora reconhecer o produto direto
> pela letra, sem abrir o catálogo.

## 1. O que a cliente mandou

Uma lista com o prefixo de cada família, agrupada em Campo, Paramentação e
Acessórios. Comparado a docs/12, a granularidade aumentou bastante — por
exemplo, "Campo Geral" (que juntava Lateral, Superior, Inferior, de Mayo e
Fenestra U num prefixo só) vira quatro famílias específicas.

Antes de gravar qualquer coisa, cada linha da lista foi cruzada contra o
catálogo real (324 produtos, lido do banco) para achar onde ela batia direto e
onde precisava de uma decisão. Seis pontos precisaram de decisão explícita do
usuário:

1. **Formato de 2 letras, ou 2-3?** A cliente havia pedido "duas letras e
   quatro dígitos" em 05/08 (docs/12), mas a lista nova tem 11 códigos de três
   letras (CSU, CMM, CLB, CLM, C2B, AVC, AVT, AVS, AVL, CAL, COM). Decidido:
   ampliar o formato para 2-3 caracteres — a lista da cliente vale como está.
2. **CL muda de sentido.** Era Campo Lasik (8 produtos ativos); a lista nova
   usa CL para Campo Lateral. Confirmado que nenhum pedido usa código CL até
   agora (troca segura), mas é a segunda vez que uma letra é reaproveitada com
   sentido novo — a primeira foi AC=Compressa em 05/08.
3. **Fenestra U não tinha código na lista.** Entra em CF (Campo com Fenestra)
   — já é a família que trata fenestra.
4. **Avental com duas características ao mesmo tempo.** 10 dos 51 produtos
   combinam Compressa+Toalha (8) ou Laminado+Toalha (2), e a lista só tem um
   código por característica. Regra decidida: a mais específica vence —
   Laminado > Toalha > Compressa.
5. **Bag avulso (2 produtos) não estava na lista.** Mantido como está (`AB`),
   fora desta rodada.
6. **Conjunto/Calça/Blusa.** Os 8 "Conjunto" de hoje são vendidos como par
   fechado (calça + blusa juntos); viram `CJ` sem mudar nada. `CAL` (Calça) e
   `BL` (Blusa) nascem como famílias vazias, para quando a cliente cadastrar
   peça avulsa.

## 2. O mapeamento final

| Antes | Depois | Produtos | O que mudou |
|---|---|---|---|
| CS | CS | 60 | nada — só o nome "oficial" vira "campo sem fenestra" |
| CF | CF | 44→48 | ganha os 4 Fenestra U que saíam de Campo Geral |
| CA | CA | 20 | nada |
| CT | CT | 18 | nada |
| CL (Lasik) | **CLB** + **C2B** + **CLM** | 8 → 2+4+2 | Lasik se separa em Binocular, "2 Bags" (mesma regra do avental: quem já tem "2 Bags" no nome vai pra C2B) e Monocular |
| — (era Campo Geral) | **CL** (Lateral) | 4 | CL reocupado com sentido novo |
| — (Campo Geral) | **CSU** | 4 | Superior |
| — (Campo Geral) | **CI** | 4 | Inferior |
| CM | CM | 44 | nada |
| — (Campo Geral) | **CMM** | 2 | de Mayo |
| CD | **SD** | 4 | só troca de letra |
| AC (Compressa) | **COM** + **TO** | 18 → 16+2 | os 2 "Compressa Wiper" (já chamados "Toalha de Mão" na nota fiscal) viram família própria |
| PA (Avental) | **AV**+**AVC**+**AVT**+**AVS**+**AVL** | 51 → 12+8+16+9+6 | separado por característica, regra "mais específica vence" nos 10 que combinam duas |
| PJ | **CJ** | 8 | só troca de letra |
| — | **CAL**, **BL** | 0, 0 | famílias novas, vazias |
| PB | **BO** | 2 | só troca de letra |
| PP | **PN** | 2 | só troca de letra |
| AO | **OC** | 2 | só troca de letra |
| AS | **SA** | 4 | só troca de letra |
| AB | AB | 2 | nada — fora da lista da cliente |
| KC | KC | 19 | nada |

**117 produtos trocaram de código, 324 produtos no total, nenhum perdido.**

## 3. Regras seguidas

- **Os quatro dígitos continuam sem significado** — sequência, só. Onde uma
  família ganha membros novos mas mantém a letra (caso do CF), os produtos
  antigos não são renumerados: os 4 novos entram no final (`CF0045`-`CF0048`),
  para não trocar o código de 44 produtos que não têm nada a ver com a
  mudança.
- **Prefixo aposentado não some — fica inativo, renomeado.** As 9 categorias
  sem sucessora (CD, CG, PA, PJ, PB, PP, AC, AO, AS) continuam no banco,
  marcadas `active = false`, com o nome e o slug marcados como "(código antigo
  XX)" — sem isso, a família nova não conseguiria nascer com o mesmo nome de
  exibição (há um índice único por nome e por slug que não abre exceção para
  categoria inativa).
- **CL é a exceção deliberada.** Ao contrário das outras, não é retirada —
  muda de sentido na mesma letra, com aprovação explícita do usuário.
- **Recodificação em duas fases**, na mesma migração: primeiro esvazia CL
  (Lasik) para CLB/C2B/CLM, só depois preenche CL de novo com os produtos de
  Campo Lateral. Os dois conjuntos de código coincidem como texto
  (`CL0001`-`CL0004`), então fazer tudo numa UPDATE só arriscaria colisão na
  trava de unicidade — duas UPDATEs em sequência elimina o risco.
- **Pedidos fechados não mudam**: o item guarda o código congelado no momento
  da venda (`item_code_snapshot`).

## 4. Um bug de código evitado: prefixo que é início de outro

Antes desta migração, todo prefixo ativo tinha exatamente 2 letras e nenhum
era prefixo de outro. A função que gera o próximo código
(`next_category_code`) usava `code like p_prefix || '%'` — "começa com" — e
isso bastava.

A partir desta migração isso deixa de ser verdade: `CS`/`CSU`, `CM`/`CMM`,
`CL`/`CLB`/`CLM` e `AV`/`AVC`/`AVT`/`AVS`/`AVL` coexistem. Com o "começa com"
antigo, gerar o próximo código de `CS` também contaria os produtos de `CSU`
(e `CL` contaria `CLB`/`CLM`), furando a sequência silenciosamente. A função
foi trocada para casar o prefixo **exato**, com âncora de fim de string
(`code ~ ('^' || p_prefix || '[0-9]+$')`) — só casa o prefixo pedido, seguido
só de dígitos. Coberto por teste em
`tests/pedidos/regras-do-banco.test.ts`.

## 5. Onde cada coisa mora

| Peça | Arquivo |
|---|---|
| Migração (formato 2-3 letras, categorias novas, recodificação dos 117 produtos, correção do `next_category_code`) | `supabase/migrations/20260810000100_recodificacao_detalhada_por_familia.sql` |
| Teste do casamento exato de prefixo | `tests/pedidos/regras-do-banco.test.ts` |

A migração foi testada numa transação com `rollback` antes de ser aplicada de
verdade — a contagem final bateu 324/324 produtos, todas as famílias com o
número esperado, sem produto perdido ou duplicado.
