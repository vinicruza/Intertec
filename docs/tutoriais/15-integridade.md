# 15 — Integridade dos dados

Painel de saúde da base de dados inteira: mostra o que pode estar faltando ou quebrado e que
poderia afetar o CMV, o fechamento de pedidos ou o DRE. **Quem pode usar:** somente Administrador
(bloco "Administração" 🔒).

A tela atualiza sozinha a cada minuto, então não é preciso recarregar a página para ver o número
mais recente.

## O resumo geral

Um cartão no topo mostra, em verde, **"Nenhuma pendência encontrada"** quando está tudo certo, ou
em amarelo, **"[N] pendência(s) encontrada(s)"** quando há algo para revisar.

Abaixo, uma grade de sete verificações automáticas, cada uma com uma contagem (verde quando é
zero, amarelo quando há alguma pendência):

| Verificação | O que significa |
|---|---|
| Produtos ativos sem ficha técnica | Produto cadastrado sem nenhum componente — não tem como calcular o CMV dele |
| Produtos ativos sem CMV válido | Produto com ficha técnica, mas o cálculo não fechou (ex.: componente sem custo) |
| Kits ativos sem itens | Kit cadastrado sem nenhum produto na composição |
| Itens de kit sem CMV | Um produto dentro de um kit está sem custo vigente |
| Pedidos sem itens | Pedido cadastrado sem nenhum item |
| Pedidos fechados sem snapshot completo | Pedido fechado, mas faltando algum dado do snapshot congelado |
| Clientes ativos sem UF | Cliente sem UF definida — impede simular pedido para ele |

Quando há produtos sem ficha técnica, uma lista específica aparece no topo da tela com um link
direto para cada produto — clique para ir corrigir na hora.

## Erros recentes da interface

Uma tabela na parte de baixo lista erros recentes que aconteceram para quem estava usando o
sistema pelo navegador: data, quem estava usando, em qual tela e a mensagem do erro.

Nem todo erro nessa lista exige ação. Depois de cada publicação do sistema, uma aba que já estava
aberta no navegador de alguém pode tentar buscar uma versão de tela que não existe mais — o
próprio sistema percebe isso e recarrega a página sozinho, sem a pessoa notar. Esses casos
aparecem marcados com o selo **"resolvido sozinho"** e em cinza, em vez de vermelho — o vermelho
fica reservado para o que realmente merece atenção.
