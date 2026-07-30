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

## 4. Onde cada coisa mora

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
