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
7. Entre com a conta de dono do sistema (`vinicius@avgestaofinanceira.com.br`) e cadastre o
   time real pela tela de **Usuários**. As contas `*.demo` da carga inicial foram desativadas
   em 03/08/2026 e não devem ser usadas — ver §5.

## 4. Período de testes em paralelo (2 semanas — PRD §10)

Roteiro para o time: simular no sistema os mesmos pedidos feitos na planilha e comparar a
margem de contribuição (deve coincidir com a margem que a planilha exibe); fechar os pedidos
reais no sistema; no fim do mês, digitar a despesa fixa real e conferir o DRE.

## 5. Verificação de prontidão e limpeza para produção (03/08/2026)

Checagem completa antes de liberar o sistema para o time. O código passou em tudo:
tipos, lint, **130 testes automatizados** (incluindo os golden tests T1–T13 do
Calculations.md §11), build de produção e CI verde na `main`. No banco: 46 migrações
aplicadas em sincronia com o repositório, RLS ativo nas 35 tabelas, e o catálogo íntegro —
**324 produtos, 80 insumos, 1.711 linhas de ficha técnica, 324 CMVs, nenhum produto com
CMV zero e nenhum produto sem ficha**.

### 5.1 O que foi removido do banco de produção

Dado de demonstração criado durante o desenvolvimento e a gravação dos tutoriais. Nada de
catálogo, custo ou parâmetro foi tocado.

| Item | Removido |
|---|---|
| Pedidos de exemplo | `ORC-2026-0001` (fechado) e `ORC-2026-0002` (pendente), com seus 3 itens |
| Kits de teste | `KC-0030 "kit cirurgico"` e `KC-0031 "kitsfsf"`, com seus 4 itens |
| Cliente de exemplo | `Hospital Modelo — Exemplo` |
| Conta sobrando | `tutorial.temp@intertechsurgical.com.br` — era Administrador **ativo** e sem troca de senha obrigatória |

O pedido fechado é protegido pelo gatilho de imutabilidade (D7). Ele foi desligado durante a
exclusão e **religado em seguida** — conferido depois da operação. A trilha de auditoria
(`audit_logs`) foi preservada inteira: apagar o histórico contrariaria a regra do projeto.

A conta `admin@intertech.demo` continua existindo, **desativada**, porque aparece como autora
de eventos na auditoria — pelo mesmo motivo pelo qual o sistema desativa em vez de excluir
quem já registrou algo.

### 5.2 O que ainda impede o uso exclusivo (sem a planilha ao lado)

1. **Cadastrar o time nos quatro perfis.** Hoje só há Administradores. Enquanto for assim, a
   separação de funções não existe na prática: o Comercial não tem como ficar sem ver custo,
   e a regra "ninguém aprova a própria cotação" **trava** se houver um único aprovador ativo.
2. **13 insumos "fantasma" com custo congelado** (§2, item 3). É a única porta que ainda
   deixa um custo desatualizado passar em silêncio.
3. **4 DIFAL sinalizados** (AL, MA, PI, RN), esperando o contador.
4. **Três decisões da Intertech em aberto**: lista real de categorias de cliente, formato do
   código de ERP e formato do relatório de vendas — este último módulo nunca rodou com um
   arquivo de verdade.
5. **O teste em paralelo de 2 semanas (§4) não aconteceu.** É o critério de aceite da
   Sprint 14 e o único que prova que o sistema dá o mesmo número que a planilha.

### 5.3 Dois ajustes que dependem do painel (não são código)

- **Supabase → Authentication → Policies:** ligar a *proteção contra senha vazada*, que
  compara a senha nova com bases de senhas já vazadas. Está desligada.
- **GitHub → Settings → Secrets:** cadastrar `E2E_EMAIL` e `E2E_PASSWORD`. Sem eles, os
  testes de tela que exigem login ficam pulando no CI — só as telas públicas são cobertas.

O alerta do Supabase sobre a função `rls_auto_enable` é falso positivo: ela é um mecanismo
interno da própria plataforma (liga RLS em tabela nova), não é do projeto e não roda via API.
