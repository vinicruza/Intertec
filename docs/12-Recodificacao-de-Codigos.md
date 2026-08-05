# 12 — Recodificação de produto por família

> **Versão:** 1.0 — 05/08/2026
> Pedido do cliente, olhando a tela de código de ERP: "os códigos serão alfanuméricos com duas
> letras e quatro dígitos — qual o melhor caminho para as vendedoras reconhecerem o produto?"

## 1. O problema real

O formato pedido (duas letras + quatro dígitos) **já era** o que estava no ar: é exatamente
`CC-0185`. O que precisava mudar não era o formato — era o que as letras significam.

O catálogo tinha 4 categorias institucionais (`PC` Paramentação, `CC` Campos, `AC` Acessórios,
`KC` Kits), e 216 dos 324 produtos (dois terços) caíam todos em `CC`. Uma vendedora vendo
`CC-0185` sabia só que era um campo — e campo é quase tudo. O código não informava nada de útil
justamente onde havia mais produto.

## 2. A regra adotada

**A primeira letra é a linha do produto, a segunda é a família dentro dela** — a mesma regra que
`KC = Kit Cirúrgico` já seguia, sem ninguém ter formalizado, agora aplicada ao catálogo inteiro.

| Linha | Prefixo | Família | Produtos |
|---|---|---|---|
| Campos | `CS` | Campo Simples | 60 |
| | `CM` | Campo de Mesa | 44 |
| | `CF` | Campo com Fenestra | 44 |
| | `CA` | Campo com Adesivo | 20 |
| | `CT` | Campo Catarata | 18 |
| | `CG` | Campo Geral (Lateral, Superior, Inferior, de Mayo, Fenestra U — sem família própria) | 18 |
| | `CL` | Campo Lasik | 8 |
| | `CD` | Campo Steri Drape | 4 |
| Paramentação | `PA` | Avental | 51 |
| | `PJ` | Conjunto | 8 |
| | `PB` | Bota | 2 |
| | `PP` | Perneira | 2 |
| Acessórios | `AC` | Compressa | 18 |
| | `AS` | Saco | 4 |
| | `AB` | Bag | 2 |
| | `AO` | Oclusor | 2 |
| Kits | `KC` | Kit Cirúrgico | 19 |

**324 produtos, todos recodificados.** Cada prefixo recomeça em `0001`; dentro de cada um, a
numeração segue a ordem alfabética do nome — os tamanhos ficam em sequência (`CS0001`…`CS0004`
são os quatro `0,40 x 0,40`, depois vêm os `0,50 x 0,50`, e assim por diante).

Três regras seguidas com rigor:

- **Os quatro dígitos não significam nada** — é sequência, e só. O significado mora nas duas
  letras e no nome do produto, não em codificar tamanho ou gramatura no número.
- **Prefixo aposentado não volta com sentido novo.** `CC` e `PC` significavam "campo" e
  "paramentação" de forma genérica; ficam **inativos** (não apagados — preservam histórico), mas
  nenhuma família nova os reaproveita. O mesmo texto nunca deve apontar para produtos diferentes
  conforme a data.
- **Estéril/Não Estéril não entra no código** — isso já vem do nome, não da numeração.

**A exceção: `AC`.** Antes de recodificar, confirmou-se com o cliente que os códigos antigos de
Acessórios nunca circularam em nota fiscal nem pedido real — o sistema tinha **zero pedidos**
até esta migração. Sem esse risco, `AC` pôde ser reaproveitado para a família Compressa em vez de
aposentado como os outros.

**Sem hífen.** O formato virou duas letras e quatro dígitos direto (`CS0001`), sem separador —
pedido explícito do cliente. Efeito colateral útil: como todo código antigo tem hífen e nenhum
novo tem, os dois mundos nunca se confundem visualmente, mesmo compartilhando as mesmas letras
(`AC-0005` era Bag; `AC0001` é Compressa — o hífen entrega, sozinho, de qual formato se trata).

## 3. Prévia antes de aplicar

Antes de qualquer gravação, foi gerada e enviada ao cliente uma planilha com os 324 mapeamentos
(código atual → código novo, nome do catálogo, nome de NF, família) para conferência — mesmo
princípio da nomenclatura de NF (docs/10 §4.2): ver antes, aplicar depois.

## 4. O que foi corrigido no caminho

**O código de ERP (Sprint E, docs/10-Embalagem…) já tinha a proposta certa, sem conseguir
aplicá-la.** A reunião de 16/07 havia proposto avental=1, conjunto=2, bota=3, campo de mesa=4,
campo simples=5 — mas só existiam 4 categorias então, e o que foi gravado foi uma aproximação
grosseira (`PC=1, CC=2, AC=3, KC=4`). Agora que essas 5 famílias existem de verdade, a proposta
original da reunião foi aplicada tal como estava escrita: `PA=1, PJ=2, PB=3, CM=4, CS=5`. As
outras 12 famílias ficam sem prefixo de ERP — ninguém decidiu esses números ainda; o
Administrador preenche em **Cadastros → Categorias de produto** quando o formato do ERP for
confirmado (a geração continua desligada por padrão, PRD §11).

## 5. O que não muda

- **Pedidos fechados** continuam corretos: o item guarda o código congelado no momento da venda
  (`item_code_snapshot`), então histórico, DRE e margem não são afetados por uma recodificação
  futura. (Não havia nenhum pedido no sistema até esta migração — ver §2.)
- **Descrição de NF** (docs/10) não foi tocada: a regra de nomenclatura fiscal casa pelo *nome*
  do produto, não pelo código, e continua produzindo o mesmo texto de antes.
- **Histórico de código** (`catalog_code_history`) ganhou uma linha por produto com o código
  antigo, o novo e o motivo — a cadeia completa desde o código original da planilha (`P011`) até
  hoje continua rastreável.
- **Kit novo nasce em `KC` + quatro dígitos**, exatamente como antes — só sem hífen.

## 6. Onde cada coisa mora

| Peça | Arquivo |
|---|---|
| Migração (categorias por família + recodificação dos 324 produtos + formato sem hífen) | `supabase/migrations/20260805000100_recodificacao_por_familia.sql` |
| Geração de código para produto/kit novo (sem hífen) | função `next_category_code`, mesma migração |

A lista de 324 códigos dentro da migração foi **gerada por script a partir do catálogo real**,
não escrita à mão — mesma prática das migrações de nomenclatura de NF: reescrever a lista à mão
correria o risco de trocar um par sem ninguém perceber, e a migração é aplicada uma vez só.
