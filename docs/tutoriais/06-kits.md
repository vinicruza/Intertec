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

## Editando um kit existente

Ao abrir um kit você vê primeiro um card de **origem**: quem criou, quando, e — se o kit nasceu de
um pedido — um link direto para o orçamento de origem (o link só aparece se você também tem acesso
à tela de Pedidos).

Abaixo, o formulário permite ajustar:

- **Nome** e **Descrição** (o **código** não é editável).
- **Composição**: adicione produtos com o botão **Adicionar produto** (escolha o produto e a
  quantidade que entra em 1 kit), ou remova uma linha com **Remover**.
- **Embalagem e esterilização**: adicione com **Adicionar embalagem**. O envelope normalmente é
  lançado como **"Unidades por kit"**; a caixa de esterilização, que atende vários kits, deve usar
  **"Itens por caixa (rateia)"** — informe quantos kits aquela caixa atende, e o sistema divide o
  custo automaticamente. Se o insumo que você procura não aparecer, marque **"Não achei o insumo —
  mostrar todos os insumos do catálogo"**.
- Uma prévia ao vivo mostra o **CMV do kit** (separado em produtos e embalagem) e a
  **assinatura** — o código interno que identifica essa composição exata.
- Se houver produtos e embalagem suficientes, uma tabela **"Peso de cada item no custo do kit"**
  mostra o custo e a participação percentual de cada componente, ordenados do mais pesado para o
  mais leve.

Se ao salvar a composição resultante já existir em outro kit, um aviso amarelo aparece com um link
para abrir o kit existente em vez de duplicar — a composição de um kit é única no sistema.

Clique em **Salvar** para gravar as mudanças, ou **Cancelar** para voltar sem salvar.
