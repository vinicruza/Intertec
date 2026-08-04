# 07 — Produtos e fichas técnicas

Catálogo de produtos da Intertech, com o cadastro, a ficha técnica (do que cada produto é feito) e
o CMV calculado. **Quem pode usar:** Administrador, Financeiro, Comercial e Produção.

## A lista de produtos

Abra **Produtos e fichas** no menu. Você pode buscar por código novo, código antigo ou nome, e
filtrar por categoria. Cada linha mostra código, código de ERP e código antigo (quando existem),
nome, categoria e o **CMV**. Quando o produto tem mão de obra na ficha (por exemplo, custo de
costureira), aparece também o **CMV sem mão de obra** — é esse segundo número que o DRE usa, por
competência.

Clique em **Novo produto** para cadastrar um produto, ou em uma linha para editar um existente.

## Cadastrando ou editando um produto

### Dados gerais

- **Código**: gerado automaticamente pelo sistema, não é editável.
- **Nome**, **Categoria**, **Tamanho**, **Gramatura**.
- **Estéril**: marque se o produto é estéril.
- **Descrição NF**: o texto que deve sair na nota fiscal quando este produto for faturado. O
  sistema **não emite nota fiscal** — isso continua um processo manual, fora daqui; este campo só
  existe para não depender de decorar ou copiar de outro lugar na hora de faturar.
  Nos campos cirúrgicos ele já vem preenchido por uma regra: o nome do catálogo vira o nome
  fiscal da família (ex.: `Campo Simples` → `Campo Cirúrgico Sem Fenestra`) e gramatura, TNT/SMS
  e origem somem, porque não podem variar a nota. Tamanho e Estéril/Não Estéril continuam.
  Você pode escrever outro texto à vontade — quando o texto salvo é diferente do da regra, ele
  fica marcado como **ajustada à mão** na lista de produtos e nenhuma rodada futura da regra o
  sobrescreve. Abaixo do campo aparece a sugestão da regra, com um **usar esta** para aplicá-la.

### Ficha técnica (composição do produto)

É aqui que o CMV do produto é calculado — nunca digitado à mão. Clique em **Adicionar
componente** para incluir um item na ficha. Para cada componente, escolha:

1. **Tipo**: **Insumo** (matéria-prima, ex.: TNT, elástico) ou **Produto (kit)** — quando este
   produto é, na verdade, composto por outro produto já cadastrado (uma composição em cascata,
   não confundir com o módulo de Kits).
2. O **insumo ou produto** específico, na lista.
3. **Quantidade por**, que define como a quantidade consumida é calculada:
   - **Direta**: um número simples (ex.: 2 unidades).
   - **Área (L×C÷rend.)**: largura × comprimento ÷ rendimento — para materiais medidos por área,
     como bobinas de tecido (ex.: 1,00 × 1,20 ÷ 0,99).
   - **Lote (1÷tam.)**: 1 dividido pelo tamanho do lote — para itens comprados em lote, como "1
     caixa para 150 unidades".

Cada linha da ficha mostra, ao lado, o **custo** e a **participação percentual** daquele
componente no total assim que todos os campos estiverem preenchidos. No fim da ficha, um destaque
mostra o **CMV do produto** (soma de todos os componentes).

### Erros comuns ao salvar

- **Referência circular**: o sistema bloqueia se um produto acabar contendo a si mesmo (direta ou
  indiretamente, através de outro produto). A mensagem de erro explica isso claramente.
- **Código duplicado**: se já existir um produto com o mesmo código, o sistema avisa.

Clique em **Salvar** para gravar, ou **Cancelar** para voltar sem salvar.
