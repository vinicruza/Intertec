# 11 — Roteiro de conferência antes e durante a operação

> **Versão:** 1.0 — 04/08/2026
> Escrito depois que dois defeitos passaram por 130 testes automatizados e só apareceram
> quando uma pessoa montou um pedido de verdade na tela.

## 1. A lição dos dois defeitos

Vale entender por que eles escaparam, porque isso decide onde vale gastar o esforço de teste.

| | Selo "Boa" num prejuízo | Frete saindo duas vezes |
|---|---|---|
| A tela quebrou? | Não | Não |
| O botão funcionou? | Sim | Sim |
| Deu mensagem de erro? | Não | Não |
| O que estava errado | O **número** | O **número** |

**Testar "cada botão" não teria encontrado nenhum dos dois.** Os dois botões funcionavam
perfeitamente. O que estava errado era o resultado — e um resultado errado só é detectável
por quem sabe qual era o resultado certo.

Daí a regra que organiza este roteiro:

> Não se procura por tela quebrada. Procura-se por **número que não bate com algo em que já
> se confia**.

E a Intertech tem em que confiar: a planilha, e a conta feita à mão numa calculadora.

## 2. As quatro camadas de proteção, e o que cada uma pega

| Camada | Pega | Não pega | Custo |
|---|---|---|---|
| **Testes de cálculo** (155) | Erro de fórmula nos casos previstos | O caso em que ninguém pensou | Rodam sozinhos, 4 s |
| **Testes de invariante** (8 × 400 combinações) | Erro de fórmula no caso em que **ninguém pensou** | Erro de tela; regra de negócio errada | Rodam sozinhos, 0,3 s |
| **Testes de tela** (E2E) | Tela que não abre, link quebrado, erro de JavaScript | Número errado numa tela que abre normalmente | Rodam sozinhos, ~2 min |
| **Conferência humana** (este roteiro) | **Número errado numa tela que funciona** | — | Tempo de pessoa |

A camada que pegou os dois defeitos foi a quarta. É a mais cara e a mais insubstituível.

### 2.1 Sobre os testes de invariante

Foram criados por causa deste episódio, e merecem explicação porque são o único mecanismo do
sistema que encontra defeito que ninguém previu.

Um teste comum diz *"com esta entrada, espero este número"* — e só cobre o exemplo que alguém
imaginou. Um teste de invariante diz *"isto tem de valer SEMPRE"* e joga 400 combinações
sorteadas contra a afirmação, inclusive as absurdas: frete três vezes maior que a venda, preço
abaixo do custo, imposto de 35%. Exemplos do que está afirmado hoje em `tests/calc/invariantes.test.ts`:

- o sinal do percentual é sempre o sinal do dinheiro;
- nenhum resultado é `Infinity` ou `NaN`;
- a cascata fecha: receita menos cada dedução dá exatamente a receita líquida;
- marcar "frete por conta do cliente" nunca piora o resultado;
- aumentar o preço nunca reduz a margem.

**Verificado:** reintroduzindo os dois defeitos de propósito, 4 das 8 invariantes quebram e
apontam para eles. A rede foi testada contra os peixes que deixou passar.

Quando aparecer um defeito novo de cálculo, o reflexo certo não é só corrigir e escrever o
teste daquele caso: é perguntar **"que verdade foi violada aqui?"** e afirmá-la como invariante.
Aí ela protege contra a família inteira, não contra um exemplo.

## 3. Conferência de aceitação — fazer uma vez, antes de liberar

Estimativa: 2 a 3 horas com duas pessoas, uma operando e outra conferindo os números.

### 3.1 Acesso e perfis (30 min)

- [ ] Criar um usuário de cada perfil (Financeiro, Comercial, Produção) na tela de Usuários.
- [ ] Entrar com cada um e conferir que o menu mostra **só** o que o módulo 12 do manual promete.
- [ ] Confirmar que o bloco **Administração 🔒** não aparece para ninguém além do Administrador.
- [ ] Digitar `/usuarios` na barra de endereço com o login do Comercial — tem de recusar,
      não só esconder o link.
- [ ] Confirmar que o Comercial **não** vê a tela de Insumos (é preço de insumo).
- [ ] Vincular cada Comercial ao vendedor dele na tela de Usuários.
- [ ] Com o Comercial, abrir o Simulador: a lista de vendedores tem de mostrar **só ele**.
- [ ] Deixar um Comercial sem vendedor vinculado e confirmar que aparece o aviso, e não um
      erro só na hora de salvar.

### 3.2 O número que importa — CMV (30 min)

Escolher **5 produtos** de perfis diferentes: um simples, um com mão de obra, um com componente
por área, um com componente por lote, e um kit.

- [ ] Para cada um, conferir o CMV da tela contra o CMV da planilha. **Devem bater até o centavo.**
- [ ] Num produto com mão de obra, conferir que o "CMV sem mão de obra" é o CMV cheio menos
      exatamente o custo da costureira.
- [ ] Alterar o preço de um insumo usado por vários produtos, salvar, e conferir que o CMV de
      **todos** eles mudou (recálculo em cascata) — e que nenhum pedido já fechado mudou.
- [ ] Desfazer a alteração de preço.

**Teste de sabotagem** (é assim que se encontram os erros bobos):

- [ ] Numa ficha por área, digitar rendimento `0` e tentar salvar → tem de dar erro claro,
      nunca um número.
- [ ] Numa ficha por lote, digitar tamanho `0` → mesma coisa.
- [ ] Tentar montar um produto que contém a si mesmo → tem de dar erro de referência circular.

### 3.3 Simulador e cascata (45 min)

Reproduzir **3 pedidos reais** já feitos na planilha, um de cada canal.

- [ ] Para cada um: receita bruta, imposto, DIFAL, comissão, receita líquida, CMV e margem
      devem bater com a planilha.
- [ ] Repetir um deles com **UF diferente** e conferir que o imposto mudou conforme a tabela.
- [ ] Montar um kit dentro do pedido; conferir o CMV do kit somando à mão os produtos e a
      embalagem.
- [ ] Na caixa de esterilização, usar **"itens por caixa"** e conferir que o custo foi
      **rateado**, não somado inteiro.
- [ ] Montar o mesmo kit de novo, em outra ordem → tem de avisar que a composição já existe.

**Teste de sabotagem:**

- [ ] Preço de venda **abaixo** do custo → a margem tem de aparecer **negativa e em vermelho**.
      (Era exatamente aqui que aparecia "Boa" em verde.)
- [ ] Frete maior que a venda → margem negativa, faixa Negativa.
- [ ] Marcar "frete por conta do cliente" → o campo de frete tem de **bloquear em R$ 0,00**, e a
      margem tem de **melhorar**, nunca piorar.
- [ ] Item sem CMV cadastrado → tem de bloquear com mensagem, nunca calcular com zero.

### 3.4 Ciclo do pedido (30 min)

- [ ] Salvar cotação → conferir que gerou número de orçamento.
- [ ] Alterar e salvar de novo → tem de virar versão 2, com a versão 1 preservada.
- [ ] Enviar para aprovação com o Comercial.
- [ ] Tentar aprovar **com o mesmo usuário que enviou** → tem de recusar.
- [ ] Aprovar com outro usuário; conferir que o selo de margem da fila bate com a margem do
      pedido aberto.
- [ ] Fechar o pedido; anotar o CMV congelado.
- [ ] Alterar o preço de um insumo do produto vendido e conferir que o **pedido fechado não mudou**.
- [ ] Marcar uma cotação como perdida (com motivo) e reabri-la.
- [ ] Gerar a Ficha do pedido e conferir que o kit aparece item por item.

### 3.5 Painel e DRE (20 min)

- [ ] Conferir que os cartões do Início contam só pedidos **fechados**.
- [ ] Somar à mão a receita de 2 ou 3 pedidos fechados e conferir contra o cartão.
- [ ] Abrir o DRE do mês (`/dre`), informar a despesa fixa real e conferir a cascata inteira
      contra a soma manual dos pedidos.
- [ ] Cancelar um pedido fechado e conferir que o estorno caiu no **mês do cancelamento**.

### 3.6 Integridade (5 min)

- [ ] Abrir Integridade dos dados e confirmar **zero pendência** — ou entender cada uma que aparecer.

## 4. Durante as duas primeiras semanas

O que o PRD §10 chama de operação em paralelo. É a conferência que realmente vale.

1. **Todo pedido do dia é feito nos dois lugares** — sistema e planilha.
2. **Antes de fechar, comparar a margem.** Divergiu? Não fechar; anotar e avisar.
3. **Uma planilha de divergências**, com: número do orçamento, o que o sistema mostrou, o que a
   planilha mostrou, e a diferença. Mesmo divergência pequena entra — foi uma diferença de
   centavos que revelou o bug nº 3 da planilha antiga.
4. **No fim do primeiro mês**, fechar o DRE e conferir com o contador antes de confiar nele.

Regra de ouro do período: **quando os dois discordam, ninguém está certo até alguém conferir na
calculadora.** A planilha tem 9 classes de erro conhecidas (Calculations.md §9); o sistema tem
as que ainda não descobrimos.

## 5. Como reportar um número errado

Para eu conseguir reproduzir sem ficar adivinhando, o relato precisa de:

1. **Print da tela inteira** — foi um print que revelou os dois defeitos de 04/08.
2. **O número que apareceu** e **o número que deveria aparecer**.
3. **Como chegar lá**: qual vendedor, qual UF, quais itens, quais quantidades e preços.

Com isso eu reproduzo em teste automatizado antes de corrigir — o que garante que aquele
defeito específico nunca volte.
