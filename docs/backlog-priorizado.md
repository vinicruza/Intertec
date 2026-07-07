# Backlog priorizado - Intertec

## P0 - Destravar continuidade

- Localizar ou recriar o projeto Lovable da Intertec.
- Conectar o projeto Lovable ao GitHub `vinicruza/Intertec`.
- Garantir que todo codigo novo seja versionado.
- Configurar variaveis Supabase do projeto `wdnontebtxnrsenvtucd`.
- Criar tela de login e rotas protegidas.

## P1 - MVP operacional

- Dashboard inicial.
- CRUD de fornecedores.
- CRUD de insumos.
- Historico de custo de insumos.
- CRUD de produtos.
- Tela de composicao de produto.
- Calculo/visualizacao de CMV por produto.
- CRUD de clientes.
- CRUD de canais.
- CRUD de vendedores.

## P2 - Simulador de rentabilidade

- Criar simulacao de pedido.
- Adicionar itens de produto ou kit.
- Aplicar impostos por UF.
- Aplicar DIFAL quando canal exigir.
- Aplicar comissao do canal/vendedor.
- Aplicar frete manual ou percentual por UF.
- Aplicar CMV do produto.
- Aplicar despesa rateada.
- Calcular margem e resultado.
- Exibir regra visual de margem.

## P3 - Fechamento e controle

- Fechar pedido.
- Salvar snapshots definitivos.
- Bloquear alteracao de pedido fechado.
- Registrar auditoria de fechamento.
- Permitir admin reabrir/corrigir apenas com log.

## P4 - Dados e qualidade

- Seed de teste completo.
- Importacao inicial de insumos/produtos via CSV.
- Validacoes de campos obrigatorios.
- Testes de regras criticas.
- Tela de inconsistencias: produto sem CMV, pedido sem canal, cliente sem UF, insumo sem preco.

## P5 - Relatorios

- Rentabilidade por pedido.
- Rentabilidade por cliente.
- Rentabilidade por produto.
- Produtos abaixo da margem minima.
- Evolucao de custo de insumo.
- Evolucao de despesas rateadas.

## Recomendacao de ordem

Eu seguiria nesta ordem:

1. Versionamento e app base.
2. Cadastros de insumos/produtos/composicao.
3. CMV por produto.
4. Simulador de pedido.
5. Fechamento com snapshot.
6. Relatorios.

Motivo: sem produto e CMV confiavel, o simulador vira tela bonita sem numero confiavel.
