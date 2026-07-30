# Tutoriais do sistema Intertec CMV e Rentabilidade

Este é o ponto de partida para aprender a usar o sistema. Cada módulo tem seu próprio tutorial,
com passo a passo e exemplos. Você não precisa ler tudo de uma vez — comece pelo seu fluxo de
trabalho abaixo e volte aqui sempre que precisar de outro módulo.

O sistema separa o que cada pessoa vê por **perfil de acesso**: Administrador, Financeiro,
Comercial e Produção (mais o Super Administrador, que é um Administrador com um poder a mais).
Cada tutorial explica quem pode usar aquele módulo.

## Se você é do time Comercial (vendedor)

1. [Login e Meu perfil](01-login-e-meu-perfil.md) — como entrar e trocar sua senha.
2. [Início / painel](02-inicio.md) — sua tela inicial: pedidos, receita e margem.
3. [Simulador de pedido](03-simulador-de-pedido.md) — o coração do seu dia a dia: monte cotações e kits.
4. [Pedidos](04-pedidos.md) — acompanhe, feche, cancele ou marque como perdida uma cotação.
5. [Clientes](09-clientes.md) — categorize os clientes que você atende.
6. [Kits](06-kits.md) — consulte os kits já cadastrados.
7. [Produtos](07-produtos.md) — consulte a ficha técnica e o custo dos produtos.

## Se você é do Financeiro

1. [Login e Meu perfil](01-login-e-meu-perfil.md)
2. [Início / painel](02-inicio.md)
3. [Aprovações](05-aprovacoes.md) — fila de pedidos aguardando sua decisão.
4. [Pedidos](04-pedidos.md) — histórico completo, com números de custo e margem.
5. [Insumos](08-insumos.md) — cadastre preços de insumos e acompanhe o histórico.
6. [Produtos](07-produtos.md) — ficha técnica e CMV.
7. [Vendas do ERP e consumo externo](10-vendas-consumo.md) — concilie o relatório de vendas do faturamento.
8. [DRE gerencial](11-dre.md) — resultado mensal fechado (não aparece no menu; acesse pela URL `/dre`).

## Se você é da Produção

1. [Login e Meu perfil](01-login-e-meu-perfil.md)
2. [Kits](06-kits.md) — consulte a composição dos kits.
3. [Produtos](07-produtos.md) — consulte fichas técnicas.
4. [Insumos](08-insumos.md) — consulte preços e características dos insumos.

## Se você é Administrador

Além de tudo acima, você é o único perfil que vê o bloco **Administração** no menu (com um
cadeado 🔒):

1. [Usuários](12-usuarios.md) — crie e gerencie o acesso de cada pessoa.
2. [Cadastros](13-cadastros.md) — listas de referência: tipos de cliente, áreas, motivos de perda, categorias.
3. [Configurações](14-configuracoes.md) — canais, faixas de margem, aprovação, impostos, frete.
4. [Integridade dos dados](15-integridade.md) — painel de saúde da base de dados.

E como Administrador você também pode fechar, reabrir e cancelar qualquer pedido — veja
[Pedidos](04-pedidos.md).

## Lista completa dos tutoriais

| # | Tutorial | Quem usa |
|---|---|---|
| 01 | [Login e Meu perfil](01-login-e-meu-perfil.md) | Todos |
| 02 | [Início / painel](02-inicio.md) | Administrador, Financeiro, Comercial |
| 03 | [Simulador de pedido](03-simulador-de-pedido.md) | Administrador, Financeiro, Comercial |
| 04 | [Pedidos](04-pedidos.md) | Administrador, Financeiro, Comercial |
| 05 | [Aprovações](05-aprovacoes.md) | Quem estiver marcado como aprovador em Configurações (padrão: Administrador e Financeiro) |
| 06 | [Kits](06-kits.md) | Administrador, Financeiro, Comercial, Produção |
| 07 | [Produtos](07-produtos.md) | Administrador, Financeiro, Comercial, Produção |
| 08 | [Insumos](08-insumos.md) | Administrador, Financeiro, Produção |
| 09 | [Clientes](09-clientes.md) | Administrador, Financeiro, Comercial |
| 10 | [Vendas do ERP e consumo externo](10-vendas-consumo.md) | Administrador, Financeiro |
| 11 | [DRE gerencial](11-dre.md) | Administrador, Financeiro (fora do menu, acesso por URL `/dre`) |
| 12 | [Usuários](12-usuarios.md) | Administrador |
| 13 | [Cadastros](13-cadastros.md) | Administrador |
| 14 | [Configurações](14-configuracoes.md) | Administrador |
| 15 | [Integridade dos dados](15-integridade.md) | Administrador |

## Uma coisa importante sobre dinheiro e custo

O sistema nunca deixa um item de pedido, produto ou kit ser calculado com custo zerado ou
"esquecido" — se faltar informação, ele avisa com um erro em vez de deixar passar em silêncio
(era um dos problemas da planilha antiga). Quando você vir uma mensagem de erro bloqueando uma
ação, ela está protegendo a conta, não atrapalhando você.
