# 06 — Kits

Registro de consulta de todos os kits já criados no sistema, com a composição, a embalagem e o
CMV de cada um. **Quem pode usar:** Administrador, Financeiro, Comercial e Produção (é um dos
poucos módulos que Produção também acessa).

## Importante: kits novos nascem no Simulador, não aqui

Desde a decisão da reunião de 16/07/2026, esta tela **não tem um botão para criar um kit do
zero**. Um kit novo é montado dentro de uma cotação, no
[Simulador de pedido](03-simulador-de-pedido.md) — a tela de Kits existe para consultar (e
editar) o que já foi criado. O código oficial de um kit só nasce quando o pedido que o usa é
fechado como ganho (ou, no caso de um kit cadastrado manualmente antes dessa mudança, na própria
criação).

## A lista de kits

Abra **Kits** no menu. Cada linha mostra:

- **Código** e **nome** do kit (e o código antigo, se ele veio de uma migração de dados).
- Um selo indicando a origem: **"de um pedido"** (nasceu quando um pedido foi fechado) ou
  **"cadastro manual"**.
- A **composição**: cada produto e sua quantidade, e um resumo da embalagem/esterilização
  associada.
- O **CMV do kit**, calculado com os custos vigentes dos produtos que o compõem.

Clique em uma linha para abrir os detalhes e editar.

O filtro à direita da busca ajuda a achar o que interessa: **Ativos**, **Inativos**, CMV pendente,
nunca usados, nascidos de pedido ou cadastro manual.

## Tirar um kit de circulação (inativar)

Kit que a empresa não vende mais não precisa continuar atrapalhando a lista de itens do pedido.
Abra o kit e use o botão **Inativar kit**, no card **Situação no catálogo**, no alto da tela.

O que acontece:

- O kit **deixa de aparecer** na lista de itens do simulador e no "partir de um kit existente".
  Ninguém consegue mais vendê-lo.
- **Nada é apagado.** O código e a composição continuam reservados: quem montar exatamente os
  mesmos itens cai neste kit, com o mesmo código, em vez de criar um kit repetido.
- **Os pedidos já feitos não mudam.** Pedido fechado guarda nome, código e custo congelados.
- Dá para **reativar** quando quiser, pelo mesmo botão — o código volta a valer, é o mesmo.

Não existe excluir kit, e é de propósito: kit usado em pedido fechado não pode sumir do histórico.

**Quem pode:** Administrador e Financeiro. Tirar um item do catálogo muda o que a equipe inteira
consegue vender, então é decisão de catálogo, não de venda — o Comercial continua criando kits ao
montar pedidos, mas não aposenta nenhum. Toda ativação e inativação fica registrada com o nome de
quem fez.

**Um aviso pode aparecer:** se o kit estiver dentro de algum **orçamento em aberto**, a tela avisa
antes, com o número de cotações. Ao inativar, a linha daquele kit volta **em branco** quando essas
cotações forem reabertas — troque o item nelas antes, ou reative o kit. Cotação cancelada, cotação
perdida e pedido já gerado não entram nessa conta: nenhum dos três volta ao simulador.

## Kit que nasceu de um pedido ganho: a composição não muda mais

Se o kit nasceu do fechamento de um pedido, o código dele já foi para o papel, para a nota e para
a fábrica — e o sistema inteiro é construído sobre "um código, uma composição". Por isso a
composição e a embalagem desses kits aparecem **só para leitura**: mudá-las faria o código deixar
de valer para quem já o recebeu, e mudaria por baixo o custo de cotações em aberto que usam o kit.

**Nome e descrição continuam editáveis.** Para uma composição diferente, monte um kit novo no
Simulador — ele ganha código próprio, e a assinatura única impede duplicidade. Kits cadastrados
manualmente (selo "cadastro manual") seguem totalmente editáveis.

## Editando um kit existente

Ao abrir um kit você vê primeiro um card de **origem**: quem criou, quando, e — se o kit nasceu de
um pedido — um link direto para o orçamento de origem (o link só aparece se você também tem acesso
à tela de Pedidos).

Abaixo, o formulário permite ajustar:

- **Nome** e **Descrição** (o **código** não é editável).
- **Composição**: adicione produtos com o botão **Adicionar produto** (o campo tem busca por
  código ou nome; informe a quantidade que entra em 1 kit), ou remova uma linha com **Remover**.
- **Embalagem e esterilização**: adicione com **Adicionar embalagem**. O envelope normalmente é
  lançado como **"Unidades por kit"**; a caixa de esterilização, que atende vários kits, deve usar
  **"Kits por caixa (rateia)"** — informe quantos kits cabem naquela caixa, e o sistema divide o
  custo automaticamente. Se o insumo que você procura não aparecer, marque **"Não achei o insumo —
  mostrar todos os insumos do catálogo"**.
- Uma prévia ao vivo mostra o **CMV do kit** (separado em produtos e embalagem) e a
  **assinatura** — o código interno que identifica essa composição exata.
- Se houver produtos e embalagem suficientes, uma tabela **"Peso de cada item no custo do kit"**
  mostra o custo e a participação percentual de cada componente, ordenados do mais pesado para o
  mais leve.

Se ao salvar a composição resultante já existir em outro kit, um aviso amarelo aparece com o
**código** do kit existente (e a indicação de que ele está inativo, se for o caso) e um link para
abri-lo em vez de duplicar — a composição de um kit é única no sistema, mesmo entre kits
desativados.

Clique em **Salvar** para gravar as mudanças, ou **Cancelar** para voltar sem salvar.
