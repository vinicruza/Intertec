# 02 — Arquitetura do Sistema

> **Versão:** 1.0 — 07/07/2026
> **Leia antes:** `01-PRD.md` (o quê e por quê) e `Calculations.md` (regras de cálculo — fonte única de verdade).
> Este documento define **como** o sistema é construído.

---

## 1. Visão geral

Aplicação web de página única (SPA) em React, com banco de dados e autenticação no Supabase (Postgres + Auth + RLS) e deploy na Vercel conectada ao GitHub.

```
┌─────────────────────────────────────────────────────────┐
│  Navegador (SPA React + TypeScript)                     │
│                                                         │
│  app/          telas e rotas                            │
│  components/   componentes de UI reutilizáveis          │
│  lib/calculations/  ← MOTOR DE CÁLCULO PURO             │
│                (sem UI, sem banco, 100% testado)        │
└──────────────┬──────────────────────────────────────────┘
               │ TanStack Query + supabase-js
┌──────────────▼──────────────────────────────────────────┐
│  Supabase                                               │
│  • Postgres (numeric para dinheiro, nunca float)        │
│  • Auth (login) + RLS (permissão por perfil)            │
│  • Migrations versionadas em supabase/migrations/       │
└─────────────────────────────────────────────────────────┘
```

## 2. Stack (fixada no PRD §8)

| Camada | Tecnologia | Quando entra |
|---|---|---|
| Build/dev | Vite 7 + TypeScript 5.9 (strict) | Sprint 1 ✔ |
| UI | React 19; Tailwind + shadcn/ui | telas a partir da Sprint 5 |
| Formulários | React Hook Form + Zod | Sprint 5+ |
| Dados/cache | TanStack Query + supabase-js | Sprint 5+ |
| Gráficos | Recharts | Sprint 13 |
| Precisão decimal | decimal.js (ver §4) | Sprint 3 |
| Testes | Vitest (golden tests do Calculations.md §11) | infra na Sprint 1 ✔; testes na Sprint 3 |
| CI | GitHub Actions: tipos + lint + testes a cada push | Sprint 1 ✔ |
| Banco/Auth | Supabase (Postgres + Auth + RLS) | Sprint 2 |
| Deploy | Vercel conectada ao GitHub | quando houver telas |

## 3. Estrutura de pastas

```
app/                 entrada da aplicação, rotas e telas (alias @app)
components/          componentes reutilizáveis (alias @components)
lib/calculations/    motor de cálculo puro (alias @calc)
supabase/            migrations e configuração do Supabase
database/            documentação/apoio de banco (seeds de referência, diagramas)
tests/               testes automatizados (golden tests incluídos)
docs/                documentação do projeto
```

## 4. Motor de cálculo (`lib/calculations/`) — o coração do sistema

Regras invioláveis (CLAUDE.md + PRD §8):

1. **Funções puras**: recebem dados, devolvem resultados. Zero dependência de React, Supabase ou qualquer I/O. Isso permite testar cada função isoladamente contra os golden tests.
2. **Dinheiro nunca em float.** Todo valor monetário, alíquota e quantidade trafega como `Decimal` (biblioteca decimal.js) dentro do motor. `number` do JavaScript é proibido para dinheiro — float causa erros de centavos (ex.: `0.1 + 0.2 ≠ 0.3`).
3. **Precisão total no cálculo, arredondamento só na exibição** (Calculations.md §9.9) — igual à planilha, para os golden tests baterem.
4. Os módulos espelham as 4 camadas do Calculations.md §1:

```
lib/calculations/
  decimal.ts        configuração central do decimal.js (precisão, criação segura)
  inputs.ts         Camada 1  preço sem imposto
  cmv.ts            Camada 2  ficha técnica → CMV (incl. kits em cascata, §4)
  allocation.ts     Camada 3  despesa alocada e unitária
  order.ts          Camada 4  pedido: receita → margem (cascata D1)
  types.ts          tipos de entrada/saída de cada camada
```

5. **Fronteira do motor**: as bordas (telas e banco) convertem `string` (numeric do Postgres chega como string — nunca converter para `number`) ⇄ `Decimal` ao entrar/sair do motor.
6. Referência circular em composição (produto A contém B que contém A) é **erro do motor** (T9-relacionado), além de ser bloqueada no banco.

## 5. Onde cada cálculo acontece

| Cálculo | Onde | Por quê |
|---|---|---|
| Simulação de pedido (ao vivo na tela) | Motor TS no navegador | resposta instantânea (< 1 min por simulação, PRD §3) |
| CMV vigente de produtos/kits (recálculo em cascata) | Motor TS, disparado ao salvar insumo/ficha; resultado persistido | uma única implementação das fórmulas |
| Snapshot no fechamento do pedido (D7) | Motor TS calcula; gravação transacional no Postgres | pedido fechado nunca recalcula |
| DRE mensal | SQL (views) **somando snapshots já congelados** | é agregação, não cálculo financeiro novo |

Princípio: **as fórmulas existem em um único lugar** (`lib/calculations/`). O banco soma valores prontos, não refaz fórmulas. Isso elimina o risco de duas implementações divergirem — exatamente o defeito das 12 abas da planilha.

## 6. Dados e segurança

- **IDs**: UUID em todas as tabelas. Busca de custo **sempre por ID, nunca por nome** (classe de erro nº 4 da planilha, extinta por design).
- **Multi-tenant preparado, não implementado** (PRD §8): `tenant_id` em todas as tabelas com valor único fixo; sem telas de gestão.
- **RLS por perfil** (Admin, Financeiro, Comercial, Produção): Comercial não lê custos de insumos; Produção é somente leitura. Matriz detalhada em `03-Banco-de-Dados.md`.
- **Auditoria** (`audit_logs`): preço de insumo, fator de complexidade, parâmetros de canal, override de comissão, reabertura de pedido.
- **Migrations versionadas** em `supabase/migrations/` — o banco evolui por arquivos numerados no Git, nunca por alteração manual.

## 7. Qualidade e CI

- **Golden tests (Calculations.md §11) são obrigatórios e nunca podem ser removidos.** Entram na Sprint 3 e rodam em todo push.
- CI (GitHub Actions, `.github/workflows/ci.yml`): checagem de tipos → lint → testes. Falhou, não entra.
- Sprint 4 adiciona o teste de reconciliação em massa: recálculo dos 325 CMVs comparado com a planilha, divergência > R$ 0,01 listada.
- Commits pequenos e frequentes; uma sprint por vez com aprovação do usuário (CLAUDE.md).

## 8. Decisões de arquitetura registradas

| # | Decisão | Motivo |
|---|---|---|
| A1 | decimal.js como biblioteca decimal | precisão arbitrária, madura, API simples; espelha o `numeric` do Postgres |
| A2 | Motor de cálculo roda no cliente (TS), banco só agrega snapshots | uma única fonte das fórmulas; simulação instantânea |
| A3 | `numeric` sem limite de casas no Postgres para valores em fluxo; arredondamento a 2 casas apenas em totais persistidos de pedidos fechados | replica a planilha (Calculations.md §9.9) e o PRD §8 |
| A4 | numeric ⇄ Decimal via string nas bordas | passar por `number` reintroduziria float silenciosamente |
| A5 | Validações bloqueantes duplicadas: motor (erro) + banco (constraint/trigger) | defesa em profundidade; CMV=0 nunca passa em silêncio |
