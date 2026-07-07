# Sprint 6 - Retomada do sistema Intertec

## Objetivo da sprint

Transformar a fundacao de banco ja criada no Supabase em uma primeira versao utilizavel do sistema Intertec CMV e Rentabilidade.

A sprint deve focar menos em criar novas tabelas e mais em entregar fluxo operacional navegavel, com telas, CRUDs essenciais e simulacao de rentabilidade funcionando.

## Premissas

- Supabase oficial: `Intertec CMV e Rentabilidade` (`wdnontebtxnrsenvtucd`)
- Repositorio oficial: `vinicruza/Intertec`
- Stack recomendada: Lovable + Supabase + TypeScript + Tailwind + shadcn/ui
- O banco ja possui RLS, roles e estrutura multi-tenant
- A aplicacao precisa respeitar roles: admin, financeiro, comercial e producao

## Entregas da Sprint 6

### 1. App base versionado

- Criar/recuperar aplicacao no Lovable
- Garantir sincronizacao com o repositorio GitHub `vinicruza/Intertec`
- Configurar Supabase client apontando para o projeto correto
- Criar layout principal com navegacao lateral ou superior
- Criar tela de login e roteamento protegido

### 2. Cadastros essenciais

Criar telas de listagem, cadastro, edicao e ativacao/inativacao para:

- fornecedores
- insumos
- produtos
- componentes de produto
- clientes
- canais
- vendedores

A interface deve ser objetiva, de uso interno, sem cara de landing page.

### 3. Motor operacional de CMV

Entregar fluxo para:

- cadastrar insumo com unidade de compra, unidade de consumo, fator de conversao e preco
- atualizar preco de insumo com historico
- montar produto com componentes
- calcular CMV estimado do produto
- visualizar custo por produto

### 4. Simulador de pedido/rentabilidade

Criar fluxo para:

- criar simulacao de pedido
- selecionar cliente, UF, canal e vendedor
- adicionar produtos ou kits
- informar quantidade e preco unitario
- calcular receita bruta, impostos, DIFAL, comissao, frete, CMV, despesas alocadas, margem e resultado
- salvar snapshots no pedido
- permitir fechar pedido, bloqueando alteracoes posteriores

### 5. Regras e alertas de margem

- Usar `margin_rules` para classificar resultado
- Exibir status visual de margem: ruim, atencao, boa, excelente ou equivalentes cadastrados
- Destacar pedidos abaixo da margem minima

### 6. Seed minimo para teste

Cadastrar dados minimos para validar a operacao:

- 1 tenant
- usuarios/perfis de teste
- canais principais
- regras de margem
- tabela ICMS ja existente
- alguns fornecedores
- alguns insumos
- alguns produtos
- pelo menos 1 pedido simulado completo

## Fora do escopo desta sprint

- Integracoes externas
- Importacao massiva de planilhas
- Relatorios avancados de DRE
- Automacoes com IA
- Multiempresa comercial completo
- Publicacao para cliente final

## Criterios de aceite

A sprint pode ser considerada concluida quando:

- o app abre com login
- usuario autenticado enxerga apenas dados do tenant correto
- admin consegue cadastrar insumos, produtos, clientes, canais e vendedores
- financeiro consegue editar custos e despesas
- comercial consegue criar simulacao de pedido
- pedido simulado calcula margem e resultado
- pedido fechado nao pode ser alterado por usuario comercial
- os dados ficam persistidos no Supabase
- o repositorio GitHub contem o codigo atualizado

## Prompt recomendado para Lovable

Use este prompt para retomar a criacao da aplicacao:

```text
Voce esta continuando o sistema Intertec CMV e Rentabilidade.

Contexto:
- O backend Supabase ja existe no projeto `wdnontebtxnrsenvtucd`, nome `Intertec CMV e Rentabilidade`.
- O repositorio oficial e `vinicruza/Intertec`.
- O sistema deve ser uma aplicacao interna para calcular CMV, custo de produto, composicao, kits, simulacao de pedidos e rentabilidade.
- Nao criar landing page. A primeira tela apos login deve ser o dashboard operacional.

Objetivo desta sprint:
Criar a primeira versao utilizavel da aplicacao, conectada ao Supabase existente, respeitando RLS e roles.

Tabelas principais ja existentes:
- tenants
- profiles
- suppliers
- inputs
- input_cost_history
- products
- product_components
- product_costs
- kits
- kit_items
- customers
- channels
- sellers
- icsm_rates
- difal_rates
- portal_freight_rates
- margin_rules
- real_monthly_expenses
- expense_allocation_periods
- expense_allocations
- orders
- order_items
- audit_logs

Roles:
- admin
- financeiro
- comercial
- producao

Regras obrigatorias:
- Usar Supabase Auth.
- Respeitar `tenant_id` em todas as consultas.
- Nao criar tabelas duplicadas se ja existirem.
- Nao alterar nomes de tabelas ou colunas sem necessidade.
- Nao desativar RLS.
- O pedido fechado (`orders.status = closed`) nao pode ser editado pelo comercial.
- Toda tela deve ter estados de carregamento, vazio e erro.
- Interface profissional, limpa e operacional, sem hero, sem marketing e sem excesso de cards decorativos.

Entregas:
1. Login e rotas protegidas.
2. Dashboard operacional com indicadores basicos.
3. CRUD de fornecedores, insumos, produtos, componentes, clientes, canais e vendedores.
4. Tela de composicao de produto com calculo de CMV.
5. Tela de simulacao de pedido com itens, impostos, frete, comissao, CMV, despesas, margem e resultado.
6. Fechamento de pedido com snapshots e bloqueio de edicao.
7. Visualizacao de regras de margem e alerta para margem baixa.

Criterios de aceite:
- Consigo fazer login.
- Consigo cadastrar um insumo.
- Consigo cadastrar um produto e seus componentes.
- Consigo simular um pedido com um produto.
- O sistema calcula margem e resultado.
- Consigo fechar o pedido.
- Depois de fechado, o pedido nao pode ser alterado pelo comercial.
- O codigo fica sincronizado no GitHub.
```
