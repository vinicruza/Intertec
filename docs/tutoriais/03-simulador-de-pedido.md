# 03 — Simulador de pedido

É a tela onde você monta uma cotação: escolhe cliente, vendedor, itens (produtos ou kits) e vê a
margem calculada na hora. É também aqui — e só aqui — que nasce um **kit novo**, item por item.
**Quem pode usar:** Administrador, Financeiro e Comercial.

## Antes de começar: o que você vai ver na tela depende do seu perfil

Por decisão da empresa, quem monta o pedido (perfil Comercial) vê apenas a **cor** da faixa de
margem (verde, amarelo, laranja, vermelho), não o número exato. A razão: com o número à vista,
fica fácil ir descontando até "chegar perto do limite" sem perceber que já descontou demais.
Administrador e Financeiro veem os números completos (CMV, receita líquida, margem em R$ e em %).
Isso é configurável em [Configurações](14-configuracoes.md), mas o padrão é esse.

## Passo 1 — Dados gerais do pedido

No topo da tela, preencha:

1. **Vendedor** — escolha na lista (o nome do vendedor já mostra o canal dele, ex.: "Patricia —
   Interno"). O vendedor determina o canal, que por sua vez define a comissão padrão, se aplica
   DIFAL e como o frete é calculado.
2. **UF de destino** — obrigatória; define a alíquota de imposto aplicada.
3. **Cliente** — escolha um cliente já cadastrado, ou deixe em "Novo cliente…" e digite o nome no
   campo que aparece ao lado.
4. **Comissão** — vem preenchida com o padrão do canal escolhido. Você pode digitar outro valor
   (fração, ex.: `0,025` para 2,5%); se for diferente do padrão, um aviso amarelo lembra que a
   mudança fica registrada em auditoria quando o pedido for fechado.
5. **Frete** — se o canal do vendedor usa o modelo "% da receita por UF" (ex.: Marketplace), o
   campo fica automático e mostra o valor calculado. Nos demais canais, digite o valor do frete em
   R$ manualmente.
6. **Frete por conta do cliente** — marque esta caixa quando o frete não sai do resultado da
   Intertech.

## Passo 2 — Adicionar itens

Clique em **Adicionar item** para criar uma nova linha. Em cada linha:

- **Produto ou kit** — escolha um produto ou um kit já existente na lista, ou selecione
  **"➕ Montar um kit novo aqui"** para montar um kit na hora (veja o passo 3).
- **Quantidade** e **Preço de venda** — preencha os dois. Se o item não tiver um custo (CMV)
  vigente cadastrado, a linha mostra "sem custo vigente (bloqueante)" em vermelho — o pedido não
  fecha a cascata enquanto isso não for resolvido (fale com quem cadastra o produto/insumo).
- Um link **Remover** tira a linha.

Adicione quantas linhas precisar com o botão **Adicionar item**.

## Passo 3 — Montar um kit novo dentro do pedido

Esta é a forma normal de criar um kit na Intertech: você não vai a uma tela separada, monta o kit
direto dentro da cotação. Ao escolher **"➕ Montar um kit novo aqui"** numa linha, um painel se
abre:

1. **Como chamar este kit (uso interno)** — dê um nome de referência (ex.: "Kit catarata Hospital
   X"). O código oficial do kit só é gerado quando o pedido for ganho.
2. **Produtos do kit** — clique em **+ Adicionar produto**, escolha o produto e a quantidade que
   entra em **1 kit** (não confunda com a quantidade de kits vendidos, que fica lá em cima, na
   linha do item). Repita para cada produto que compõe o kit.
3. **Embalagem e esterilização** — clique em **+ Adicionar embalagem** para incluir o envelope e a
   caixa de esterilização:
   - O **envelope** normalmente é lançado como **"un. por kit"** — quantas unidades daquele
     insumo entram em cada kit.
   - A **caixa de esterilização** costuma atender vários kits de uma vez. Para ela, escolha
     **"itens por caixa"** e informe **quantos kits aquela caixa atende** — o sistema rateia o
     custo da caixa automaticamente entre esses kits; não é a quantidade de caixas usadas.
   - Se o insumo que você procura não aparecer na lista, marque **"Não achei o insumo — mostrar
     todos os insumos do catálogo"**: por padrão a lista só mostra insumos já marcados como
     embalagem/esterilização pelo Administrador na tela de Insumos.
4. Se a composição que você montou já existir como um kit cadastrado, um aviso amarelo aparece:
   *"Esta composição já existe: [código] ([nome]). Ao salvar, o pedido usará esse kit — o código é
   o mesmo, não será criado um duplicado."* Isso evita kits repetidos.
5. Quando os números de margem estiverem visíveis para o seu perfil, uma tabela **"Peso de cada
   item no custo do kit"** mostra o custo e a participação percentual de cada produto e insumo de
   embalagem dentro do kit — útil para ver o que está pesando mais no custo. Não existe um "preço"
   por produto dentro do kit (o cliente negocia o kit inteiro); o que existe é o custo de cada
   parte.

## Passo 4 — Conferir a cascata do pedido

Assim que houver ao menos um item completo (produto/kit, quantidade e preço preenchidos), a
**Cascata do pedido** aparece automaticamente, com um selo colorido de status de margem (Boa,
Atenção, Crítica ou Negativa).

Se você tem acesso aos números, a tabela mostra:

```
Receita bruta
(−) Impostos sobre venda + DIFAL
= Receita líquida
(−) CMV
= MARGEM DE CONTRIBUIÇÃO (métrica oficial)
```

Abaixo, uma linha resume as deduções que já saíram da receita líquida (frete, imposto sobre o
frete e comissão). Avisos em amarelo (⚠️) podem aparecer — leia-os antes de salvar.

Se houver um problema que impede o cálculo (por exemplo, item sem custo), a tela mostra um erro em
vermelho (🛑) em vez da cascata — nada é calculado com custo zerado silenciosamente.

## Passo 5 — Salvar

Clique em **Salvar cotação**. O sistema gera um número de orçamento e mostra a confirmação
("Cotação [número] salva — versão 1"). Se você alterar algo depois (ex.: o cliente pediu mudança
de quantidade) e salvar de novo, o botão passa a se chamar **Salvar nova versão** — cada alteração
vira uma versão nova, sem apagar o histórico da anterior (veja essas versões no tutorial
[04 — Pedidos](04-pedidos.md)).

Depois de salvar, o pedido continua como uma cotação em aberto. Fechar o pedido (transformá-lo em
venda com custos congelados), enviar para aprovação, marcar como perdido ou cancelar são ações da
tela de detalhe do pedido — veja o próximo tutorial.
