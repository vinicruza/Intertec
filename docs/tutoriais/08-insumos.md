# 08 — Insumos

Cadastro de matérias-primas e serviços (TNT, elástico, envelope, esterilização, mão de obra de
costureira etc.), com preço, forma de compra/consumo e histórico de alterações de preço.
**Quem pode usar:** Administrador, Financeiro e Produção. O perfil Comercial **não** vê esta tela
— ele não tem acesso a preço de insumo.

## A lista de insumos

Abra **Insumos** no menu. A tabela mostra nome, categoria, **preço com imposto** e **preço sem
imposto** (calculado a partir dos dados de compra) e a data da última atualização de preço.
Clique em **Novo insumo** para cadastrar, ou em uma linha para editar.

## Cadastrando ou editando um insumo

Preencha:

- **Nome** e **Categoria**.
- **Fornecedor (unidade de compra)** — a unidade em que o insumo é comprado (ex.: `kg`).
- **Preço de compra** — o valor pago naquela unidade de compra.
- **Fator de conversão** e **Unidade de consumo** — usados quando a unidade de compra é diferente
  da unidade em que o insumo é consumido nas fichas técnicas (ex.: uma bobina comprada por
  quilograma, mas consumida por metro quadrado). O sistema deriva o preço por unidade de consumo
  automaticamente a partir desses dois campos.
- **ICMS** e **PIS/COFINS** — em fração (ex.: `0,18` para 18%).

Duas caixas de marcar importantes:

- **É mão de obra** (ex.: custo de costureira): continua entrando no CMV cheio, usado no pedido.
  Além disso, o sistema passa a calcular também o **CMV sem mão de obra**, que é o valor usado no
  DRE por competência (a costureira é paga referente à produção passada, não à venda do mês).
- **É embalagem ou esterilização** (ex.: envelope, caixa, serviço de esterilização): **não muda
  nenhum cálculo de custo** — o insumo entra no CMV do kit do mesmo jeito, marcado ou não. Ela só
  serve para filtrar a lista de insumos que aparece ao montar um kit (no Simulador ou na tela de
  Kits), para não precisar procurar o envelope no meio de dezenas de outros insumos.

Uma prévia ao vivo mostra o **preço com imposto** e o **preço sem imposto**, calculados pelo motor
do sistema conforme você preenche os campos.

Clique em **Salvar** para gravar, ou **Cancelar** para voltar sem salvar.

## Histórico de custos

Ao editar um insumo já existente, uma seção **Histórico de custos** aparece embaixo do
formulário, listando cada alteração de preço registrada: quando aconteceu e o preço sem imposto,
de antes e depois da mudança. Toda alteração de preço fica registrada automaticamente — não é
preciso fazer nada além de salvar o novo preço. Alterar o preço de um insumo recalcula em cascata
o CMV vigente de todos os produtos e kits que o usam, sem tocar em nenhum pedido já fechado (que
tem o custo congelado no momento em que foi fechado).
