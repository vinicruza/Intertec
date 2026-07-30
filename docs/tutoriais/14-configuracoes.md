# 14 — Configurações

Painel com todos os parâmetros que mudam o resultado do cálculo em todo o sistema: canais, faixas
de margem, regras de aprovação, código de ERP e as tabelas de imposto e frete por UF. **Quem pode
usar:** somente Administrador (bloco "Administração" 🔒).

Alterar qualquer parâmetro aqui **nunca recalcula pedidos já fechados** — eles têm o custo
congelado no momento em que foram fechados (snapshot). As mudanças valem a partir de agora, para
novas simulações e fechamentos.

A tela tem sete abas.

## Aba "Canais"

Um canal (Interno, Marketplace, Externos, Revendas, Descpro etc.) parametriza o cálculo de todo
pedido feito por um vendedor daquele canal. Para cada canal, você pode ajustar:

- **Aplica DIFAL** — caixa de marcar (sim/não).
- **Comissão padrão** — fração (ex.: `0,025` para 2,5%). É o valor que o Simulador sugere; o
  vendedor pode alterar caso a caso, com registro em auditoria.
- **Modelo de frete** — **Manual** (quem monta o pedido digita o valor) ou **% da receita por UF
  (Portal)** (o sistema calcula automaticamente a partir da tabela de frete Portal, aba "Frete
  Portal" desta mesma tela).

Um botão **Salvar** aparece ao lado assim que você altera algum campo da linha.

## Aba "Faixas de margem"

Define as faixas de status de margem de contribuição usadas em todo o sistema (Simulador,
Aprovações, DRE): **Boa**, **Atenção**, **Crítica**, **Negativa** — todas calculadas sobre a
**receita líquida**. Para cada faixa, edite **Mínimo**, **Máximo** (deixe em branco para "sem
piso"/"sem teto") e a **Cor**, e clique em **Salvar**.

## Aba "Aprovação de pedidos"

Controla quem aprova pedidos e como a aprovação funciona:

- **Perfis que podem aprovar** — marque quais perfis (Administrador, Financeiro, Comercial,
  Produção) enxergam a tela [Aprovações](05-aprovacoes.md) e podem decidir. É a mesma permissão
  usada nos dois lugares — não existem duas listas que podem ficar desalinhadas.
- **Exigir aprovação para fechar o pedido** — se marcado, todo pedido precisa passar por aprovação
  antes de poder ser fechado.
- **Mostrar ao Comercial só a cor da margem, sem o número** — marcado por padrão. A ideia: vendo o
  percentual exato, o desconto ganha um alvo ("vou descontando até raspar o limite"); vendo só a
  cor, isso não é possível.
- **Travar aprovação abaixo da margem** — um valor em fração (ex.: `0,20` para 20%) que bloqueia a
  aprovação se a margem estiver abaixo dele. Deixe vazio para não travar nada — a orientação
  inicial da empresa foi primeiro só observar o comportamento, sem bloquear.

Clique em **Salvar**. O botão fica desabilitado se nenhum perfil aprovador estiver marcado.

## Aba "Código para o ERP"

Configura um código numérico **paralelo** ao código semântico do produto (ex.: PC-0001), pensado
para o sistema de faturamento. Um aviso amarelo explica que o formato ainda não foi confirmado com
a Intertech — por isso esse recurso vem **desligado por padrão**.

- **Sistema de destino**, **Total de dígitos**, **Dígitos da categoria** — a tela calcula
  automaticamente quantos dígitos sobram para o número sequencial e a capacidade de produtos por
  categoria.
- **Ligar a geração de código de ERP** — marque só depois de confirmar o formato aceito pelo
  sistema de faturamento. O prefixo numérico de cada categoria é definido em
  [Cadastros](13-cadastros.md), aba "Categorias de produto".
- Clique em **Salvar formato** para gravar os parâmetros.
- **Gerar códigos pendentes** gera o código para os produtos que ainda não têm um (com
  confirmação antes de rodar). Produtos que já têm código **nunca são alterados** — mudar um código
  já emitido quebraria a referência no sistema de faturamento.

## Aba "ICSM por UF"

Tabela editável com a alíquota total (ICMS interestadual + PIS/COFINS) usada no cálculo de imposto
sobre a venda, por UF de destino. Edite **ICMS** e/ou **PIS/COFINS** e clique em **Salvar**.

## Aba "DIFAL por UF"

Tabela com o DIFAL por UF, migrada da planilha como estava. UFs com um ícone de alerta (⚠️) têm o
valor final que não bate exatamente com a soma de Pobreza (FCP) + Alíquota base — vale confirmar
com o contador antes de mudar. Você pode editar o campo **DIFAL final**; Pobreza e Alíquota base
são somente leitura.

## Aba "Frete Portal (Marketplace)"

Tabela com o **% do frete** sobre a receita, por UF — usada pelos canais configurados com o modelo
de frete "% da receita por UF" (ex.: Marketplace). Edite o percentual e clique em **Salvar**.
