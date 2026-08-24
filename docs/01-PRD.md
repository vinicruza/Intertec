# PRD — Intertec CMV e Rentabilidade

> **Versão:** 2.0 — 06/07/2026
> **Documentos companheiros:** `Calculations.md` (regras de cálculo e golden tests — fonte única de verdade dos cálculos). Em caso de conflito entre este PRD e o Calculations.md, o Calculations.md prevalece.
> **Prioridade do produto:** calcular o CMV correto de produtos e kits e, a partir dele, gerar um DRE gerencial mensal o mais preciso possível.

---

## 1. Visão geral

Sistema web independente para a Intertec (indústria de descartáveis hospitalares: aventais, campos cirúrgicos, kits estéreis e não estéreis), substituindo a planilha "Rentabilidade 2026".

O sistema cobre a cadeia completa: cadastro de insumos → ficha técnica → CMV de produtos e kits → alocação de despesas → simulação e fechamento de pedidos → DRE gerencial mensal.

Aplicação própria, com banco próprio e login próprio. Não é módulo de outro sistema.

### O que muda em relação à planilha (resumo executivo)

| Planilha hoje | Sistema |
|---|---|
| Busca de custo por nome do produto (SUMIF) — 19 produtos retornam custo zero em silêncio, 1 retorna custo dobrado | Chave por ID; custo zero é erro bloqueante |
| Uma simulação por aba; a próxima apaga a anterior | Histórico completo de simulações e pedidos |
| 12 abas de vendedor que divergiram entre si (fórmulas diferentes, bugs locais) | Um único motor de cálculo, parametrizado por canal |
| Margem ambígua (3 números diferentes para o mesmo pedido) | Cascata de 4 níveis com nomes precisos (estrutura de DRE) |
| Custos vivos: mudar um insumo muda o passado | Snapshot imutável no fechamento do pedido |
| Kits via colunas duplicadas manualmente | Composição em cascata com recálculo automático |
| Sem DRE | DRE gerencial mensal com variação de absorção |

---

## 2. Problema atual

A Intertec vende produtos individuais e kits personalizados. Existem 325 produtos e 85 insumos na planilha. Os kits podem combinar qualquer subconjunto dos produtos, então o número de composições possíveis é gigantesco — não faz sentido pré-cadastrar todos.

Problemas concretos já identificados na planilha (detalhados no Calculations.md, Seção 9): margem do pedido que não desconta a despesa alocada, imposto calculado sobre base errada em uma aba, produto com custo dobrado e outro com custo zero por duplicidade de nome, 19 produtos sem custo por divergência de grafia, e ausência total de histórico.

## 3. Objetivos

1. CMV unitário correto e auditável para os 325 produtos e para qualquer kit montado sob demanda.
2. DRE gerencial mensal preciso, usando custos congelados no momento de cada venda e despesa fixa real do mês.
3. Simulação de pedido em menos de 1 minuto, com margem de contribuição confiável e alertas.
4. Eliminar as 9 classes de erro encontradas na planilha (Calculations.md §9).
5. Histórico completo: pedidos, custos, alterações de parâmetros.

## 4. Perfis de usuário

| Perfil | Pode |
|---|---|
| Administrador | Tudo, incluindo a área restrita (usuários, cadastros, configurações, integridade) |
| Financeiro | Ver e editar custos, despesas, DRE, dashboards; **não** entra na área restrita |
| Comercial | Montar kits, simular e fechar pedidos; **não** vê nem edita custos de insumos |
| Produção | Consultar produtos, fichas técnicas e composições (somente leitura) |

### 4.1 Área restrita (decisão de 30/07/2026)

Quatro telas mexem em regra, parâmetro ou acesso — mudar algo nelas muda o resultado de todo pedido, ou muda quem entra no sistema. Elas aparecem no menu num bloco separado, **Administração**, e só o Administrador as vê: **Usuários**, **Cadastros**, **Configurações** e **Integridade dos dados**. O Financeiro perdeu a escrita nas listas de referência (tipo de cliente, área de atuação, motivo de perda, categoria de produto) — continua lendo, porque Clientes e Pedidos mostram esses nomes.

DRE, Vendas do ERP e Insumos **continuam** com o Financeiro: são as telas de trabalho dele, não configuração.

### 4.2 Super Administrador

Acima dos Administradores existe uma conta de dono do sistema. Ela é um Administrador com uma marca a mais (`profiles.is_super_admin`), não um quinto perfil — a segurança do banco toda está escrita sobre os quatro perfis acima, e criar um quinto obrigaria a reescrever dezenas de políticas.

O que ela tem de exclusivo:

- **não aparece** na lista de usuários dos Administradores da Intertech, nem pela tela nem pela API;
- **não pode** ser alterada, desativada ou removida por nenhum Administrador;
- a marca só é dada na instalação, por migração — nenhuma tela promove ninguém a dono do sistema.

Conta em produção: `vinicius@avgestaofinanceira.com.br`.

### 4.3 Cadastro de usuários

Todo o ciclo acontece dentro do sistema, na tela de Usuários: criar o acesso (nome, e-mail, perfil e senha provisória), redefinir senha, desativar e excluir. Ninguém precisa abrir o painel do Supabase.

Criar credencial, trocar a senha de outra pessoa e apagar acesso exigem a chave de administração do projeto, que não pode ficar no navegador — essas três passam pela Edge Function `gestao-usuarios`, que confere a permissão no banco (`assert_can_manage_user`) antes de agir.

Senha provisória vale uma vez: no primeiro acesso (e depois de qualquer redefinição pelo Administrador) o sistema só mostra a tela de definir senha, porque a senha entregue por outra pessoa não é segredo de ninguém. Depois disso, cada um troca a própria senha em **Meu perfil**.

Excluir só é possível para quem nunca registrou nada. Quem já fechou pedido, montou kit ou mudou preço é **desativado**, nunca excluído: o histórico tem de continuar mostrando quem fez cada coisa.

## 5. Conceitos e regras estruturais

### 5.1 Canal (novo — Decisão D4)

Todo pedido pertence a um canal. O canal parametriza o cálculo:

- aplica DIFAL: sim/não (Revendas: não; venda a contribuinte)
- fonte da alíquota de imposto: tabela ICSM por UF (padrão para todos os canais)
- comissão padrão: % (2,5% padrão; Externos 6,1%)
- modelo de frete: manual | % da receita por UF (tabela Portal — canais marketplace)

Canais na carga inicial: Interno (Patricia, Camila, Isabela, Priscilene, Suellen, Nathalia, Edmilson), Marketplace (Mari, Temporária), Externos, Revendas, Descpro. Vendedor é entidade separada, vinculada a canal.

### 5.2 Período de alocação (Decisão D3) — **DESCONTINUADO em 29/07/2026**

Módulo retirado do produto (ver §6.4). As tabelas e os snapshots de pedidos já fechados permanecem no banco como dado histórico.

### 5.3 Snapshot de custos (novo — Decisão D7)

Simulação usa custos vigentes. Ao **fechar** um pedido, o sistema grava snapshot imutável por item: CMV unitário, despesa unitária, alíquotas de imposto/DIFAL aplicadas, comissão, frete e composição expandida do kit (JSON). Pedido fechado nunca é recalculado. Reabrir exige perfil Administrador e gera novo snapshot com trilha de auditoria.

### 5.4 Cascata de margem (Decisões D1 e D2)

Todo pedido, simulação, e o DRE exibem a mesma cascata:

```
Receita bruta
(−) Impostos sobre venda + DIFAL          = Receita líquida
(−) CMV                                   = Lucro bruto
(−) Frete líquido + Comissão              = MARGEM DE CONTRIBUIÇÃO  ← métrica oficial e última linha
```

A linha `(−) Despesa alocada (rateio)` foi retirada em 29/07/2026 junto com o módulo de Alocação (§6.4). Nenhum número usado para decisão mudou: a margem de contribuição sempre foi calculada **antes** do rateio.

Percentuais sempre sobre a **receita líquida**, com o valor em R$ ao lado. Alertas de status usam a margem de contribuição.

### 5.5 Faixas de status de margem (configuráveis)

| Status | Faixa (margem de contribuição / receita líquida) |
|---|---|
| Boa | ≥ 40% |
| Atenção | 25% a 40% |
| Crítica | 10% a 25% |
| Negativa | < 10% |

Percentuais em tabela de configuração, editáveis pelo Administrador.

## 6. Módulos

### 6.1 Cadastro de Insumos

Campos: nome, categoria, fornecedor, **unidade de compra, preço de compra, fator de conversão, unidade de consumo** (o preço de consumo é derivado — ex.: bobina comprada por kg, consumida por m²; ver Calculations.md §2), ICMS, PIS/COFINS, preço sem imposto (calculado), data de atualização, status.

O insumo também tem a flag **é mão de obra** (ex.: custo de costureira). Ela não muda o CMV cheio — muda o CMV de competência, que exclui mão de obra para o DRE (Calculations.md §4.2).

Toda alteração de preço gera registro em `input_cost_history` (valor anterior, novo, quem, quando). Alterar preço dispara recálculo do CMV vigente de todos os produtos e kits que usam o insumo (cascata), sem tocar em pedidos fechados.

### 6.2 Cadastro de Produtos

Campos: código, nome, categoria, tipo, estéril/não estéril, tamanho, gramatura, status. CMV unitário, despesa unitária e custo total são **calculados**, nunca digitados.

### 6.3 Ficha Técnica

Componentes de dois tipos: **insumo** ou **produto** (composição em cascata — Calculations.md §4). A quantidade consumida é armazenada como expressão estruturada, não só o número final:

- por área: largura × comprimento ÷ rendimento (ex.: 1,00 × 1,20 ÷ 0,99)
- por lote: 1 ÷ tamanho do lote (ex.: 1 caixa para 150 unidades)
- direta: número simples

Regras: proibir referência circular (A contém B que contém A — validação na gravação); CMV do produto = soma dos custos dos componentes; participação % de cada componente exibida.

### 6.4 Alocação de Despesas — **REMOVIDO em 29/07/2026**

Decisão do cliente: o módulo sai. A empresa passou a raciocinar por margem de contribuição, e o rateio só alimentava uma linha informativa depois dela. Detalhamento em `docs/07-Reuniao-Intertech-2026-07-16.md` §11.

Saíram: as telas de alocação, a linha de rateio da cascata (§5.4) e a variação de absorção do DRE (§6.8). Permanecem no repositório, sem uso em tela: o módulo puro de cálculo, os golden tests T4/T5 e os snapshots de pedidos fechados.

### 6.5 Kits

Kit = composição de produtos com quantidades. Código, nome, descrição, composição, custos calculados, status, criado por, data.

**Assinatura única:** composição ordenada por ID do produto — `produto_3:2|produto_7:1|produto_12:5`. Ao salvar, se a assinatura já existe, o sistema oferece reutilizar o kit existente em vez de duplicar. Golden test T10.

**Embalagem e esterilização do kit:** o envelope é um só e a caixa de esterilização é uma só por kit, não por produto dentro dele. São insumos com quantidade por kit, somados ao CMV em cima da soma dos produtos e exibidos destacados (Calculations.md §4.1). Entram na assinatura, porque mudam o custo. Golden test T11.

CMV e custo total do kit = soma ponderada dos componentes + embalagem (Calculations.md §4), com recálculo em cascata quando um insumo ou produto muda.

### 6.6 Simulador de Pedido

Entrada: cliente, UF, vendedor (→ canal), itens (produto ou kit, quantidade, preço de venda), frete, flag frete por conta do cliente, comissão (default do canal, editável com auditoria).

Saída: cascata completa (§5.4) por item e por pedido, status de margem, e alertas (§7). Fórmulas e fixture completo no Calculations.md §6.

Ações: salvar simulação, duplicar, **fechar pedido** (gera snapshot §5.3).

### 6.7 Histórico de Pedidos

Lista com filtros (período, cliente, vendedor, canal, UF, produto/kit, status de margem). Ações: ver detalhes (com snapshot), **editar** (05/08/2026 — só rascunho ou recusado; reabre o Simulador com os dados carregados em `/simulador/:id`), duplicar como nova simulação, exportar.

### 6.8 DRE Gerencial Mensal (novo — razão de existir do sistema)

Para o mês selecionado:

```
Receita bruta            = Σ pedidos fechados no mês
(−) Impostos + DIFAL     = dos snapshots
= Receita líquida
(−) CMV                  = Σ CMV dos snapshots (custo do momento da venda)
= Lucro bruto
(−) Frete + Comissões    = dos snapshots
= Margem de contribuição
(−) Despesa fixa REAL do mês   ← digitada/importada pelo Financeiro, não é a soma dos rateios
= Resultado operacional

```

A linha informativa de **variação de absorção** saiu com o módulo de Alocação (§6.4). Ela ainda aparece em meses cujos pedidos fechados têm rateio gravado no snapshot — histórico não se reescreve.

Aberturas: por canal, por vendedor, por categoria de produto, por cliente. Comparativo entre meses. Exportação em xlsx/PDF.

### 6.9 Dashboard

Cards e rankings sobre os dados dos pedidos fechados e simulações: receita, margem de contribuição média, pedidos com margem crítica/negativa, ranking de produtos, kits, clientes e vendedores. Mesmos filtros do histórico.

### 6.10 Importação Inicial (antecipada — ver roadmap)

Importa da planilha: insumos, produtos, fichas técnicas, alocação, tabelas ICSM/DIFAL/Portal. Gera **relatório de reconciliação** obrigatório:

- recálculo dos 325 CMVs comparado com a coluna Input da Alocação (toda divergência > R$ 0,01 listada)
- correções aplicadas na carga: duplicidade do "Campo de Mesa 2,00 x 2,00 Não Estéril" (linha 184 relabelada para 1,50 x 1,50 NE), 19 nomes divergentes unificados por ID
- itens marcados para confirmação humana: 4 UFs da tabela DIFAL (AL, MA, PI, RN), periodicidade dos R$ 450.000, impacto da mudança do Descpro de 10% fixo para tabela ICSM

### 6.11 Configurações

Tabelas editáveis (Admin): ICSM por UF, DIFAL por UF, frete % por UF (Portal), faixas de margem, canais e seus parâmetros, comissões por vendedor, despesa fixa mensal real (para o DRE).

## 7. Validações obrigatórias

Bloqueantes (impedem a ação): produto sem ficha técnica usado em pedido; CMV = 0 em item de pedido; referência circular em ficha/kit; preço de venda abaixo do custo total sem confirmação de Administrador; fechamento de pedido sem UF, comissão ou definição de frete.

Alertas (permitem com aviso): insumo com custo desatualizado há mais de N dias (configurável); margem abaixo do mínimo; kit com assinatura já existente; DIFAL aplicável e zerado.

## 8. Requisitos técnicos

- React + TypeScript + Vite; Tailwind + shadcn/ui; React Hook Form + Zod; TanStack Query; Recharts.
- Supabase (Postgres + Auth + RLS); migrations versionadas.
- Deploy: **Vercel conectado ao GitHub** (Lovable fora do fluxo).
- **Motor de cálculo em módulo puro e isolado** (`lib/calculations/`), sem dependência de UI ou banco, com 100% dos golden tests do Calculations.md §11 passando. Nenhum cálculo financeiro em componente de tela.
- Multi-tenant preparado, não implementado: `tenant_id` em todas as tabelas com valor único fixo; sem telas de gestão de tenant; RLS simples por usuário/perfil. (Decisão consciente: preparar o banco, adiar o resto.)
- Precisão: cálculos em precisão total (numeric no Postgres, sem floats para dinheiro); arredondamento a 2 casas apenas na exibição e nos totais persistidos de pedidos fechados — replicando a planilha (Calculations.md §9.9).
- Auditoria (`audit_logs`): alterações de preço de insumo, fator, parâmetros de canal, overrides de comissão, reabertura de pedido.

## 9. Banco de dados (entidades)

`tenants`, `users/profiles`, `channels` (D4), `sellers`, `suppliers`, `customers`, `inputs`, `input_cost_history`, `products`, `product_components` (ficha técnica — componente insumo OU produto), `expense_allocation_periods` + `expense_allocations` (D3 — descontinuadas, mantidas por histórico), `kits`, `kit_items`, `kit_packaging` (embalagem/esterilização do kit), `orders`, `order_items` (com campos de snapshot — D7), `real_monthly_expenses` (DRE), `tax_tables` (ICSM/DIFAL/Portal), `margin_rules`, `audit_logs`.

Modelagem detalhada em `03-Banco-de-Dados.md` (documento da Sprint 1).

## 10. Roadmap (validação antecipada — mudança estrutural vs. plano original)

O risco nº 1 do projeto é o sistema dar números diferentes da planilha e perder a confiança do time. Por isso a importação e a reconciliação vêm logo depois do motor de cálculo, não no final.

| Sprint | Entrega | Critério de aceite |
|---|---|---|
| 1 | Estrutura do projeto, docs no repo, arquitetura | docs/ completa; CI com lint+test |
| 2 | Banco de dados e migrations | schema aplicado; seeds mínimos |
| 3 | **Motor de cálculo puro** (insumo → CMV → alocação → pedido) | golden tests T1–T7 e T9 passando |
| 4 | **Importador da planilha + relatório de reconciliação** | 325 CMVs reconciliados; divergências explicadas |
| 5 | Autenticação, perfis e permissões | 4 perfis funcionando com RLS |
| 6 | Cadastro de insumos + histórico de custos + recálculo em cascata | T8 passando |
| 7 | Cadastro de produtos + ficha técnica | validação circular; participação % |
| 8 | ~~Alocação de despesas com períodos mensais~~ | **Removido em 29/07/2026** (§6.4) |
| 9 | Kits + assinatura única | T10 passando; dedupe funcionando |
| 10 | Simulador de pedidos + validações | fixture Patricia reproduzido na tela |
| 11 | Fechamento com snapshot + histórico de pedidos | pedido fechado imutável |
| 12 | DRE mensal + despesa real + variação de absorção | DRE de um mês simulado bate com conferência manual |
| 13 | Dashboard | rankings e filtros |
| 14 | Testes de ponta a ponta, ajustes, treinamento | time simulando pedidos reais em paralelo com a planilha por 2 semanas |

Regra de operação com o Claude Code: uma sprint por vez, commits pequenos, testes das funções de cálculo obrigatórios em toda sprint, nenhuma tela antes da Sprint 5.

### 6.12 Vendas do ERP e consumo de insumos (novo — reunião 16/07/2026)

Importação do relatório de vendas por código vindo do sistema de faturamento, com conciliação contra código semântico, código de ERP e código legado. O que não casa fica registrado e visível como pendência — nunca é descartado em silêncio.

A partir das vendas conciliadas, o sistema explode a composição até o insumo e responde quanto se consumiu de cada um no período (Calculations.md §10.1). Reimportar o mesmo mês substitui o lote anterior.

### 6.13 Código de produto para o ERP (novo — reunião 16/07/2026)

Código numérico **paralelo** ao código semântico, com total de dígitos e dígitos de categoria configuráveis, e prefixo numérico por categoria. Desligado por padrão: o limite real do ERP ainda não foi confirmado pela Intertech, e foi levantado em reunião que os atributos do produto podem não caber no código. A geração é manual, só do Administrador, e nunca altera código já emitido.

### 6.14 Cadastro de clientes e ficha do pedido (novo — formulário 05/08/2026)

O formulário de papel que acompanha o pedido até a mesa da conferência pede 24 campos; o sistema
tinha 6. Entram agora os que não encostam em cálculo:

- **Cadastro do cliente** (tela nova — até aqui só existia a categorização): CNPJ/CPF com
  conferência de dígito verificador, CEP de faturamento, CEP de entrega, contato, telefone,
  e-mail. Documento duplicado é bloqueado, com o nome do cliente que já o tem.
  A busca de CNPJ e de CEP passa pela Edge Function `consulta-receita` (24/08/2026), com o
  caminho direto do navegador como reserva. É conveniência, nunca obrigação: todo campo que ela
  preencheria pode ser digitado, e falha de consulta não impede salvar o cliente nem afeta
  simulador, pedidos ou qualquer cálculo.
- **Expedição do pedido**: transportadora (lista editável em Cadastros), peso, volumes e CEP de
  entrega deste pedido — que sobrepõe o do cadastro sem alterá-lo, e sai destacado na ficha
  quando difere. Preenchível **depois** do fechamento (§5.3 continua valendo para o dinheiro).
- **Condições**: prazo de pagamento em dias e observação, ambos congelados no fechamento.
- **Ficha impressa** redesenhada no formato do formulário: cabeçalho do cliente, valor total por
  linha e subtotal, bloco de expedição e rodapé. Campo em branco vira linha para preencher à mão,
  porque os 13 mil clientes herdados da planilha ainda não têm cadastro completo.

**Fora deste escopo, por dependerem de decisão do cliente:** o bloco fiscal do formulário (ST,
FCP em linha própria e o TOTAL a cobrar). Ver Calculations.md §12.

## 11. Fora de escopo da v1

Cálculo automático de legislação tributária (alíquotas são tabelas editáveis, como na planilha); integração com ERP/emissão de NF; controle de estoque; multi-tenant funcional; app mobile.

## 12. Critério de sucesso da v1

1. Os 325 CMVs reconciliados com a planilha (divergências apenas onde a planilha está errada, documentadas).
2. Time comercial simulando 100% dos pedidos no sistema.
3. Primeiro DRE mensal fechado no sistema com validação do Financeiro.
4. Zero pedidos fechados com CMV silenciosamente zerado ou dobrado (classe de erro nº 3 e 4 da planilha, extinta por design).
