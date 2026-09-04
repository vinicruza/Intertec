# 20 — Sete migrações que estavam só no banco (04/09/2026)

> **Como foi encontrado:** ao conferir o banco depois de aplicar a migração do
> "inativar kit", comparei `supabase_migrations.schema_migrations` com os
> arquivos de `supabase/migrations/`. Sete versões estavam aplicadas em
> produção sem arquivo no repositório.

A regra do projeto é clara (`supabase/README.md`): *"o schema evolui só por
esses arquivos, nunca por alteração manual no banco"*. Quando ela é quebrada, o
repositório deixa de descrever o sistema — e foi exatamente o que aconteceu:
duas das sete mudaram comportamento que eu tinha acabado de documentar como
sendo o oposto, e duas causaram defeitos que ninguém tinha notado.

As sete foram transcritas de `schema_migrations` e agora têm arquivo, com o
cabeçalho dizendo que são registro do que já estava valendo.

## As sete

| Versão aplicada | Arquivo criado | O que faz |
|---|---|---|
| 20260902194431 | `..._retirada_marca_na_transportadora.sql` | `carriers.is_pickup` e a transportadora RETIRADA |
| 20260902194448 | `..._retirada_dispensa_valor_do_frete.sql` | cotação de frete aceita retirada sem valor |
| 20260902194513 | `..._retirada_mensagem_das_travas.sql` | as duas travas explicam a opção RETIRADA |
| 20260902194529 | `..._retirada_marcavel_no_cadastro.sql` | `save_carrier` ganha `p_is_pickup` |
| 20260904170252 | `..._kits_guardas_e_numero_do_pedido.sql` | kit dentro de kit recusado; **número do pedido passa a nascer no fechamento** |
| 20260904170419 | `..._kits_assinatura_unica_so_entre_ativos.sql` | **índice único da assinatura passa a valer só entre kits ativos** |
| 20260904170514 | `..._kits_duplicata_so_entre_ativos.sql` | `save_kit_with_items` procura duplicata só entre ativos |

## Os dois defeitos que estavam valendo em produção

### 1. Salvar transportadora estava quebrado desde 02/09

`save_carrier` de 4 argumentos foi **derrubada** e substituída por uma de 5, com
`p_is_pickup` **sem valor padrão**. O app (`app/lib/db/cadastros.ts`) chama a de
4 e o PostgREST resolve a função pelos argumentos **nomeados** — nenhuma
assinatura casava. Qualquer tentativa de salvar transportadora na tela de
Cadastros falhava, de 02/09 a 04/09.

Passou despercebido porque a tela de Cadastros é pouco usada e porque o erro
nunca chegou ao Monitoramento (não houve tentativa registrada).

**Correção:** `p_is_pickup boolean default null`, e `null` significa **manter** o
valor atual — assim a chamada de 4 argumentos volta a resolver e editar o nome
da RETIRADA não desmarca a retirada sem querer. Travado por teste.

### 2. A composição de kit ganho voltou a poder mudar

A reescrita de `save_kit_with_items` (17h05) deixou cair a trava criada em
06/08/2026: **kit nascido de pedido fechado não pode mudar de composição**,
porque o código dele já foi para o papel, para a nota e para a fábrica, e o
sistema inteiro é construído sobre "um código, uma composição".

Junto caíram o **código** e o **status** no aviso de duplicidade (a tela lê os
dois; "nome de kit não identifica nada") e os acentos das mensagens de erro, que
chegam à tela da vendedora.

Os testes de `tests/pedidos/regras-do-banco.test.ts` acusaram as três no
instante em que a migração órfã entrou no repositório — é literalmente o que
eles existem para pegar: *"uma migração nova reescrever uma função e deixar cair
uma cláusula"*.

**Correção:** `20260904214000_kit_ganho_volta_a_travar_composicao.sql` devolve as
três, mantendo o que a versão de 17h05 trouxe de bom (duplicata só entre ativos,
kit dentro de kit recusado). Conferido em produção: a tentativa de mudar a
composição do KC0024 foi recusada com a frase certa.

## Duas mudanças de comportamento que já estavam valendo

Nenhuma das duas é defeito — as duas são melhorias. O problema era não estarem
escritas em lugar nenhum.

**O número do pedido passou a nascer no fechamento.** Era a pendência levantada
em 31/08 e registrada em `Calculations.md` §16.3: o número diário carregava a
data em que a *cotação* nasceu, não a do dia em que o pedido foi gerado. O
gatilho `trg_orders_order_number` agora é `before update of status`. Cotação em
aberto passa a ter `order_number` nulo — o que torna a folha e a tela honestas
sem depender de regra de exibição. **Pedidos criados antes desta mudança seguem
com o número do dia da cotação**, e não devem ser renumerados (D7).

**Kit inativo não reserva mais a composição.** O índice único virou parcial
(`where status = 'active'`). Montar os mesmos itens com o kit fora cria um kit
**novo**, com código novo. Isso abriu um caminho que terminava em erro cru ao
reativar um kit cuja composição tinha sido ocupada no meio-tempo — barrado em
`20260904213000`, com frase que diz qual kit ficou com a composição.

## Uma funcionalidade que existe só no banco

As quatro migrações de 02/09 implementam **retirada pelo cliente**: a coluna, a
transportadora RETIRADA, a dispensa do valor de frete e a marcação no cadastro.
Não há **uma linha** sobre isso em `app/` ou `lib/` — nenhuma tela mostra ou
grava `is_pickup`.

Ou seja: o banco aceita e trata a retirada, mas ninguém consegue escolhê-la pela
tela. Falta o lado do app, e essa decisão é da Intertech.
