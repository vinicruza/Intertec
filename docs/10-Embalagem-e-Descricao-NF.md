# 10 — Insumo de embalagem e Descrição NF

> **Versão:** 1.0 — 30/07/2026
> Dois pedidos do cliente, olhando o montador de kit e a tela de produto.

## 1. Por que o montador de kit mostrava todo o catálogo

*"Por que tem toda a lista de insumos se ali deveria ser apenas para colocar envelope e caixa?"*

Porque o sistema nunca soube quais insumos são embalagem. A tabela de insumos guarda bobina de TNT, compressa, elástico, costureira, envelope e caixa no mesmo lugar, sem nada que os separe — o dropdown do montador de kit não tinha como filtrar, então mostrava tudo, dos 80 insumos ativos.

Agora existe uma marca (`inputs.is_packaging`), com uma caixinha na tela de Insumos — **"É embalagem ou esterilização"**, ao lado da caixinha de mão de obra que já existia. Ela não muda cálculo nenhum: o custo entra igual, marcado ou não. Só filtra o que aparece ao montar um kit.

**Marcados automaticamente** nos 80 insumos ativos: os 20 inequívocos pelo nome — 10 Envelopes, 7 Caixas, 3 Esterilizações. **Deixados de fora de propósito**: Bag, Saco 40x60, Saco 60x90, Tag, Etiquetinha, Etiqueta adesiva catarata, Gráfica — podem muito bem ser embalagem, mas quem decide isso é a Intertech, não um palpite por nome. Ficam disponíveis pelo atalho "Não achei o insumo — mostrar todos" no montador, até o Administrador marcar cada um na tela de Insumos.

### 1.1 Defeito encontrado no caminho

A caixinha "É mão de obra" existe na tela desde a Sprint A, mas a função do banco que salva o insumo **nunca gravava esse campo** — o navegador mandava o valor, e ele era descartado em silêncio. Na prática, ninguém nunca conseguiu marcar ou desmarcar mão de obra pela tela; os únicos insumos marcados eram os que uma migração antiga já tinha marcado pelo nome ("%costureira%"). Corrigido junto — não faria sentido adicionar a marca de embalagem pelo mesmo caminho quebrado.

## 2. Rótulos do montador de kit

Testando a tela junto com o cliente, apareceram três confusões reais, não só falta de costume:

1. **Dois campos "Quantidade" com sentidos diferentes** — um é quantos *kits* estão sendo vendidos, outro é quantas unidades de um produto entram em *um* kit. Agora o de cima muda de rótulo para "Quantidade de kits" / "Preço por kit" quando a linha é um kit montado, e a caixa de composição abre com uma frase fixando a diferença: *"A quantidade e o preço acima são da venda deste kit. Aqui embaixo é a receita do kit."*
2. **"Adicionar insumo"** virou **"Adicionar embalagem"** — o botão só adiciona insumo de embalagem, nunca fez sentido ele ter o nome genérico.
3. **"Itens por caixa" não é a quantidade de caixas** — é quantos kits uma caixa atende, e o sistema rateia o custo sozinho. Cada linha agora mostra "kits por caixa" ou "un. por kit" ao lado do número, para o sentido não depender de lembrar o texto de ajuda lá em cima.

Mesmo tratamento nas duas telas que montam kit: o Simulador (kit nascendo dentro do pedido) e a tela de Kits (edição manual).

## 3. Descrição NF no cadastro de produto

Campo novo em **Produtos → Editar produto**: texto livre que vai sair na nota fiscal quando o produto for faturado. Guardado só para não depender de decorar ou copiar de outro lugar na hora de faturar — a emissão de nota fiscal em si continua fora do sistema (PRD §11), a mesma lógica do código de ERP (Sprint E): o sistema guarda o dado que o faturamento vai precisar, mesmo sem estar integrado a ele.

Sem validação de formato — quem decide o texto certo é a Intertech.

## 3.1 Peso de custo por produto dentro do kit (mesmo dia, segunda rodada)

Pergunta do cliente, olhando o preço único do kit: *"não saberemos qual produto deu maior margem ou menor margem em cada kit... talvez o melhor caminho seja colocar preço em cada produto dentro do kit."*

Recomendação dada e aceita: **não** criar um preço por produto dentro do kit — isso não existe de verdade, porque o cliente negocia o kit inteiro, não a peça, e inventar um preço por item exigiria alocar o total de algum jeito arbitrário (mais uma fonte de erro, não menos). O que existe de verdade é o **custo** de cada item, e é isso que responde a pergunta real: qual produto está pesando mais no kit.

O motor de cálculo (`custoKitCompleto`) passou a devolver, além dos totais que já existiam, uma linha por produto e por item de embalagem com o **custo** e a **participação** (fração do custo total do kit — soma 100% somando produtos e embalagem juntos). Mesma ideia que já existia na ficha técnica de produto avulso, aplicada ao kit inteiro.

Aparece como uma tabela "Peso de cada item no custo do kit" nas duas telas que montam kit — o Simulador (kit nascendo dentro do pedido) e a tela de Kits — ordenada do item mais pesado para o mais leve.

## 4. Nomenclatura de NF do catálogo (04/08/2026)

O campo "Descrição NF" da Seção 3 nasceu como texto livre, e ficou vazio nos 324 produtos —
ninguém ia digitar 324 vezes. O cliente então definiu a regra que gera esse texto sozinho,
começando pelos campos cirúrgicos (216 produtos, a categoria CC inteira).

O problema real: o nome do catálogo carrega detalhe de fabricação que não deve sair impresso
na nota. `Campo Simples 1,00 x 1,20 Não Estéril GR40` diz a gramatura da bobina; para o
faturamento isso é ruído, e ainda faz o mesmo produto comercial aparecer com dois nomes só
porque saiu de GR30 ou de GR40. **O nome do catálogo não muda** — é ele que sustenta CMV,
ficha técnica e histórico. O que nasce é um segundo nome, paralelo, só para a nota.

A regra tem duas metades. Primeiro, o começo do nome vira o nome fiscal da família:

| Família no catálogo | Descrição NF |
|---|---|
| Campo Catarata | Campo Cirúrgico com Adesivo e Bag |
| Campo com Fenestra | Campo Cirúrgico com Fenestra |
| Campo com Adesivo | Campo Cirúrgico com Adesivo |
| Campo de Mesa | Campo Cirúrgico com Reforço |
| Campo Lasik | Campo Cirúrgico com Adesivo e 2 Bags |
| Campo Simples | Campo Cirúrgico Sem Fenestra |
| Steri Drape | Campo Cirúrgico Steri Drape (Grande → G, Pequeno → P) |
| Campo Lateral, Superior, Inferior, de Mayo, Fenestra U… | Campo Cirúrgico + o resto do nome |

Segundo, some do resto o que não pode variar a nota: **gramatura** (`GR30`, `GR 40`),
**matéria-prima** (`TNT`, `SMS`) e **origem** (`China`). Tamanho, `+ Tape`, `Estéril` e
`Não Estéril` continuam — são a diferença real do que está sendo entregue.

Resultado: 216 campos → **139 descrições distintas**.

### 4.1 Segunda rodada: o resto do catálogo (mesmo dia)

Definidas as regras dos 108 produtos restantes, o catálogo inteiro passou a ter nome fiscal.

| Família no catálogo | Descrição NF |
|---|---|
| Avental (todos) | Avental Cirúrgico + o resto do nome |
| Avental Gineco | Avental Cirúrgico Sem Manga |
| Compressa Wiper | Toalha de Mão |
| Todo o restante | o próprio nome do catálogo, sem mudança |

Nos aventais, **"Tag" vira "Toalha"**, e somem o **TNT** e a **gramatura** (aqui escrita
`30g`/`40g`, não `GR30`). O **SMS fica** — pedido explícito, ao contrário do que vale para os
campos, onde TNT e SMS somem os dois. Tamanho (M, G, GG, EGG), "Laminado", "com Compressa" e
"Estéril/Não Estéril" continuam.

Três efeitos que valem registro, porque parecem erro e não são — saem direto das regras:

- **"Avental Gineco" e "Avental TNT Sem Manga" passam a ter a mesma descrição de NF**
  (`Avental Cirúrgico Sem Manga`): um vira "sem manga" por definição, o outro perde o TNT e
  chega no mesmo lugar.
- **"Avental TNT 30g ML" e "Avental TNT 40g ML" também se juntam** em `Avental Cirúrgico ML`
  — que é exatamente o ponto de tirar a gramatura da nota.
- **"Conjunto P/M TNT" mantém o TNT.** A remoção foi pedida para os aventais; conjunto entra
  em "o restante se mantém igual".

Catálogo completo: **324 produtos, 243 descrições distintas**, nenhum em branco.

### 4.2 Por que existe a marca de origem

A regra vai rodar de novo — quando um produto novo for cadastrado, ou uma família ganhar nome
fiscal diferente. Se ela simplesmente reescrevesse tudo, apagaria em silêncio qualquer texto que a Intertech tivesse
corrigido à mão. Por isso cada descrição guarda **como foi escrita** (`nf_description_source`):
`regra` ou `manual`. A regra só mexe no que é dela; o que uma pessoa ajustou fica marcado
"ajustada à mão" na lista de produtos e é intocável.

### 4.3 Onde isso aparece

Coluna **Descrição NF** na lista de Produtos (e na busca — dá para procurar pelo nome fiscal).
Na tela de editar produto o campo continua editável e passa a mostrar, abaixo dele, o texto
que a regra produziria, com um "usar esta" para aplicar.

As listas que as duas migrações gravaram **não foram escritas à mão nem reimplementadas em
SQL**: saíram de rodar `descricaoNFdoProduto` sobre o catálogo. Duas cópias da mesma regra,
uma em TypeScript e outra em SQL, divergiriam com o tempo — e a divergência sairia impressa
na nota fiscal antes de alguém perceber.

## 5. Onde cada coisa mora

| Peça | Arquivo |
|---|---|
| Migração (embalagem + correção de is_labor + Descrição NF) | `supabase/migrations/20260730000200_insumo_de_embalagem.sql`, `20260730000300_descricao_nf_produto.sql` |
| Caixinha de embalagem na tela de Insumos | `app/pages/InsumoFormPage.tsx` |
| Filtro no montador de kit (Simulador) | `app/pages/SimuladorPage.tsx` (`MontadorKit`) |
| Filtro no montador de kit (tela de Kits) | `app/pages/KitFormPage.tsx` |
| Descrição NF | `app/pages/ProdutoFormPage.tsx`, `app/lib/db/produtos.ts` |
| Peso de custo por item do kit (motor) | `lib/calculations/kits.ts` (`custoKitCompleto` → `linhasProdutos`, `linhasEmbalagem`), golden test T11e |
| Peso de custo por item do kit (simulador) | `app/lib/sim/kitNoPedido.ts`, `app/pages/SimuladorPage.tsx` (`PesoDeCustoDoKit`) |
| Peso de custo por item do kit (tela de Kits) | `app/pages/KitFormPage.tsx` |
| Regra de nomenclatura de NF | `lib/nomenclatura/descricaoNF.ts`, testes em `tests/nomenclatura/descricaoNF.test.ts` |
| Migração (marca de origem + carga dos 216 campos) | `supabase/migrations/20260804000300_nomenclatura_nf_campos.sql` |
| Migração (carga dos 108 restantes) | `supabase/migrations/20260804000400_nomenclatura_nf_resto_do_catalogo.sql` |
| Coluna Descrição NF na lista | `app/pages/ProdutosPage.tsx` |
| Sugestão da regra no cadastro | `app/pages/ProdutoFormPage.tsx`, `app/lib/db/produtos.ts` |
