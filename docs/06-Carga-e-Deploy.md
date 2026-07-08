# 06 — Carga Inicial e Deploy (Sprint 14)

> **Versão:** 1.0 — 08/07/2026

## 1. Carga inicial da planilha — CONCLUÍDA ✅

Executada com `scripts/gerar-carga.ts` (gera o SQL) e aplicada no Supabase. Resultado:

| Item | Quantidade | Verificação |
|---|---|---|
| Insumos | 80 | preços sem imposto pelo motor (por fora) |
| Produtos | 325 (códigos P001–P325) | nomes exatos da planilha |
| Componentes de ficha | 1.696 insumo + 20 produto (kits) | — |
| CMVs vigentes | 325 | **0 divergências, diferença máxima R$ 0,000000** entre o CMV recalculado das fichas e o da planilha |
| Alocação 2026-07 | 307 produtos, total R$ 450.000 | produção × fator migrados como estão |

### Decisões de migração aplicadas

1. **Quantidade derivada do custo** (`qtd = custo ÷ preço sem imposto`): reproduz exatamente o
   custo da planilha, inclusive nas 45 fichas com fórmula especial (relatório 05 §3).
2. **Pseudo-insumos "Produto X" viraram componentes-produto** (kits vivos em cascata), casados
   pelo **valor** do CMV — na planilha, a referência é sempre a variante **Não Estéril**.
   5 casados; **13 ficaram como insumo estático** (valor sem produto correspondente) — ver §3.
3. **Nada corrigido em silêncio**: os 14 nomes da Alocação sem produto correspondente ficaram
   fora do período (listados no console da carga e no relatório 05).

## 2. Pendências que continuam com o financeiro/contador

1. **R$ 450.000: mensal ou anual?** O período 2026-07 foi criado com o valor como está.
   Se for anual, basta editar o total do período para 37.500 (÷12) na tela de Alocação.
2. **DIFAL de AL, MA, PI, RN**: migrados como estão, sinalizados (`flagged_for_review`).
3. **13 pseudo-insumos sem produto correspondente** (ex.: "Produto Campo catarata",
   "Produto Campo de mesa 1,00x1,20"): entraram como insumo de preço fixo. Quando o time
   identificar a qual produto cada um se refere, trocar na ficha técnica pela referência
   viva (componente-produto) para o recálculo em cascata alcançá-los.
4. **14 nomes da Alocação sem produto** (grafia/nomes truncados — relatório 05 §4): decidir
   se são produtos extintos ou se devem ser criados.

## 3. Deploy na Vercel — passo a passo (fazer junto com o Claude)

1. Acesse https://vercel.com e crie a conta com **Continue with GitHub** (usuário `vinicruza`).
2. **Add New → Project** → importe o repositório `vinicruza/Intertec`.
3. A Vercel detecta Vite sozinha (build `npm run build`, saída `dist/`). Não mude nada.
4. Em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL` = `https://wdnontebtxnrsenvtucd.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = a chave publicável do projeto (Supabase → Settings → API Keys;
     começa com `sb_publishable_`). É a chave PÚBLICA — segura no navegador; o RLS protege os dados.
5. **Deploy**. A cada push na branch, a Vercel publica de novo.
6. No Supabase (Authentication → URL Configuration), adicione a URL da Vercel em
   **Site URL/Redirect URLs**.
7. Entre com os usuários de teste (senha única de demonstração — trocar depois):
   `admin@intertec.demo`, `financeiro@intertec.demo`, `comercial@intertec.demo`, `producao@intertec.demo`.

## 4. Período de testes em paralelo (2 semanas — PRD §10)

Roteiro para o time: simular no sistema os mesmos pedidos feitos na planilha e comparar a
margem de contribuição (deve coincidir com a margem que a planilha exibe); fechar os pedidos
reais no sistema; no fim do mês, digitar a despesa fixa real e conferir o DRE.
