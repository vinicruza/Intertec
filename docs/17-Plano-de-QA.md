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
| B2 — Clientes | ✅ executado 24/08/2026 em produção, 1 falha média |
| B3 — Insumos, Produtos e CMV | ✅ executado 24/08/2026, golden test do CMV passa, 4 falhas |
| B4 a B8 | ⏸️ pendentes |

**Bloqueio — resolvido em 24/08/2026.** A sessão de nuvem tinha egresso negado
(403 no CONNECT) para `intertec-lac.vercel.app` e `wdnontebtxnrsenvtucd.supabase.co`.
O QA passou a rodar numa **sessão local (Windows)**, onde os dois domínios
respondem normalmente. Se o QA voltar para a nuvem, o bloqueio volta — liberar os
domínios em Network access → Custom, mantendo a lista padrão.

**Decisões do cliente (23/08/2026):**
- Testar contra **produção**.
- Permitido **criar, editar e excluir** registros, desde que criados pelo QA e
  marcados com o prefixo `TESTE-QA`. Nunca tocar em registro real.
- Parar antes de qualquer ação destrutiva sobre dado real.

## 2. Ferramental

- `@playwright/cli` global (`playwright-cli`). Instalado na máquina local em
  24/08/2026: `npm install -g @playwright/cli` + `playwright-cli install-browser chromium`.
- Alvos de comando são **refs do snapshot** (`e20`), não texto. As refs mudam a
  cada navegação (`f1e87` → `f2e87`…); recapturar o snapshot depois de navegar.
- O CLI grava artefatos em `.playwright-cli/` na raiz — já está no `.gitignore`.
- **Config global não é necessária na máquina local.** O
  `~/.playwright/cli.config.json` descrito antes existia para o container: apontava
  para o Chromium do sistema e desligava o sandbox (obrigatório rodando como root).
  No Windows local o CLI usa o Chromium próprio e o sandbox fica ligado.
- **Login: quem digita a senha é a pessoa, não o agente.** A sessão é aberta com
  `playwright-cli -s=qa open --headed --persistent --profile .playwright-cli/qa-profile`,
  a pessoa faz o login nessa janela, e a sessão fica salva no perfil — o agente
  dirige o QA autenticado dali em diante, nos blocos seguintes, sem ver a senha.
  O perfil está sob `.playwright-cli/`, que o `.gitignore` já cobre.

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

## 6. Resultado do B2 — Clientes

Executado em 24/08/2026 contra **produção** (`intertec-lac.vercel.app`), sessão
autenticada como Super Administrador, navegador dirigido pelo `playwright-cli`.

| Teste | Esperado | Obtido | Resultado |
|---|---|---|---|
| Listar | lista carrega, contador `X de Y` | 65 clientes, filtro padrão "Só os sem categoria", `2 de 65` | OK |
| Filtro "Todos os clientes" | todos | `65 de 65` | OK |
| Filtro "Só os sem CNPJ/CPF" | subconjunto | `2 de 65` | OK |
| Filtro "Só os sem categoria" | subconjunto | `2 de 65` | OK |
| Busca por nome parcial | encontra | `HOSPITAL VETERINARIO` → 4 | OK |
| Busca por código | encontra | `7447` → 1 | OK |
| Busca por documento **sem** máscara | encontra | `49243485000133` → 1 | OK |
| Busca por documento **com** máscara | encontra (só dígitos) | `49.243.485/0001-33` → 1 | OK |
| Busca sem correspondência | estado vazio | `0 de 65` + "Nenhum cliente corresponde à busca." | OK |
| Formulário vazio | "Salvar" desabilitado | desabilitado | OK |
| Nome vazio | "Informe o nome do cliente." | idem; some ao preencher, "Salvar" habilita | OK |
| CNPJ dígito errado (`11222333000180`) | recusa | "CNPJ/CPF inválido — confira os dígitos." | OK |
| CNPJ dígitos repetidos (`11111111111111`) | recusa | recusado | OK |
| CPF inválido (`12345678900`) | recusa | recusado | OK |
| CPF válido (`11144477735`) | aceita | aceito | OK |
| CNPJ válido (`11222333000181`) | aceita | aceito | OK |
| Documento incompleto (`123`) | recusa + "Salvar" desabilitado | recusado, botão desabilitado | OK |
| CEP `1234` | "CEP precisa ter 8 dígitos." | idem | OK |
| Telefone `119` | "Telefone precisa ter DDD + 8 ou 9 dígitos." | idem | OK |
| E-mail `abc@` | "E-mail parece incompleto." | idem | OK |
| Campo válido limpa o erro | sem mensagem | sem mensagem nos 3 casos | OK |
| Buscar CEP (`01310100`) | preenche endereço | "Avenida Paulista", "Bela Vista", "São Paulo", "SP" | OK |
| Criar cliente | grava e volta à lista | total 65 → 66 | OK |
| Geração do código interno | tipo(2)+área(2)+sequencial | `1050-0003` (Hospital 10 + Cirurgia geral 50) | OK |
| Persistência após F5 | registro sobrevive | documento, UF, tipo, área, endereço — todos mantidos | OK |
| Editar | grava alteração | código externo `TESTE-QA-01` e número `1578` gravados | OK |
| Cancelar | descarta e volta | nome alterado descartado, volta a `/clientes` | OK |
| Console | sem erros | 0 mensagens (0 erros, 0 avisos) no bloco inteiro | OK |
| Rede | sem 4xx/5xx | nenhuma requisição com falha | OK |
| Responsividade 1280 / 768 / 390 | sem scroll horizontal | sem scroll nos três | OK |

### FALHA-02 — a lista esconde o código interno gerado (severidade média)

`app/pages/ClientesPage.tsx` (célula "Código cliente") renderiza:

```jsx
{c.external_code ? (<p>{c.external_code}</p>, c.code && <p>Interno: {c.code}</p>) : <Badge>sem código</Badge>}
```

O código **interno** (`c.code`) só é exibido aninhado dentro do ramo do código
**externo**. Quando o cliente tem código interno gerado mas nenhum código
externo, a lista mostra o selo **"sem código"**.

Isso contradiz o parágrafo explicativo logo abaixo da própria tabela — "O código
é gerado quando tipo e área estão preenchidos" — e engana exatamente na tarefa
para a qual a tela existe: categorizar a base. O operador categoriza um cliente,
o código É gerado no banco, e a lista continua dizendo "sem código". A conclusão
natural é que a categorização falhou.

**Comprovação.** O cliente `TESTE-QA Cliente B2` foi criado com tipo Hospital e
área Cirurgia geral. A lista exibiu "sem código"; a tela de detalhe do mesmo
cliente exibiu "Interno: 1050-0003". Depois de preencher só o código externo, a
lista passou a mostrar "TESTE-QA-01 / Interno: 1050-0003" — mesmo cliente, mesmo
código interno, que existia desde a criação.

O gatilho `set_customer_code` (migration `20260729000500_customer_segmentation.sql`)
está correto e não precisa de mudança. O defeito é só de exibição: mostrar o
código interno mesmo sem código externo, e reservar o selo "sem código" para
quem não tem nenhum dos dois.

### Ressalva à FALHA-01 em produção

O documento registrou 404 de favicon a cada visita. Em produção **não é 404**: o
rewrite do `vercel.json` (`/(.*)` → `/index.html`) captura `/favicon.ico` e
devolve **200 com `content-type: text/html`**. O ícone continua sem funcionar, e
o efeito colateral é maior que o original — *qualquer* caminho de asset
inexistente devolve 200/HTML em vez de 404, o que mascara asset quebrado. A
correção proposta (`public/favicon.ico` + `<link rel="icon">`) resolve o ícone,
mas não o mascaramento.

### Observações menores (não são falhas)

- O filtro padrão da lista é "Só os sem categoria". Ao criar um cliente já
  categorizado, o app volta para `/clientes` e o registro recém-criado **não
  aparece** — é preciso trocar o filtro para "Todos os clientes". Não é defeito
  (o filtro é deliberado, para a tarefa de categorização), mas é um degrau logo
  após salvar.
- "Cancelar" descarta alterações não salvas sem pedir confirmação.

### Dado de teste deixado em produção

`TESTE-QA Cliente B2` — id `1b072939-5f72-4934-a5ad-91396407f128`, código externo
`TESTE-QA-01`, interno `1050-0003`, CNPJ fictício válido `11.222.333/0001-81`.
Mantido para os blocos seguintes (B5 precisa de um cliente para a cotação).
Excluir ao encerrar o QA.

## 7. Resultado do B3 — Insumos, Produtos e CMV

Executado em 24/08/2026 contra **produção**, sessão de Super Administrador.
Valores conferidos contra as fixtures do `Calculations.md` (§2, §3), que por
regra do `CLAUDE.md` prevalece sobre qualquer outra fonte.

### Golden test do CMV — PASSA

`Campo Catarata 1,00 x 1,20 GR40` (fixture do `Calculations.md` §3):

| Componente | Custo esperado | Custo obtido | Participação obtida |
|---|---|---|---|
| Fita adesiva 9830 | 0,610275 | R$ 0,61 | 20,79% |
| Bag | 0,635108 | R$ 0,64 | 21,64% |
| Bobina SMS 40gr m² | 0,832364 | R$ 0,83 | 28,36% |
| Caixa 6 | 0,066542 | R$ 0,07 | 2,27% |
| Envelope 25x30 | 0,518020 | R$ 0,52 | 17,65% |
| Esterilização Horizont | 0,158133 | R$ 0,16 | 5,39% |
| Etiqueta adesiva catarata | 0,040000 | R$ 0,04 | 1,36% |
| Etiquetinha | 0,008958 | R$ 0,01 | 0,31% |
| Gráfica | 0,066000 | R$ 0,07 | 2,25% |
| **CMV** | **2,935400** | **R$ 2,94** | |

As nove linhas e as participações batem. **Camadas 1 e 2 estão corretas em
produção.**

### Demais testes

| Teste | Esperado | Obtido | Resultado |
|---|---|---|---|
| Listar insumos | lista carrega | 80 insumos, preço c/ e s/ imposto | OK |
| Criar insumo — fixture SMS 40gr | 21,80 × 0,04 = 0,872; × 0,7875 = 0,6867 | R$ 0,87 / R$ 0,69 | OK |
| Criar insumo — ICMS 18% | 10,00 × 0,5 = 5,00; × 0,7275 = 3,6375 | R$ 5,00 / R$ 3,64 | OK |
| Método "por fora" (§2) | `preço × (1 − ICMS − PIS)` | `precoSemImposto` confere | OK |
| Preço de compra vazio | recusa | "Informe o preço de compra.", não grava | OK |
| Listar produtos | lista carrega | 372 produtos, CMV cheio e sem mão de obra | OK |
| Criar produto | grava com código gerado | `CS0073`, CMV R$ 0,52 (= 0,52 × 1) | OK |
| Quantidade estruturada (§3) | Direta / Área / Lote | as três opções presentes | OK |
| Prévia de CMV na **edição** de produto | mostra custo e participação | "Custo: R$ 0,52 · Participação: 100,00%" | OK |
| Console | sem erros | 0 mensagens | OK |
| **Editar insumo** | grava alteração | **não grava** | **FALHA-03** |
| **Prévia de preço na edição de insumo** | mostra valores | **"—"** | **FALHA-04** |
| **Preço dos insumos reais** | visível e editável | **`purchase_price` vazio; tela não mostra preço** | **FALHA-05** |
| **Prévia de CMV no produto novo** | atualiza ao montar a ficha | **presa em "incompleto"** | **FALHA-06** |
| Quantidade zero / negativa | validar ou recalcular | prévia não reagiu — ver nota | INCONCLUSIVO |
| Histórico de custo | registra troca de preço | depende de gravar preço | BLOQUEADO por FALHA-03 |
| Override de CMV | — | não existe na tela de produto | REESCOPAR |
| Permissão do Comercial | Comercial não vê custo | sem usuário Comercial | BLOQUEADO |

### FALHA-03 — a edição de insumo não grava (severidade alta)

Abrir um insumo, alterar qualquer campo e clicar em "Salvar" **não faz nada**:
não navega, não mostra erro e não persiste. O evento `submit` dispara (verificado
com listener no `<form>`), mas a validação do `zodResolver` barra antes da
mutação, e nenhuma requisição sai para o Supabase — a lista de rede não tem
nenhum `PATCH`/`POST` em `inputs`.

Só os campos `name` e `purchase_price` renderizam mensagem de erro
(`InsumoFormPage.tsx:106` e `:114`); os demais são validados mas mudos. Por isso
o bloqueio é invisível: o operador clica em Salvar e a tela simplesmente não
responde.

**Reprodução** (dois registros distintos, refs recapturados a cada passo,
digitação real de teclado, recarga confirmando não-persistência):
`TESTE-QA Insumo B3` (21,80 → 25,00) e `TESTE-QA Insumo B3-2`, este último com
**todos** os campos preenchidos (categoria, unidades, ICMS, PIS). Nos dois, o
preço permaneceu o original após recarregar.

Criar insumo funciona normalmente — o defeito é só na edição.

**Consequência:** não há como manter preço de insumo pela tela. Como preço de
insumo é a Camada 1, da qual sai o CMV de 372 produtos, isso trava a manutenção
de custo do sistema inteiro.

### FALHA-04 — prévia de preço em branco na edição de insumo (severidade média)

Na edição, "Preço com imposto (calculado)" e "Preço sem imposto (calculado)"
mostram **"—"** mesmo com preço de compra, fator, ICMS e PIS preenchidos e
válidos. A prévia é `derivarPrecos(watch())` dentro de um `try/catch` que engole
a exceção (`InsumoFormPage.tsx:80-85`), então a falha é silenciosa.

Comprovado por A/B: os mesmos valores no formulário **novo** calculam
corretamente (R$ 0,87 / R$ 0,79); carregados no de **edição**, dão "—".
Verificado também com digitação real, para descartar artefato de automação.

### FALHA-05 — insumos reais não têm preço de compra e a tela não mostra preço nenhum (severidade média)

Todos os insumos reais amostrados têm `purchase_price` vazio — inclusive os com
"Atualizado" recente (18/08 e 20/08): `3M Flexform`, `Adere Medical Tape`, `Bag`,
`Bobina Laminado m²`, `Bobina SMS 30 gr m²`, `Bobina TNT Azul 30gr m²`. O banco
tem `price_with_tax` e `price_without_tax` gravados (a lista os exibe), mas a
tela de edição não mostra nem um nem outro: os dois campos calculados ficam "—"
(FALHA-04) e o preço de compra vem em branco.

Como `purchase_price` é obrigatório (`InsumoFormPage.tsx:24`), o insumo não pode
ser salvo sem que alguém digite um preço de compra — **que a tela não informa em
lugar nenhum**. O risco: digitar o valor arredondado que aparece na lista. Para a
Bobina SMS 40gr isso trocaria 0,872 por 0,87, mudando o preço sem imposto de
0,6867 para 0,685125 e, com ele, o CMV de todo produto que a consome — sem aviso.

A validação obrigatória protege contra zerar o preço (testado: recusa com
"Informe o preço de compra."), mas o efeito é que o cadastro fica **somente
leitura na prática**.

### FALHA-06 — prévia de CMV não aparece ao montar ficha de produto novo (severidade média)

No formulário de **novo produto**, com Tipo=Insumo, insumo escolhido,
Quantidade por=Direta e Quantidade=1, a linha mostra custo "—" e o rodapé
continua em "Selecione todos os componentes para ver o CMV.". O `<select>` tem
UUID válido no DOM (`componentes.0.refId`), e a condição da prévia é
`componentes.every(c => c.refId)` (`ProdutoFormPage.tsx:100`).

Que o estado do formulário estava correto ficou provado ao salvar: o produto foi
gravado com o componente e o CMV certo (`CS0073`, R$ 0,52). Ou seja, **só a
prévia falha** — mas ela é justamente o retorno que o operador usa para montar a
ficha. Na tela de **edição** do mesmo produto a prévia aparece normalmente.

### Nota sobre quantidade zero/negativa — INCONCLUSIVO

Ao alterar a quantidade de um componente para `0` e `-1` na edição, a prévia
permaneceu em R$ 0,52, sem recalcular. Não afirmo defeito: a prévia não reagiu às
alterações feitas por automação, então não é possível separar "o sistema aceita
quantidade zero sem recalcular" de "a prévia não se atualiza sob automação".
**Precisa de conferência manual**: abrir um produto de teste, digitar 0 e -1 na
quantidade à mão e observar se a prévia recalcula, se há validação e o que grava.

### Reescopo — "override de CMV"

O item consta no B3, mas não existe campo de override de CMV na tela de produto.
Os únicos overrides do sistema são por pedido (DIFAL, `SimuladorPage.tsx:135`).
Sugestão: mover o item para o B5 ou remover do plano, conforme a intenção original.

### Dados de teste deixados em produção

- `TESTE-QA Insumo B3` — 21,80 × 0,04, ICMS 12%, PIS 9,25%
- `TESTE-QA Insumo B3-2` — 10,00 × 0,5, ICMS 18%, PIS 9,25%
- `TESTE-QA Produto B3` — código `CS0073`, ficha com 1 componente, CMV R$ 0,52

## 8. Como retomar

1. Abrir a sessão do navegador e fazer login (ver "Login" na seção 2). O perfil
   `.playwright-cli/qa-profile` guarda a sessão entre execuções.
2. Executar **B4 — Kits** em diante, um bloco por vez, registrando o resultado
   neste arquivo como nas seções 5, 6 e 7.
3. Os registros `TESTE-QA` já em produção servem de insumo aos próximos blocos:
   o cliente para a cotação do B5, o produto `CS0073` para a composição do B4.

### Pendências abertas

| Item | Severidade | Onde |
|---|---|---|
| FALHA-01 — favicon (200/HTML em produção, não 404) | baixa | seção 5 + ressalva na 6 |
| FALHA-02 — lista de clientes esconde o código interno | média | seção 6 |
| ~~FALHA-03 — edição de insumo não grava~~ | ~~alta~~ | ✅ **corrigida** (seção 9) |
| ~~FALHA-04 — prévia de preço "—" na edição de insumo~~ | ~~média~~ | ✅ **corrigida** (seção 9) |
| FALHA-05 — insumos reais sem preço de compra visível | média | seção 7 |
| FALHA-06 — prévia de CMV ausente no produto novo | média | seção 7 |

**A conferir à mão** (não conclusivo por automação): quantidade zero/negativa na
ficha técnica — ver nota na seção 7.

**A reescopar:** "override de CMV" não existe na tela de produto (seção 7).

**B1 incompleto** — falta a matriz 4 perfis × 18 rotas com login real. Exige um
usuário por perfil (admin, financeiro, comercial, produção); hoje só há sessão de
Super Administrador. Isso também bloqueia o item "permissão do Comercial" do B3.
Criar esses acessos por `/usuarios` é de quebra o teste do fluxo
`gestao-usuarios`: `auth.admin.createUser` → gatilho cria perfil inativo →
`save_user_profile` → `mark_password_provisional`.

**Limpeza** — excluir ao encerrar o QA: `TESTE-QA Cliente B2`,
`TESTE-QA Insumo B3`, `TESTE-QA Insumo B3-2`, `TESTE-QA Produto B3` (`CS0073`).

## 9. Correções aplicadas

### FALHA-03 e FALHA-04 — causa única, corrigida em 24/08/2026

**Causa.** O PostgREST entrega colunas `numeric` como **número** no JSON, não
como texto. `app/lib/db/insumos.ts` declarava esses campos como `string` e o
comentário afirmava "numeric chega como texto — nunca float". Com o tipo
mentindo, o compilador nunca acusou nada.

Daí saíam os dois sintomas:

- `paraDecimal` chamava `.trim()`, que não existe em número. A exceção era
  engolida pelo `try/catch` da prévia, que ficava em "—".
- O esquema do zod exigia `z.string()`. Os campos digitados viravam texto e
  passavam; os intocados seguiam número e reprovavam. Como só `name` e
  `purchase_price` renderizam erro, o bloqueio era invisível: o submit
  disparava, a mutação nunca era chamada e nenhuma requisição saía.

**Precedente.** O mesmo defeito já havia sido corrigido na ficha de produto —
ver `tests/produtos/quantidade-form.test.ts`, "aceita números vindos do banco".
A correção não foi aplicada a insumos na época.

**Correção.**

| Arquivo | Mudança |
|---|---|
| `app/lib/db/insumos.ts` | tipo honesto (`number` onde é numeric) e `paraDecimal` aceitando texto ou número |
| `app/pages/InsumoFormPage.tsx` | converte para texto ao carregar o registro |
| `app/pages/KitFormPage.tsx` | conversão na fronteira, apontada pelo compilador após o tipo virar honesto |
| `tests/cadastro/insumo-form.test.ts` | regressão, com a fixture do Calculations.md §2 |

O teste foi conferido nos dois sentidos: sem a correção falha com
`TypeError: valor.trim is not a function`; com ela passa.

**Verificação de ponta a ponta** (build local servido em 127.0.0.1:4173, sessão
real, registro `TESTE-QA Insumo B3`):

| Antes | Depois |
|---|---|
| prévia em "—" | R$ 0,87 / R$ 0,69, e recalcula ao digitar |
| Salvar não fazia nada | grava e volta para a lista |
| histórico de custo bloqueado | registra `R$ 0,69 → R$ 0,79` |

Com isso o item "histórico de custo" do B3, que estava BLOQUEADO, passa a OK.

**Portão:** `tsc` limpo, `eslint` limpo, **509 testes passando**, build OK.

**Ainda aberta:** a FALHA-06 foi reconferida no build corrigido e **persiste** —
causa diferente, não compartilha raiz com estas duas.
