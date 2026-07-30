# 05 — Aprovações

Fila com todos os pedidos aguardando decisão (aprovar ou recusar), com um selo colorido de margem
em cada linha para não aprovar nada "no escuro". **Quem pode usar:** não é um perfil fixo — é
quem estiver marcado como aprovador na aba "Aprovação de pedidos" de
[Configurações](14-configuracoes.md). O padrão de fábrica é **Administrador e Financeiro**. Se seu
perfil não estiver na lista de aprovadores, o sistema te manda de volta para o Início ao tentar
abrir esta tela.

## Onde encontrar

Se você é aprovador, um item **Aprovações** aparece no menu lateral, logo depois de "Histórico de
pedidos". Quando há pedidos esperando decisão, um número em um círculo laranja mostra a
quantidade pendente — ele se atualiza sozinho a cada minuto, sem precisar recarregar a página.

## O que você vê em cada linha

- Número do orçamento e nome do cliente. Um selo **"você enviou"** aparece se foi você quem mandou
  aquela cotação para aprovação (nesse caso você só pode **ver**, não aprovar — veja abaixo).
- Vendedor, canal, UF e há quanto tempo foi enviado.
- Um selo colorido com a faixa de margem (Boa/Atenção/Crítica/Negativa), calculado com os custos
  **vigentes** no momento — o pedido ainda não tem CMV gravado porque só o fechamento grava isso.
  Se seu perfil vê os números completos, o percentual aparece ao lado do selo.
- O valor total do pedido.
- Um botão **Ver e decidir** (ou apenas **Ver**, se a cotação for sua).

## Como aprovar ou recusar

Clique na linha do pedido (ou no botão) para abrir o **detalhe do pedido**. É lá, na seção
"Aprovação do pedido", que você confere a cascata completa (receita, CMV, margem) e decide:

1. Escreva uma observação, se quiser (opcional).
2. Clique em **Aprovar** ou **Recusar**.

**Uma regra que não tem exceção:** quem enviou a cotação para aprovação nunca pode aprová-la, nem
que também tenha perfil aprovador — é preciso outra pessoa decidir. Essa regra vale tanto na tela
quanto no banco de dados, então não há atalho para contorná-la.

Se a cotação for recusada, ela volta para "Em cotação" com a observação registrada, para quem
montou o pedido ajustar e reenviar.
