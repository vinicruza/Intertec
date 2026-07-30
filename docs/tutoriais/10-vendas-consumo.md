# 10 — Vendas do ERP e consumo de insumos

Importa o relatório de vendas do sistema de faturamento (que continua fora do Intertec) e mostra
quanto foi consumido de cada insumo no mês, explodindo cada venda pela ficha técnica do produto ou
kit vendido. **Quem pode usar:** Administrador e Financeiro.

## Por que esta tela existe

O faturamento da Intertech continua em outro sistema, então nem toda venda "nasce" dentro do
Intertec. Esta tela cruza o relatório de vendas (por código) com o CMV que o sistema já calcula,
fechando o CMV do mês e respondendo, por exemplo, "quanto vendemos de laminado" — mesmo que o
laminado não tenha um código de venda próprio, porque está dentro de vários produtos diferentes.

## Passo 1 — Escolher o mês

No campo **Mês de competência**, escolha o mês ao qual o relatório se refere.

## Passo 2 — Colar o relatório

No campo de texto, cole o conteúdo do relatório de vendas exportado do sistema de faturamento. O
sistema aceita:

- separador por ponto e vírgula, vírgula ou tabulação;
- número em formato brasileiro (`1.234,56`) ou americano (`1234.56`);
- cabeçalho na primeira linha (opcional).

Assim que você cola o texto, o sistema já mostra quantas linhas foram lidas e, se houver
problemas (linha com formato inválido, por exemplo), lista cada um com o número da linha, o
motivo e o conteúdo original.

## Passo 3 — Importar

Clique em **Importar para o mês**. Uma confirmação avisa: **reimportar o mesmo mês substitui o
lote anterior inteiro** — importar duas vezes sem querer não duplica a receita, porque a segunda
importação sempre troca a primeira.

## Códigos não encontrados

Se algum código do relatório não corresponder a nenhum produto ou kit do catálogo, um aviso
amarelo lista quantos (e mostra os primeiros 20 códigos). Essas vendas ficam registradas — nunca
são descartadas em silêncio — mas não entram no cálculo de consumo, porque o sistema não sabe
explodir a composição de um item que não conhece.

## O que você vê depois de importar

- **Vendas importadas**: cada linha do relatório, o item do catálogo com que ela foi conciliada
  (ou o selo "não conciliado"), a quantidade e a receita.
- **Consumo de insumos no mês**: cada venda conciliada é explodida pela ficha técnica até o
  insumo. A tabela mostra, para cada insumo consumido no período, a quantidade e a unidade — é
  assim que se sabe, por exemplo, quanto saiu de SMS 30g no mês.
