# 17 — Plano de QA funcional com Playwright

> Aberto em 23/08/2026. Documento de trabalho: o QA foi mapeado e iniciado numa
> sessão de nuvem que **não alcança a produção** (política de rede). Este arquivo
> existe para que a sessão seguinte continue sem refazer o mapeamento.

## 1. Situação

| Item | Estado |
|---|---|
| Mapeamento do sistema | ✅ concluído (seção 3) |
| Plano de testes | ✅ definido (seção 4) |
| B1 — acesso e superfície pública | ✅ executado, 1 falha baixa |
| B2 a B8 | ⏸️ pendentes, dependem de acesso autenticado |

**Bloqueio:** a sessão de nuvem tem egresso negado (403 no CONNECT) para
`intertec-lac.vercel.app` e `wdnontebtxnrsenvtucd.supabase.co`. Sem isso não há
teste autenticado. Resolver rodando o QA numa **sessão local**, ou liberando os
domínios no ambiente de nuvem (Network access → Custom, mantendo a lista padrão).

**Decisões do cliente (23/08/2026):**
- Testar contra **produção**.
- Permitido **criar, editar e excluir** registros, desde que criados pelo QA e
  marcados com o prefixo `TESTE-QA`. Nunca tocar em registro real.
- Parar antes de qualquer ação destrutiva sobre dado real.

## 2. Ferramental

- `@playwright/cli` global (`playwright-cli`), skill em `~/.claude/skills/playwright-cli`.
- Config global em `~/.playwright/cli.config.json`: aponta para o Chromium do
  ambiente e desliga o sandbox (obrigatório rodando como root em container).
- Alvos de comando são **refs do snapshot** (`e20`), não texto.
- O CLI grava artefatos em `.playwright-cli/` na raiz — já está no `.gitignore`.

## 3. Mapa do sistema

Rotas de `app/App.tsx`, menu de `app/lib/roles.ts`.

### Operação
| Módulo | Rota | Ações |
|---|---|---|
| Início | `/` | painel |
| Simulador de pedido | `/simulador`, `/simulador/:id` | criar/reabrir cotação, itens, condições, expedição, cascata |
| Histórico de pedidos | `/pedidos` | 8 filtros + busca |
| Detalhe do pedido | `/pedidos/:id` | enviar p/ aprovação, aprovar/recusar, gerar pedido, cancelar, registrar perda, duplicar, reabrir, frete escolhido, versões |
| Ficha do pedido | `/pedidos/:id/ficha` | visualização + impressão |
| Aprovações | `/aprovacoes` | fila (visível a quem aprova, via `approval_settings`) |
| Clientes | `/clientes`, `/novo`, `/:id` | identificação, endereços, contatos |
| Kits | `/kits`, `/:id` | composição, embalagem/esterilização |
| Produtos e fichas | `/produtos`, `/novo`, `/:id` | ficha técnica, CMV |
| Insumos | `/insumos`, `/novo`, `/:id` | custo, histórico |
| Vendas do ERP e consumo | `/vendas-consumo` | importação, consumo |
| DRE mensal | `/dre` | sem link no menu (`oculto: true`), rota viva |
| Meu perfil | `/perfil` | trocar senha |

### Administração (só `admin`)
| Módulo | Rota | Ações |
|---|---|---|
| Usuários | `/usuarios` | criar acesso, editar, redefinir senha, excluir |
| Cadastros | `/cadastros` | transportadoras, categorias, tipos de cliente, áreas de atuação, modos de pagamento, motivos de perda, nomenclatura NF |
| Configurações | `/configuracoes` | alíquotas, comissão, frete, faixas de margem, aprovação |
| Integridade dos dados | `/integridade` | saúde da base |
| Monitoramento | `/monitoramento` | só super admin |

**Perfis:** admin, financeiro, comercial, producao (+ super admin).
Status de pedido: `simulation`, `closed`, `lost`; aprovação: `rascunho`,
`pendente`, `aprovado`, `recusado`.

### Escopo inexistente (confirmado pelo cliente em 23/08/2026)
Não existem no sistema: **ordem de produção**, **logística** e **anexos/documentos**.
**Expedição** e **transportadoras** existem, mas como aba dentro do pedido e lista
em Cadastros — não como módulos. Não há módulo "Relatórios": há DRE e exportações
Excel (`lib/export/`).

## 4. Blocos de teste

- **B1 — Acesso e permissões.** ✅ Login, rotas protegidas, validações, erro de
  rede, responsividade. Falta: matriz 4 perfis × 18 rotas com login real.
- **B2 — Clientes.** Listar, buscar, criar, editar, endereços, contatos,
  cancelamento, persistência após F5, documento inválido.
- **B3 — Insumos, Produtos e CMV.** Insumo + histórico de custo, produto + ficha,
  quantidade zero/negativa, override de CMV, permissão do Comercial.
- **B4 — Kits.** Composição, embalagem/esterilização, custo, kit vazio.
- **B5 — Ciclo do pedido.** Criar cotação → itens/kit → condições → expedição e
  transportadora → cascata → rascunho → versões → aprovação → gerar pedido →
  perda (motivo ≥ 5 caracteres) → duplicar. Cancelar: validar até o passo anterior.
- **B6 — Ficha e impressão.** Conferência de valores, layout `no-print`, PDF.
- **B7 — Histórico, filtros e ordenação.** 8 filtros isolados e combinados, busca,
  resultado vazio, persistência ao voltar.
- **B8 — Administração.** Cadastros, Configurações (efeito no cálculo do pedido),
  Usuários, Integridade.
- **Transversal.** Console, 4xx/5xx, lentidão, links quebrados, botões inertes,
  responsividade 1280/768/390.

## 5. Resultado do B1

Executado contra o app local, no mesmo código da `main`.

| Teste | Resultado |
|---|---|
| Rota protegida sem sessão redireciona | OK |
| 17 rotas protegidas → `/login` | OK |
| Campos vazios → "Informe um e-mail válido." + "Informe a senha." | OK |
| E-mail malformado → mensagem, permanece em `/login` | OK |
| Banco fora do ar → "Sem conexão com o servidor…", botão reabilita | OK |
| Responsividade 1280/768/390 | OK, sem scroll horizontal |

### FALHA-01 — 404 de favicon em toda visita (severidade baixa)
`index.html` não declara `<link rel="icon">` e não existe pasta `public/`, então o
navegador pede `/favicon.ico` e recebe 404 em toda visita — ruído permanente no
console. Correção: `public/favicon.ico` + `<link rel="icon">`. O logo existe em
`components/brand/intertech-logo.svg`.

## 6. Como retomar

1. Garantir acesso à produção (sessão local, ou domínios liberados no ambiente).
2. Criar usuário de QA pela tela `/usuarios` → "Criar acesso" (perfil
   Administrador). O fluxo real é `supabase/functions/gestao-usuarios`:
   `auth.admin.createUser` → gatilho cria perfil inativo → `save_user_profile` →
   `mark_password_provisional` (força troca no 1º acesso — testar esse fluxo).
3. Guardar credenciais no `.env` local (fora do Git): `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`, `E2E_EMAIL`, `E2E_PASSWORD`.
4. Executar B2 em diante, um bloco por vez, com relatório consolidado por módulo:
   fluxo, OK/FALHA/BLOQUEADO, severidade, passos, esperado × obtido, evidência,
   erro de console/rede.
