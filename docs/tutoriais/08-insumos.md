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
  da unidade em que o insumo é consumido nas fichas técnicas. O sistema deriva o preço por unidade
  de consumo automaticamente a partir desses dois campos. Para bobina, não preencha o fator à mão:
  marque a caixa **É bobina, comprada por quilo** e informe a gramatura (ver abaixo).
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

## Bobina: atualizando o preço do quilo

A bobina (TNT, SMS, laminado) é comprada **por quilo** e consumida **por m²**. Marque a caixa
**É bobina, comprada por quilo** e o formulário troca dois campos:

- **Preço por kg (com imposto)** — o valor que o fornecedor cobra pelo quilo (ex.: `22,56`).
- **Gramatura (g/m²)** — a gramatura da bobina, em gramas (ex.: `30`, `40`). Não precisa converter
  para quilo nem calcular fator nenhum.

O sistema faz a conta sozinho e mostra a memória de cálculo embaixo dos campos:

```
R$ 22,56 por kg × 0,03 (gramatura 30 g/m²) = R$ 0,6768 por m², com imposto
```

Quando o quilo mudar de preço, **é só trocar o valor do campo "Preço por kg" e salvar** — o preço
por m², o preço sem imposto e o CMV de todos os produtos e kits que usam a bobina se atualizam
sozinhos. Não é preciso refazer a conta em planilha nem digitar o preço do m².

Duas observações:

- A gramatura é obrigatória quando a caixa está marcada. Sem ela o custo sairia zero, e o sistema
  não deixa salvar.
- O quadro "Preço com imposto (calculado)" mostra o valor arredondado em centavos (`R$ 0,68`). A
  conta guarda todas as casas (`0,6768`), e é a conta cheia que entra no CMV — por isso a memória
  de cálculo aparece com o valor exato.

**Insumo de bobina já cadastrado com o preço do m² no campo de preço de compra** (fator `1`):
marque a caixa, troque o preço pelo valor do quilo e informe a gramatura. O custo passa a ser
atualizável por aqui daí em diante.

## Histórico de custos

Ao editar um insumo já existente, uma seção **Histórico de custos** aparece embaixo do
formulário, listando cada alteração de preço registrada: quando aconteceu e o preço sem imposto,
de antes e depois da mudança. Toda alteração de preço fica registrada automaticamente — não é
preciso fazer nada além de salvar o novo preço. Alterar o preço de um insumo recalcula em cascata
o CMV vigente de todos os produtos e kits que o usam, sem tocar em nenhum pedido já fechado (que
tem o custo congelado no momento em que foi fechado).
