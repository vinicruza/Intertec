# 04 — Pedidos (histórico, versões, fechar, reabrir, cancelar, perder)

Lista de todas as cotações e pedidos do sistema, com filtros, e a tela de detalhe de cada um, onde
acontecem as ações que mudam o status do pedido. **Quem pode usar:** Administrador, Financeiro e
Comercial. Algumas ações (fechar, reabrir, cancelar) têm regras extras por perfil — explicadas
abaixo.

## A lista de pedidos

Abra **Histórico de pedidos** no menu. Você verá filtros no topo:

- **Status**: Todos, Em cotação, Ganhos, Perdidas, Cancelados.
- **Período** (mês), **texto livre** (busca por número do orçamento, cliente ou nome de item),
  **vendedor**, **canal**, **UF**, **faixa de margem**, **motivo de perda** e **segmento do
  cliente**.

A tabela mostra orçamento (com data), cliente (e segmento, se categorizado), vendedor/canal, UF,
status (com o motivo, se for uma perda) e os valores de receita líquida e margem de contribuição.
Clique em qualquer linha para abrir o detalhe. O botão **Exportar Excel** gera uma planilha com os
pedidos filtrados na tela.

## A tela de detalhe do pedido

Ao abrir um pedido você vê o cliente, o status (badge no topo), o número do orçamento, vendedor,
UF e comissão, a lista de itens (com composição do kit, se for o caso) e — se você tem acesso aos
números — a cascata financeira.

Dois botões sempre disponíveis no topo: **Ficha do pedido** (gera uma folha para impressão/
conferência, veja a seção abaixo) e **Voltar**.

### Enquanto o pedido está "Em cotação"

- **Cascata (custos vigentes)**: mostra a cascata calculada com os custos de **hoje** — nada
  gravado ainda. Pode mudar até o pedido ser fechado de verdade.
- **Enviar para aprovação**: aparece se a empresa exige aprovação (configurável em
  Configurações) e o pedido ainda não foi enviado. Depois de enviado, o pedido entra na fila de
  [Aprovações](05-aprovacoes.md).
- **Fechar pedido (congela custos)**: aparece quando o pedido foi aprovado (ou quando a aprovação
  não é exigida). Um aviso de confirmação lembra: **os custos serão congelados e não mudam mais**
  — é a foto do momento da venda, usada depois no DRE. Depois de fechado, o pedido nunca é
  recalculado, mesmo que o preço de um insumo mude no futuro.
- **Marcar como perdida**: registra que a cotação não virou venda. É obrigatório escolher um
  **motivo** (lista definida em Cadastros); uma observação é opcional. Isso existe para responder
  depois "por que não vendemos esse pedido".
- **Duplicar como nova simulação**: cria uma cópia do pedido como uma nova cotação, para você
  reaproveitar sem mexer no original.
- **Cancelar**: pede um motivo com no mínimo 5 caracteres e uma confirmação. A cotação continua no
  histórico, marcada como cancelada.

### Depois que o pedido é ganho (fechado)

- A tela mostra "Custos congelados no fechamento (snapshot imutável)" e a **Cascata congelada**
  com os valores exatos do momento da venda.
- Se o pedido tinha algum **kit montado na hora**, é neste momento que ele ganha o **código
  oficial** — e a tela mostra logo em seguida quais códigos nasceram (ex.: *"KC0004 — Kit catarata
  Hospital de Manaus"*), com link para o kit. Quando a composição já existia no catálogo, o aviso
  diz isso: o código é reaproveitado, não nasce um duplicado.
- **Criar revisão (Admin)** — só o perfil Administrador vê este botão. Ele não recalcula o pedido
  fechado (que permanece intacto e imutável): cria uma **nova simulação vinculada**, para registrar
  uma revisão sem apagar o histórico do pedido original. Um aviso de confirmação explica isso antes
  de agir.
- **Cancelar** também está disponível para pedidos fechados (só para Administrador). Cancelar um
  pedido já fechado estorna o valor na DRE do **mês do cancelamento** — o fechamento original
  permanece registrado no mês em que aconteceu.
- Se o pedido é uma revisão de outro, ou tem revisões vinculadas, links aparecem no topo da tela
  para navegar entre eles.

### Cotação marcada como perdida

- **Reabrir cotação**: volta o pedido para "Em cotação", disponível para qualquer pessoa com
  acesso à tela (exceto se o pedido estiver cancelado).

### Quem pode cancelar

O botão **Cancelar** aparece para o Administrador em qualquer pedido, e para o perfil Comercial
apenas em pedidos que **ainda não foram fechados**. Depois de fechado, só o Administrador cancela.

## Aprovação dentro do detalhe do pedido

Se o pedido está com aprovação **pendente**:

- Se você foi quem enviou a cotação, a tela mostra um aviso explicando que você **não pode
  aprovar sua própria cotação** — é preciso outra pessoa com perfil aprovador decidir.
- Se você é aprovador e não foi quem enviou, aparece o formulário de decisão: uma observação
  opcional e os botões **Aprovar** / **Recusar**.

Se a aprovação foi **recusada**, um aviso mostra a observação de quem recusou (se houver) e pede
para ajustar a cotação e enviar de novo.

## Versões da cotação

Sempre que uma cotação é salva de novo com mudanças (no Simulador), uma nova versão é registrada.
Se houver mais de uma versão, uma tabela **"Versões da cotação"** aparece no fim da tela de
detalhe, com a data, a receita e a margem de contribuição de cada versão — a versão mais alta é a
atual.

## Ficha do pedido

O botão **Ficha do pedido** abre uma folha pronta para impressão, no formato que substitui o papel
que hoje vai para a mesa de conferência. Ela traz cabeçalho com o número do orçamento e a data
(ganho ou em cotação), dados do cliente/UF/vendedor, a lista de itens com **o kit descrito item
por item** (é dessa lista que sai o lançamento no sistema de faturamento) e, para quem tem acesso
aos números, o resumo financeiro completo (receita bruta, impostos, receita líquida, CMV, margem
de contribuição). A assinatura "Aprovado por" (com o nome de quem aprovou e a data, quando já
aprovado no sistema) fica no **pé da folha**. Use o botão **Imprimir** no topo da tela (ele não
aparece na impressão).

**Orçamento ou pedido?** O cabeçalho diz o que a folha é. Enquanto o pedido não foi gerado, ela sai
como **ORÇAMENTO**, com o número `ORC-...` e a linha "Orçamento em aberto". Depois de gerado, o
título passa a ser **PEDIDO** com o número do dia (ex.: `06270826`), o orçamento vira subtítulo e a
linha embaixo mostra a data em que o pedido foi gerado. O número do pedido existe desde a criação
da cotação — a tela do pedido o mostra como *número reservado* —, mas ele só sai na folha quando o
pedido de fato existe, para o papel nunca anunciar um pedido que ninguém gerou.

Cada item aparece com **os dois nomes**: em cima o nome do catálogo, que é como a conferência
reconhece o produto na prateleira (com gramatura, TNT etc.), e embaixo, marcado **NF:**, o nome
que deve sair na nota fiscal. Quando os dois são iguais, a linha NF não aparece — não faria
sentido repetir. Kit não tem nome de NF próprio: a nota do kit sai da composição, item a item,
que é justamente a lista logo abaixo do nome dele.
