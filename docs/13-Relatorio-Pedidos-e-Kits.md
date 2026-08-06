# 13 — Relatório: criação de pedidos pelo vendedor e criação de kits

> **Data:** 06/08/2026
> **Pedido do cliente:** criar uma bateria de testes da lógica de criação de pedidos pelos
> vendedores; verificar se o fluxo ocorre de forma fluida, se a criação de kits gera código e se o
> sistema avisa qual é o código quando o kit já existe; e analisar como deixar a criação de kits
> mais intuitiva.

---

## 1. Resumo em uma página

A lógica de cálculo do pedido está correta e bem defendida: nada é calculado com custo zero, a
mesma composição nunca ganha dois códigos, e a cascata de margem bate número a número com o
fixture da Patricia. **Foram criados 70 testes automatizados novos** (de 260 para 330 no total),
cobrindo o caminho inteiro do vendedor: escolher itens, montar kit na hora, ser avisado de kit
repetido, salvar a cotação e congelar o snapshot no fechamento.

O fluxo **não estava fluido em quatro pontos**, todos corrigidos nesta entrega. O mais grave: um
pedido com kit montado na hora **quebrava a tela de quem aprova** — em vez da margem, o aprovador
via um erro. Ou seja, o caminho mais novo do produto (montar o kit dentro do pedido) era
justamente o que não chegava inteiro na aprovação.

Sobre a criação de kits ser confusa: **sim, há confusão, mas ela não vem de misturar kit e produto
na mesma tela** — essa mistura é o acerto do desenho atual. A confusão vem de três coisas
menores e concretas, listadas na Seção 5.

---

## 2. A bateria de testes criada

Três arquivos novos, 70 testes, todos verdes junto com os 260 que já existiam.

| Arquivo | Testes | O que garante |
|---|---|---|
| `tests/pedidos/fluxo-do-vendedor.test.ts` | 30 | O pedido inteiro, ponta a ponta: produto individual, kit de catálogo, kit montado na hora e os três juntos na mesma cotação. Cascata, faixa de margem, bloqueios, escolhas do vendedor (frete do cliente, DIFAL, comissão, canal marketplace) e o snapshot do fechamento. |
| `tests/pedidos/itensDoPedido.test.ts` | 22 | A tradução "o que o vendedor digitou" → "itens gravados no banco", peça por peça. É onde mora a decisão de virar produto, kit de catálogo ou kit novo. |
| `tests/pedidos/regras-do-banco.test.ts` | 18 | As regras que só existem em SQL: assinatura única, formato do código do kit (KC + 4 dígitos), reaproveitamento do código na materialização, "um item é produto OU kit OU kit novo", e cotação ganha não pode ser reescrita. |

Por que o terceiro arquivo lê as migrações em vez de falar com o banco: o projeto não sobe um
Postgres na verificação automática. Esses testes não substituem um teste contra o banco de
verdade — pegam o erro mais comum aqui, que é uma migração nova reescrever uma função e deixar
cair uma cláusula. Já aconteceu neste repositório (a gravação de auditoria que travou todas as
aprovações, corrigida em 30/07/2026).

Para deixar o fluxo testável, a lógica que decidia o destino de cada linha do pedido **saiu de
dentro da tela** do Simulador e virou um módulo próprio (`app/lib/sim/itensDoPedido.ts`). É a
regra do projeto — nada de cálculo dentro de componente de tela — e, na prática, o que não sai da
tela não pode ser testado. A tela continua funcionando exatamente igual.

---

## 3. O que já funcionava e agora está protegido por teste

- **Custo zero nunca passa em silêncio.** Produto sem ficha técnica bloqueia o pedido, e a
  mensagem diz o nome do item. Vale também quando o produto sem custo está dentro de um kit
  montado na hora.
- **A mesma composição nunca ganha dois códigos.** O sistema reconhece o kit repetido mesmo que o
  vendedor monte os produtos em outra ordem, ou digite o mesmo produto em duas linhas (1 + 1 = 2).
- **Trocar o número de caixas cria um kit diferente**, porque o custo é diferente — e a caixa de
  esterilização entra rateada pelos kits que ela atende, não inteira em cada kit.
- **No Simulador, o aviso de kit repetido sempre mostrou o código** (ex.: "Esta composição já
  existe: KC0001 (Kit Catarata)"). Isso está correto e agora tem teste.
- **As escolhas do vendedor mudam a conta na direção certa:** frete por conta do cliente zera o
  frete e o imposto sobre ele; DIFAL marcado/desmarcado no pedido vence o padrão do canal; a
  comissão digitada substitui a do canal; canal marketplace troca o frete digitado pelo percentual
  da UF.
- **Pedido com prejuízo é classificado como "Negativa", nunca como "Boa"** (regressão do bug de
  sinal corrigido em 04/08/2026).
- **O snapshot do fechamento congela exatamente o que a tela mostrou.**

---

## 4. Defeitos encontrados — e corrigidos nesta entrega

### 4.1 Pedido com kit novo quebrava a tela de quem aprova (grave)

**O que acontecia.** Entre salvar a cotação e ganhar o pedido, o kit montado na hora ainda não
existe no catálogo: ele mora em colunas provisórias do item. Quem lia o pedido depois — a fila de
aprovação e o detalhe do pedido — procurava o custo pelo código do produto ou do kit, não achava
nenhum dos dois, e assumia custo zero. Como custo zero é bloqueante, **a cascata inteira
falhava**: no lugar da margem aparecia um aviso `Item "null": CMV zerado ou ausente`, e na fila de
aprovação o pedido ficava com um selo de erro.

O resultado prático: quem foi chamado para conferir CMV e margem não via nem um nem outro —
exatamente o problema que a tela de aprovação existe para resolver.

**Correção.** O kit montado no pedido passa a ser reconstruído fora do simulador, com o mesmo
custo, o mesmo nome e a composição expandida. Teste: *"o kit montado na hora é reconstruído com o
mesmo CMV, nome e composição"*.

### 4.2 Kit novo aparecia como "—" no pedido e na ficha impressa

**O que acontecia.** No detalhe do pedido e na **ficha que vai para a mesa da conferência**, o item
de kit montado na hora saía como um travessão, sem nome e sem composição. Também saía vazio na
busca do histórico e na exportação em Excel.

Isso contraria o pedido explícito da reunião: o kit tem de sair **descrito item por item**, porque
é dessa lista que sai o lançamento da nota.

**Correção.** O item passa a mostrar o nome dado pelo vendedor e a composição (`2× Avental TNT 40g
· 1× Campo Cirúrgico Catarata`), com a indicação de que o código nasce quando o pedido for ganho.
Vale para o detalhe, a ficha impressa, a busca e a planilha exportada.

### 4.3 O aviso de kit duplicado na tela de Kits não dizia o código

**O que acontecia.** Na tela de Kits, ao salvar uma composição que já existe, o aviso dizia só o
**nome** do kit existente. Nome de kit não identifica nada — dois kits podem se chamar "Kit
catarata" e "Kit catarata Hospital X", e o que vai no pedido, na nota e na conversa com a fábrica
é o código.

**Correção.** A função do banco passa a devolver o código (e se o kit está inativo), e a tela
mostra: *"Já existe um kit com exatamente esta composição: **KC0001** — Kit Catarata. Use esse
código no pedido em vez de criar outro igual."* Migração
`20260805210000_codigo_no_aviso_de_kit_duplicado.sql`.

### 4.4 Kit inativo com a mesma composição não gerava aviso nenhum

**O que acontecia.** A assinatura do kit é única no banco **independentemente do status**. Mas o
Simulador só carregava kits ativos, então uma composição igual à de um kit desativado não gerava
aviso — e, no fechamento, o pedido acabava ligado ao kit inativo sem ninguém saber.

**Correção.** O aviso passa a cobrir o kit inativo, dizendo que ele está inativo e que o pedido vai
usá-lo assim mesmo.

### 4.5 Separador de milhar quebrava o cálculo

**O que acontecia.** O sistema trocava a vírgula por ponto, e só. Quem digitasse `4.000,5` (o caso
normal aqui — o pedido de referência da Patricia são 4.000 aventais) mandava `4.000.5` para o
motor, que não é número; a tela respondia com um "não foi possível calcular" que não explicava
nada.

**Correção.** Quando há vírgula, o ponto é tratado como separador de milhar. Sem vírgula, o ponto
continua sendo a casa decimal, porque é assim que o valor volta do banco.

---

## 5. Criação de kits: o que é confuso hoje e o que sugiro

### 5.1 Resposta direta: misturar kit e produto na mesma tela é confuso?

**Não — e mudar isso seria um retrocesso.** O desenho atual (o kit nasce dentro do pedido, na
mesma lista de itens) foi a decisão da reunião de 16/07/2026 e resolve o problema real: o vendedor
está negociando um pedido, não cadastrando catálogo. Separar as telas de novo traria de volta o
"crie o kit lá, depois volte aqui e procure o código".

A confusão que existe é outra, e é de rótulo e de ergonomia, não de conceito. São três pontos,
por ordem de impacto:

### 5.2 Três problemas concretos (sugestões, não implementadas — dependem do seu aval)

**(a) A lista de 324 produtos é uma caixa de seleção comum, sem busca.** Este é, de longe, o maior
atrito da criação de pedido — e piora dentro do montador de kit, onde a pessoa repete a operação
uma vez por produto do kit. Sugestão: campo com busca por código e por nome (digita "catarata",
filtra). É a melhoria de maior retorno da tela inteira, e vale tanto para o item do pedido quanto
para o kit.

**(b) O mesmo número tem três nomes.** No montador do Simulador, a opção se chama "itens por
caixa", a legenda embaixo do campo diz "kits por caixa" e o texto explicativo diz "quantos kits
ela atende". Na tela de Kits, o rótulo é "Itens por caixa" e o texto diz "quantos itens cabem
nela". O número correto é **quantos kits a caixa atende** — "itens" induz ao erro de contar peças
em vez de kits, e o erro multiplica o custo da caixa. Sugestão: padronizar em
**"Quantos kits cabem na caixa"** nos dois lugares, e nada mais.

**(c) Duas quantidades a poucos centímetros uma da outra.** Em cima, "Quantidade de kits" (a
venda); embaixo, "Qtd. no kit" (a receita do kit). Os textos de apoio já avisam, mas o risco de
trocar 100 por 2 permanece. Sugestão: recuar o montador com uma barra lateral e um título
**"Receita de 1 kit"**, e mostrar uma frase-resumo acima da cascata: *"1 kit = 2× Avental + 1×
Campo · vendendo 100 kits"*.

### 5.3 Outras sugestões, em ordem de utilidade

1. **"Partir de um kit existente".** Hoje, montar "o kit catarata mais uma compressa" obriga a
   escolher tudo de novo. Um botão que carrega a composição de um kit do catálogo no montador
   resolveria — e o aviso de composição repetida cuida do resto.
2. **Exigir o nome do kit.** O campo é opcional e, sem ele, o kit entra no catálogo como "Kit do
   pedido". Com o tempo, o catálogo enche de kits com o mesmo nome. Sugestão: exigir o nome, ou
   sugerir um automático a partir da composição.
3. **Avisar qual código nasceu.** Ao ganhar o pedido, o sistema cria os kits e gera os códigos,
   mas não conta isso a ninguém — a informação já existe (a função do banco devolve quantos foram
   criados) e é descartada. Sugestão: ao fechar, mostrar *"2 kits novos criados: KC0004, KC0005"*.
4. **Comissão é digitada como fração** (`0,025` para 2,5%), sem limite. Um `0,25` digitado por
   engano vira 25% de comissão e passa. Sugestão: campo em porcentagem, com aviso acima de um
   teto configurável.
5. **Quantidade "1.000" sem vírgula.** Continua sendo lida como 1 — é ambíguo por natureza
   (`4.20` precisa continuar valendo 4,20). Sugestão: máscara no campo de quantidade, que resolve
   a ambiguidade na digitação em vez de adivinhar depois.

### 5.4 Um risco que merece decisão sua

**Editar a composição de um kit já existente muda o que o código significa.** Na tela de Kits, a
composição de um kit continua editável, e o código permanece o mesmo. Consequências: (i) uma
cotação em aberto que usa esse kit passa a valer outro custo, sem aviso; (ii) o código que alguém
anotou no papel deixa de corresponder à composição que ele viu. Isso não afeta pedidos já
fechados, que guardam o custo congelado.

Sugestão: bloquear a edição de composição para kits que nasceram de um pedido ganho (montar um kit
novo, com código novo, é barato e a assinatura única impede duplicidade), deixando nome e
descrição editáveis. **Não implementei** porque muda regra de negócio e depende da sua decisão.

---

## 6. O que mudou no código

| Arquivo | Mudança |
|---|---|
| `app/lib/sim/itensDoPedido.ts` | **Novo.** Traduz linhas da tela em itens do pedido; reconstrói o kit montado na hora fora do simulador. |
| `app/pages/SimuladorPage.tsx` | Passa a usar o módulo acima; aviso de kit repetido cobre kit inativo. |
| `app/lib/db/fechamento.ts` | Kit montado na hora entra na cascata de quem aprova; item leva a composição com nomes. |
| `app/lib/db/pedidos.ts` | Kits inativos entram no aviso de composição repetida; catálogo de kit compartilhado entre simulador, aprovação e fechamento. |
| `app/pages/PedidoDetalhePage.tsx`, `PedidoFichaPage.tsx`, `PedidosPage.tsx`, `app/lib/export/pedidos.ts` | Kit montado na hora aparece com nome e composição. |
| `app/lib/format.ts`, `app/lib/sim/kitNoPedido.ts` | Separador de milhar do teclado brasileiro. |
| `app/lib/db/kits.ts`, `app/pages/KitFormPage.tsx` | Aviso de duplicidade com código e status. |
| `supabase/migrations/20260805210000_…sql` | `save_kit_with_items` devolve o código do kit. |
| `tests/pedidos/*` | 70 testes novos. |

Verificação: tipos, lint, 330 testes e build — todos verdes.
