# Análise da Reunião Intertech — 16/07/2026

> **Fonte:** transcrição "Padronização de kits, custos e categorização clientes" (1h10, 42 páginas, HiNoter).
> **Objetivo deste documento:** organizar tudo que foi falado, separar o que já está pronto do que muda e do que é novo, e propor a ordem de trabalho.
> **Status:** análise para aprovação. Nada foi implementado a partir daqui.
> **Atualização 29/07/2026:** respostas do cliente registradas na Seção 10. A decisão de retirar a Alocação de Despesas está detalhada na Seção 11.

Referências de tempo (`[mm:ss]`) apontam para o trecho da transcrição que sustenta cada ponto.

---

## 1. Resumo executivo

A reunião tratou de cinco assuntos grandes:

1. **Como categorizar clientes** (e não os kits) para conseguir análises por segmento.
2. **Como o kit nasce** — decidiu-se que ele passa a ser criado dentro do simulador de pedido, não numa tela separada.
3. **Quando o código oficial do kit é gerado** — só quando o pedido é ganho; cotações perdidas ficam registradas mas não geram código de kit.
4. **Duas correções de CMV** que a empresa considera bloqueantes para confiar no número: embalagem/esterilização por kit, e separação do custo de costureira.
5. **Padrão de código de produto**, limitado pelo sistema de faturamento atual ("Simples"). Este é o único ponto que ficou sem conclusão.

Também apareceu um questionamento importante sobre **o módulo de Alocação de Despesas**, que pode ter perdido a razão de existir.

**Duas descobertas exigem atenção imediata porque conflitam com o que já foi construído:**

- O código de produto hoje no sistema é alfanumérico (`PC-0001`, `CC-0002`). Na reunião ficou dito que o Simples aceita **seis dígitos numéricos** — o formato atual não entra lá. `[49:26]`
- A faixa de margem "boa" foi citada como **52%** na reunião; a configuração atual do sistema usa **40%**. `[38:25]`

---

## 2. Quem falou o quê

A transcrição não traz nomes, apenas "Orador A" a "Orador F". Pela leitura, os papéis são:

| Orador | Papel aparente |
|---|---|
| A | Quem construiu a planilha e cadastra os produtos hoje ("se surgir um produto novo, eu crio") |
| B | Visão financeira/estratégica — DRE, estrutura de códigos, explosão de CMV |
| C | Comercial/vendas — conhece a rotina de cotação, o Simples e a emissão de nota |
| D | Quem estava demonstrando o sistema |
| E, F | Participações pontuais |

Nomes citados em terceira pessoa durante a reunião: Cris e Michelle (validação do pedido e emissão de nota), Patrícia, Brian (estoque inicial/final para a contabilidade).

---

## 3. Decisões fechadas na reunião

### 3.1 A categorização é do cliente, não do kit `[02:25]`

O mesmo kit pode ser vendido para hospital, veterinário e oftalmologia. Categorizar o código do kit criaria códigos duplicados diferenciados só por observação. A decisão foi categorizar o **cliente**: ao cadastrar "Animaltech", já se define que é veterinário; o segmento das cotações vem por consequência. `[01:18]`

Perguntas que a empresa quer responder: "das 1.300 cotações, quantas foram para veterinário? Quantas para clínico?" `[01:28]`

Restrições levantadas: existem **13 mil cadastros de clientes sem categoria** hoje, e **as categorias ainda não estão definidas**. `[02:45]` `[02:57]`

O código do cliente também deve ter estrutura: primeiro campo = tipo (hospital, clínica...), segundo = área (oftalmológico, ginecológico...), e assim por diante. `[56:56]`

### 3.2 O kit passa a ser criado dentro do simulador de pedido `[26:01]`

Hoje são duas telas: "criar kit" e depois "simular pedido", puxando o código criado. Foi acordado inverter: a pessoa monta o kit **dentro** do simulador, e a tela de Kits vira apenas um **registro de consulta** dos kits criados. `[27:49]`

Foi reconhecido em reunião que as duas telas existem porque foram pedidas assim originalmente. `[28:02]`

### 3.3 O sistema deve avisar, na digitação, que o kit já existe `[08:00]`

Enquanto monta a composição, o sistema deve acusar que aquela combinação já tem código. `[08:38]` A empresa quer isso para conseguir emitir nota fiscal sempre com o mesmo código para a mesma composição. `[08:26]`

### 3.4 Envelope e caixa de esterilização entram no CMV do kit `[11:14]`

Este é o ponto mais direto sobre cálculo da reunião inteira.

Na montagem do kit devem existir os campos de **envelope** e **quantidade de caixas de esterilização**, que somam um "CMV extra" ao kit. A justificativa: a embalagem é uma só e a caixa é uma só **por kit**, não por produto. `[11:30]`

Hoje isso está errado na rentabilidade: usa-se um "kit aleatório" com valor fixo aproximado. `[11:40]` A frase que resume: *"Pra ter o CMV correto, 100%, que é o que a gente quer, a gente só precisa adicionar isso e aí mata."* `[11:55]`

Também foi pedido que esse custo apareça **destacado**, não diluído. `[27:07]`

### 3.5 O CMV deve ser entregue com e sem o custo de costureira `[01:07:56]`

Hoje o custo da costureira está dentro do CMV do produto. Para o DRE por competência isso distorce, porque se paga costureira referente à produção passada: *"a gente paga 40 mil aventais para as costureiras, mas a gente pode vender 30 mil aventais."* `[01:08:47]`

Confirmado em reunião: *"Em DRE de competência a gente tem que eliminar a costureira do CMV, isso é fato? É."* `[01:09:01]`

A solução aceita foi o sistema fornecer **as duas informações — com e sem mão de obra** `[01:09:26]` `[01:09:30]`, mantendo por enquanto o tratamento atual nas despesas até a casa estar arrumada. `[01:09:20]`

### 3.6 Código oficial do kit só nasce quando o pedido é ganho `[32:45]`

Este foi o debate mais longo da reunião. O caminho fechado:

- Um cliente pode pedir **15 ou mais variações** antes de fechar (troca tamanho do campo, troca avental M por G, adiciona compressa...). `[29:10]` `[33:22]`
- Criar um código de kit para cada variação criaria centenas de códigos inúteis. Conclusão: *"não tem porque criar um código de kit que não tem nada a ver com isso... não foi efetivado."* `[34:49]` `[35:47]`
- **Mas todas as cotações precisam ficar registradas.** `[34:15]` A empresa quer voltar depois e analisar o que foi cotado e não vendeu.
- O código oficial do kit é gerado no fechamento do pedido `[32:45]`, e é **único e reutilizável**: se o mesmo kit for vendido de novo no futuro, é o mesmo código. `[36:00]`

O que precisa existir para rastrear as perdas `[33:47]`:

- identificação do cliente,
- **motivo da não venda** (foi citado "preço" como exemplo), `[19:02]`
- preço de venda e custo daquela cotação,
- filtro para listar "cotações que não vingaram". `[34:43]`

Também precisa guardar o **histórico das versões** da cotação, não só a última. `[28:43]` `[32:17]`

### 3.7 Fluxo de aprovação do pedido `[20:04]`

O fluxo desenhado:

1. Comercial monta a cotação no simulador (equivale ao orçamento de hoje).
2. Sobe para aprovação — hoje isso é o papel que vai para a mesa da Cris. `[23:41]`
3. Quem aprova vê preço de venda, CMV e margem de contribuição e pode **recusar na hora**. `[21:49]` `[22:00]`
4. Aprovado, vira pedido de venda com código criado, e é digitado no Simples para a nota.

O problema que isso resolve: *"é humanamente impossível controlar. Elas pegam 200 papéis por dia e colocam na pasta."* `[21:09]` E o risco de o preço aprovado ser digitado diferente no papel — de R$ 9,00 para R$ 8,80 — sem ninguém perceber. `[39:15]`

### 3.8 O comercial vê a margem por cor, não por número `[38:25]`

Decisão deliberada, com justificativa explícita: se a vendedora vê o percentual, ela desconta até chegar rente ao limite. Vendo só a cor, *"se tiver só verde, pode estar 80%, ela não vai saber."* `[38:33]` `[38:48]`

O número completo fica para quem aprova.

Sobre travar o sistema para margem ruim: foi levantado `[22:06]`, mas a posição registrada foi **não travar no começo**, só dar visibilidade, para primeiro observar o comportamento real. `[22:14]`

**Atenção:** a faixa verde foi citada como "acima de 52%". O sistema hoje está configurado com 40%. Precisa ser confirmado.

### 3.9 O pedido gera um documento impresso automático `[37:08]`

Toda venda continua gerando o papel que vai para a Cris, mas agora **gerado automaticamente** `[37:17]`, contendo o que hoje não tem:

- preço de venda, CMV e margem de contribuição,
- o código do kit,
- **o kit descrito item por item** — necessário para digitar no Simples. `[40:06]` `[40:11]`

### 3.10 Padrão x exclusivo `[05:27]`

Definição dada pela própria empresa: **padrão é tudo que está publicado no site**; o que foge disso é exclusivo. `[05:38]`

Contexto: cerca de **95% da produção é sob encomenda** `[06:20]`, e os kits padrão representariam algo como 2–3% da venda `[06:39]`. Só nos padrão faria sentido estoque mínimo. `[05:40]`

Também foi pedido manter um **campo de descrição livre** no kit, mesmo sem uso definido ainda: *"a gente não sabe o que vai ser... é só um campo a mais."* `[07:08]` `[07:26]`

### 3.11 Nome do kit sai de cena, código é o que importa `[12:27]`

O nome gerado automaticamente deixa de aparecer. `[12:29]` A pergunta imediata foi "mas onde está o código?" `[12:30]` — o código precisa estar em destaque, e as vendedoras não digitam o número, ele é gerado. `[36:37]` Mas **tem que ter validação** de quem cria. `[36:45]`

---

## 4. Pontos que ficaram em aberto

### 4.1 Formato do código de produto — o mais crítico `[49:26]` `[56:42]`

O que se sabe:

- O Simples limita o código a **seis dígitos numéricos**. `[49:26]`
- A empresa quer um código estruturado, onde cada posição significa algo: 1º dígito = tipo (avental=1, conjunto=2, bota=3, campo de mesa=4, campo simples=5), depois tecido, gramatura, estéril/não estéril. `[50:35]` `[56:08]`
- O motivo é conseguir estratificar vendas: "quanto vendemos de SMS?", "quanto de laminado?" `[52:19]` `[53:02]`

O que trava:

- Os atributos são muitos: além de tamanho, gramatura e esterilidade, o avental pode ter compressa, tag, toalha de mão, bag (ou dois bags), fita, tape. `[01:00:16]` `[01:01:11]`
- Reconhecido na hora: *"Se tiver muita coisa, pode ser que nem caiba no código."* `[01:01:17]` E do outro lado: *"é safe, já não vai caber."* `[01:01:49]`
- Comparativo trazido: na outra empresa do Orador B o código de produto tem **15 campos**, dois deles alfanuméricos. `[01:02:34]`
- Ficou registrado o cuidado de *"não criar um monstro"*. `[01:03:01]`

Solução paliativa aceita: hoje os atributos estão no **nome** do produto (gramatura, TNT/SMS, estéril), então a busca por nome funciona `[58:24]` `[58:43]`, e o sistema pode oferecer filtros por insumo, produto e kit num período, porque a ficha técnica liga produto a insumo. `[53:40]`

**Bloqueio real:** *"a gente não sabe qual é a limitação dele ainda"* — referindo-se ao Simples. `[57:41]` Sem isso não dá para fechar o padrão. Também ficou em aberto se pode ser alfanumérico. `[49:10]`

Consequência prática: foi dito que **todos os produtos terão cadastro novo, começando do zero**. `[48:56]` `[49:01]`

### 4.2 O módulo de Alocação de Despesas ainda faz sentido? `[48:03]` — **RESPONDIDO: sai**

> **Decisão do cliente em 29/07/2026: o módulo sai.** O detalhamento do que "sai" significa em cada camada está na Seção 11. O registro do debate original fica abaixo para memória.

Comentário direto na reunião: *"tem o item de alocação de despesas, mas esse item de alocação de despesas é quando a gente não utilizar a margem de contribuição. Eu não sei se tem sentido a gente ter esse armário."* `[48:16]`

E sobre a lógica atual de rateio por fator: *"é totalmente atrapalhada, mas era só para ter uma lógica."* `[48:26]`

Como a empresa migrou o raciocínio para margem de contribuição, o módulo pode ter perdido a função. **Precisa de decisão** — é um módulo já construído (Sprint 8).

### 4.3 Como o CMV do mês será calculado `[42:21]`

Duas visões apareceram e a segunda prevaleceu:

- **Visão inicial:** ao fechar o mês, explodir os kits vendidos em componentes e somar por componente (avental deu 2 mil, campo de mesa deu 3 mil). `[43:13]` `[43:38]`
- **Ajuste prático:** o faturamento continua no Simples, então o sistema **não terá 100% das vendas**. `[44:49]` O caminho é puxar um relatório de vendas por código do Simples, jogar no sistema e cruzar com o CMV unitário de cada código. `[45:08]` `[46:09]`

Ponto que reduz o esforço: o custo total do kit já fica calculado no sistema, não precisa recalcular. `[46:30]`

Contabilidade: continua como hoje, com estoque inicial e final informados manualmente. `[47:14]` O balanço não fica 100%, mas *"o DRE vai estar muito próximo da realidade."* `[47:55]`

**Em aberto:** o formato do relatório do Simples e se a importação será por arquivo.

### 4.4 Categorias de cliente e recategorização dos 13 mil

As categorias não foram definidas `[02:57]`. Foi avaliado como trabalho não complexo, mas que *"só tem que fazer"*. `[03:03]`

### 4.5 Quem aprova, na prática

Ficou indefinido se a validação é da Cris, da Michelle, ou se o comercial fecha sozinho. `[13:36]` `[24:34]` Foi tratado como decisão operacional da empresa, não do sistema. `[18:12]`

---

## 5. Cruzamento com o sistema atual

### 5.1 O que já está pronto e atende

| Item da reunião | Situação |
|---|---|
| Pedido com kit + produtos avulsos no mesmo pedido `[36:07]` | Pronto — `order_items` aceita produto **ou** kit por linha |
| Assinatura única de kit (mesma composição = mesmo código) `[36:00]` | Pronto — `kits.signature` com índice único e reaproveitamento na gravação |
| CMV recalculado a partir da fórmula, não digitado `[01:07:27]` | Pronto — motor em `lib/calculations/`, cascata insumo → produto → kit |
| Snapshot imutável no fechamento | Pronto — evita que mudança de insumo altere o passado |
| Faixas de margem com cor, configuráveis | Pronto — falta só confirmar o percentual e o modo "só cor" |
| Filtros de histórico por período, cliente, produto/kit | Pronto na base; falta o filtro por insumo |

### 5.2 O que precisa mudar

| # | Mudança | Onde bate | Gravidade |
|---|---|---|---|
| R1 | Envelope e caixa de esterilização como custo **do kit** | `Calculations.md` §4, `lib/calculations/kits.ts`, tabela `kits` | **Alta — cálculo** |
| R2 | CMV com e sem mão de obra (costureira) | `Calculations.md` §3, `lib/calculations/cmv.ts`, marcação no insumo | **Alta — cálculo** |
| R3 | Código de produto numérico compatível com o Simples | Migração `20260715060200`, formato atual `PC-0001` **não serve** | **Alta — conflito** |
| ~~R4~~ | ~~Faixa "boa" de margem: 40% x 52%~~ | Resolvido — já é editável na tela (ver 10.1) | — |
| R5 | Kit criado dentro do simulador; tela de Kits vira consulta | `SimuladorPage`, `KitFormPage` | Média — fluxo |
| R6 | Aviso de kit já existente durante a digitação | `SimuladorPage` + `salvarKit` | Média |
| R7 | Nome do kit oculto, código em destaque | `KitsPage`, `SimuladorPage` | Baixa |
| ~~R8~~ | ~~Rever o módulo de Alocação de Despesas~~ | Decidido — **sai** (ver Seção 11) | — |

### 5.3 O que é novo (não existe hoje)

| # | Novo | Observação |
|---|---|---|
| N1 | Categoria/segmento no cadastro de cliente | `customers` hoje só tem nome, UF, observação e status |
| N2 | Código estruturado de cliente (tipo + área) | Depende de N1 |
| N3 | Ciclo orçamento → pedido com versões | `order_status` hoje só tem `simulation` e `closed` |
| N4 | Status "perdido/declinado" + motivo da perda | Base para a análise de cotações não convertidas |
| N5 | Fluxo de aprovação (pendente → aprovado/recusado) | Com trilha de quem aprovou |
| N6 | Modo "só cor" para o perfil Comercial | Esconder percentual e valores de CMV |
| N7 | Ficha impressa do pedido com composição explodida | Substitui o papel preenchido à mão |
| N8 | Flag padrão x exclusivo no kit + descrição livre | Padrão = publicado no site |
| N9 | Importação de vendas por código vindas do Simples | Alimenta o CMV e o DRE do mês |
| N10 | Relatório de consumo por insumo/gramatura/tecido | "Quanto vendemos de laminado / SMS / TNT azul 30g" |

### 5.4 Adiado explicitamente na própria reunião

- Consumo de bobina e de caixa por período `[46:44]` — "primeiro esse passo, depois o outro".
- Homem-hora no CMV `[46:59]`.
- Integração direta com o faturamento (hoje via relatório) `[45:23]`.
- CRM — citado como lugar natural de parte disso `[33:33]`, mas a análise de preço e custo ficou aqui.

---

## 6. Ordem de trabalho proposta

Uma sprint por vez, como manda a regra do projeto. A ordem privilegia primeiro o que corrige número, depois o que muda fluxo.

**Sprint A — Correções de CMV (R1, R2)**
As duas únicas mudanças que alteram o valor calculado. Exigem atualizar o `Calculations.md`, criar golden tests novos e recalcular a base. Enquanto não forem feitas, o CMV do kit continua aproximado, que é justamente o que a empresa apontou como errado hoje.

**Sprint B — Ciclo comercial (N3, N4, R5, R6, R7)**
Orçamento com versões, motivo de perda, kit criado dentro do simulador. É o coração do que foi discutido e o que mais muda o dia a dia.

**Sprint C — Aprovação e visibilidade (N5, N6, N7, R4)**
Fluxo de aprovação, margem por cor para o comercial, ficha impressa do pedido. Resolve o "200 papéis por dia sem controle".

**Sprint D — Clientes (N1, N2)**
Categoria e código estruturado. Depende de a Intertech definir a lista de categorias. Inclui plano para os 13 mil cadastros existentes.

**Sprint E — Códigos de produto (R3)**
**Bloqueada** até sabermos o limite real do Simples. Envolve recodificar o catálogo inteiro — é a mudança de maior risco do pacote.

**Sprint F — DRE e consumo (N9, N10)**
Importação das vendas por código e relatórios de consumo por insumo.

**Fora da fila até decisão:** R8 (Alocação de Despesas).

> **Superado em 29/07/2026** — a fila válida é a da Seção 12, que já incorpora as respostas do cliente.

---

## 7. O que precisamos da Intertech para destravar

> Respostas recebidas em 29/07/2026 estão na Seção 10. Segue o estado de cada uma.

1. ⏳ **Qual o limite real de código de produto no Simples?** Seis dígitos numéricos, ou aceita alfanumérico? Sem isso a Sprint E não começa, e ela impacta todo o catálogo. — *"Vamos verificar"*
2. ✅ **A faixa verde de margem é 40% ou 52%?** — *Deixar editável.* Já é (ver 10.1).
3. ⏳ **Lista de categorias de cliente** e de áreas (oftalmológico, ginecológico...).
4. ✅ **O módulo de Alocação de Despesas continua ou sai?** — *Sai* (ver Seção 11).
5. ✅ **Quem aprova o pedido?** — *Configurável por perfil* (ver 10.2).
6. ⏳ **Envelope e caixa de esterilização:** são insumos já cadastrados? Qual a regra de quantas caixas por kit? — não bloqueia a Sprint A.
7. ⏳ **Formato do relatório de vendas do Simples** (colunas e forma de exportar).
8. ⏳ **Lista de kits padrão publicados no site.**

---

## 8. Riscos identificados

| Risco | Por quê | Mitigação sugerida |
|---|---|---|
| Recodificação do catálogo | Trocar o código de todos os produtos quebra referência com histórico e com o Simples | Já existe `catalog_code_history` e `legacy_code`; usar como ponte |
| Explosão de códigos de kit | Cliente que pede 15 variações | Já resolvido pela decisão 3.6 — código só no fechamento |
| Comercial "jogar" com a cor | Descontar até chegar rente ao verde | Reconhecido em reunião; a cor sem número já reduz, e a aprovação fecha |
| ~~Alocação de Despesas construída e possivelmente descartada~~ | Decidido: sai | Desativar sem apagar cálculo, testes e snapshots (11.4) |
| 13 mil clientes sem categoria | Trabalho manual grande | Categorizar por lote, priorizando quem tem pedido recente |

---

## 9. Próximo passo

Este documento é para leitura e aprovação. Assim que a ordem das sprints for validada e as perguntas da Seção 7 forem respondidas — ao menos as de 1 a 4 — começamos pela **Sprint A**, que é a que corrige o CMV.

---

## 10. Decisões recebidas em 29/07/2026

| # | Pergunta | Resposta | Efeito |
|---|---|---|---|
| 1 | Limite do código de produto no Simples | **Vamos verificar** | Sprint E continua bloqueada |
| 2 | Faixa verde: 40% ou 52%? | **Deixar editável** | Já atendido — ver 10.1 |
| 3 | Lista de categorias de cliente | Ainda não | Sprint D continua bloqueada |
| 4 | Alocação de Despesas continua ou sai? | **Sai** | Ver Seção 11 |
| 5 | Quem aprova o pedido | **Configurável por perfil** | Ver 10.2 |
| 6 a 8 | Envelope/caixa, relatório do Simples, kits padrão | Ainda não | Ver 10.3 |

### 10.1 Faixa de margem editável — já está pronto

Não há nada a construir. As faixas já são editáveis pelo Administrador em **Configurações → Faixas de margem** (`margin_rules`), com faixa, cor e ordem.

O que existe hoje é apenas o **valor inicial da carga**: Boa ≥ 40%, Atenção 25–40%, Crítica 10–25%, Negativa < 10%. Se a régua real da Intertech for 52%, basta alterar na tela — não é mudança de código.

Consequência: **o item R4 sai do backlog**. Vira uma linha de conferência com o cliente na hora do treinamento.

### 10.2 Aprovação configurável por perfil

Refina o item N5. O sistema não vai amarrar a aprovação a uma pessoa (Cris ou Michelle), e sim a **perfis**, configuráveis pelo Administrador.

Hoje já existem quatro perfis (`admin`, `financeiro`, `comercial`, `producao`) e o acesso às telas é filtrado por perfil em `app/lib/roles.ts`, com RLS no banco como garantia real. O que falta construir:

- uma configuração de **quais perfis podem aprovar pedido**, editável em Configurações;
- o estado de aprovação no pedido (pendente → aprovado / recusado) com registro de quem aprovou e quando;
- a regra de que quem monta não é necessariamente quem aprova.

Fica em aberto, para quando a Intertech definir o operacional `[18:12]`: se a aprovação será exigida em **todo** pedido ou só abaixo de uma margem — e, nesse caso, qual o limite. Recomendo construir com o limite configurável e começar exigindo aprovação em tudo, porque é o que mais se aproxima do papel que já vai para a mesa da Cris hoje.

### 10.3 Ainda pendentes

As perguntas 1, 3, 6, 7 e 8 da Seção 7 seguem sem resposta. Impacto na fila:

- **Sprint E (códigos de produto)** — bloqueada pela pergunta 1. É a de maior risco e não deve ser iniciada por palpite.
- **Sprint D (clientes)** — bloqueada pela pergunta 3.
- **Sprint A (CMV)** — a pergunta 6 (envelope e caixa) afeta o *preenchimento*, não a *estrutura*. Dá para construir o cálculo e a tela agora e cadastrar os valores reais depois. **Não bloqueia.**
- **Sprint F (DRE e consumo)** — depende da pergunta 7, mas é a última da fila.

---

## 11. Retirada da Alocação de Despesas — o que muda

O cliente decidiu que o módulo sai. Ele foi construído na Sprint 8, então vale ser preciso sobre o que "sair" significa em cada camada — algumas partes podem ser removidas sem consequência, outras não devem ser apagadas.

### 11.1 Por que a decisão faz sentido

Além do argumento da reunião (a empresa passou a raciocinar por margem de contribuição `[48:16]`), o próprio `Calculations.md` §5 já registrava dois problemas do módulo:

- o **fator de complexidade** é *"um número subjetivo sem documentação"*;
- no Campo Catarata, a despesa unitária rateada (R$ 3,12) fica **maior que o próprio CMV** (R$ 2,94), o que torna o custo total muito sensível a um número que ninguém sabe explicar.

Havia ainda perguntas em aberto que nunca foram respondidas: se os R$ 450.000 são mensais ou anuais, e quem revisa os fatores. Retirar o módulo **elimina essas três dúvidas de uma vez**.

### 11.2 O que sai (sem consequência)

| Camada | O que sai |
|---|---|
| Telas | `AlocacaoPage`, `AlocacaoPeriodoPage`, rota `/alocacao`, item de menu |
| Cascata do pedido | A última linha, `(−) Despesa alocada = Resultado após rateio` (PRD §5.4) |
| DRE | A linha informativa **Variação de absorção** (Σ rateios − despesa real) |
| Docs | PRD §5.2, §6.4 e Sprint 8 do roadmap; `Calculations.md` §5 marcado como descontinuado |

### 11.3 O que **não** muda — e é a melhor notícia

**Nenhum número que a Intertech usa para decidir muda.**

A margem de contribuição é calculada **antes** do rateio na cascata. A despesa alocada só entrava na linha seguinte, que era explicitamente informativa. Ou seja:

- a margem de contribuição de todo pedido continua idêntica;
- as faixas de cor (boa/atenção/crítica) continuam idênticas;
- o **DRE continua fechando**, porque a despesa que entra nele é a **despesa fixa REAL do mês**, digitada pelo Financeiro — ela nunca veio do rateio. O DRE perde só a linha de absorção;
- os golden tests T6 e T7 (pedido completo) continuam válidos: o valor testado é a margem de contribuição de 39,82%, que não depende do rateio.

### 11.4 O que **não** deve ser apagado

Três pontos onde apagar causa dano. Recomendo desativar, não deletar:

**a) Os golden tests T4 e T5.** Eles testam exatamente `despesa_unitaria`. A regra do projeto (`CLAUDE.md`) diz que os golden tests da Seção 11 *"são obrigatórios e nunca podem ser removidos"*. Removê-los contraria uma regra que existe justamente para impedir que cálculo suma sem rastro. Como são funções puras que não aparecem em tela nenhuma, mantê-los **não custa nada** e preserva a reversibilidade caso a decisão mude.

**b) `lib/calculations/allocation.ts`.** Mesmo raciocínio: módulo puro, isolado, sem dependência de tela ou banco. Deixa de ser chamado, mas continua testado.

**c) `order_items.expense_unit_snapshot` nos pedidos já fechados.** Isso é **dado histórico congelado** de vendas que já aconteceram. Apagar reescreveria o passado, que é exatamente o que o sistema foi feito para impedir (Decisão D7). O campo para de ser preenchido em pedidos novos; os antigos ficam como estão.

Sobre as tabelas `expense_allocation_periods` e `expense_allocations`: sugiro **manter no banco sem tela**, pelo mesmo motivo do item (c) — elas sustentam a leitura dos pedidos antigos. Se a Intertech quiser mesmo apagar, isso é uma migração destrutiva e separada, e eu peço confirmação explícita antes.

### 11.5 Esforço

Pequeno: é remoção de tela e de uma linha de cascata, não reescrita de cálculo. Estimo **um único commit dentro da Sprint A**, feito antes das correções de CMV — porque simplifica a cascata que as sprints B e C vão mexer depois.

---

## 12. Fila de trabalho atualizada

| Ordem | Sprint | Situação |
|---|---|---|
| 1 | **A — Correções de CMV** (R1 envelope/caixa, R2 costureira) + retirada da Alocação (Seção 11) | **Liberada para começar** |
| 2 | B — Ciclo comercial (N3, N4, R5, R6, R7) | Liberada |
| 3 | C — Aprovação e visibilidade (N5 por perfil, N6 cor, N7 ficha impressa) | Liberada |
| 4 | D — Clientes (N1, N2) | Bloqueada — falta a lista de categorias |
| 5 | E — Códigos de produto (R3) | Bloqueada — falta o limite do Simples |
| 6 | F — DRE e consumo (N9, N10) | Depende do formato do relatório do Simples |

Saíram do backlog: **R4** (virou conferência de tela, ver 10.1) e **R8** (decidido, ver Seção 11).

Com as respostas recebidas, as sprints A, B e C — que são o núcleo do que a reunião pediu — estão desbloqueadas.

---

## 13. O que foi entregue (29/07/2026)

Com autorização para seguir sem aprovação sprint a sprint, as seis foram implementadas. Resumo do que está no sistema:

| Sprint | Estado | Observação |
|---|---|---|
| A — Correções de CMV | ✅ Completa | Embalagem/esterilização por kit (T11) e CMV com/sem mão de obra (T12). Alocação removida do produto, preservando T4/T5, o módulo puro e os snapshots antigos. |
| B — Ciclo comercial | ✅ Completa | Número de orçamento, versões, perda com motivo, kit montado dentro do pedido com aviso de duplicidade. |
| C — Aprovação e visibilidade | ✅ Completa | Aprovação por perfil, margem só-cor para o Comercial, ficha impressa do pedido. |
| D — Clientes | ✅ Completa com ressalva | Estrutura pronta e tela de categorização criada. **As categorias em uso são partida sugerida, não a lista da Intertech** (pergunta 3 segue aberta). |
| E — Código de ERP | ⚠️ Parcial por decisão | Capacidade pronta e **desligada**. O catálogo **não** foi recodificado, porque o limite do ERP segue sem confirmação (pergunta 1). |
| F — Vendas e consumo | ✅ Completa com ressalva | Importação e explosão de consumo prontas. O **formato do relatório** ainda não foi confirmado (pergunta 7), então o leitor foi feito tolerante a variações. |

### 13.1 Onde parei de propósito

Três pontos onde avançar exigiria adivinhar uma decisão que é da Intertech:

1. **Não recodifiquei o catálogo de produtos.** Trocar o código de 325 produtos com base num "seis dígitos" não confirmado seria a mudança mais difícil de desfazer do pacote. O `erp_code` entra em paralelo, o código semântico continua sendo a identidade interna, e quando o limite for confirmado basta ajustar os parâmetros na tela e gerar.
2. **Não inventei a lista de categorias de cliente.** Elas são tabela editável, com uma partida montada a partir dos segmentos citados na reunião (hospital, clínica, veterinário, oftalmologia). Trocar a lista não exige migração.
3. **Não apaguei nada da Alocação de Despesas além das telas.** Os golden tests T4/T5, o módulo puro e os snapshots de pedidos fechados continuam — apagar contrariaria a regra do projeto e reescreveria o passado. Se a Intertech quiser remover as tabelas do banco, é uma migração destrutiva separada e peço confirmação antes.

### 13.2 Parâmetros que nasceram desligados

Por orientação da própria reunião, e não por omissão:

- **Trava de margem na aprovação:** nula. *"Eu deixaria nulo para o começo, só para ver o que elas estão fazendo."*
- **Geração de código de ERP:** desligada, até o formato ser confirmado.
- **Faixa verde de margem:** segue nos 40% da carga inicial. Se a régua real for 52%, é alterar em Configurações — não é mudança de código.
