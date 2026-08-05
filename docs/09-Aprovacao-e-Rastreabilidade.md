# 09 — Aprovação de pedido e rastreabilidade de kit

> **Versão:** 1.0 — 30/07/2026
> Quatro pedidos do cliente, olhando o pedido de exemplo (Hospital de Manaus) e a tela de Kits.

## 1. Um defeito grave encontrado no caminho: ninguém conseguia decidir nada

Antes de qualquer coisa pedida, testar o item 2 (autoaprovação) revelou um defeito **anterior a esta sprint** e mais sério que ele: **aprovar, recusar, marcar uma cotação como perdida ou reabri-la falhava para qualquer pessoa**, sempre, com um erro técnico de banco de dados.

A causa: essas três operações gravam uma linha de auditoria (`audit_logs`), mas a tabela só tinha política de **leitura**. A intenção original (comentário da migração 0005) sempre foi "escrita só por função que roda com o poder do dono do banco" — só que três funções nasceram do jeito errado (rodando com o poder de quem chama), e a gravação de auditoria era barrada pela segurança do banco. Como o erro sobe sem tratamento, a operação inteira desfazia — inclusive a decisão de aprovar, que nunca chegava a valer.

Confirmado no banco antes de corrigir, e confirmado depois que voltou a funcionar. A correção deu à auditoria uma política de escrita estreita: cada pessoa grava linha da própria ação, no próprio tenant — não abre brecha nenhuma, porque ninguém grava em nome de outra pessoa nem em outro tenant.

## 2. Ninguém aprova a própria cotação

*"Do jeito que está parece que o próprio vendedor que gera o pedido pode aprová-lo."*

Verdade — e não só o vendedor: **qualquer pessoa com perfil aprovador que também tivesse enviado aquela cotação específica podia aprová-la sozinha**. A checagem existente só olhava o perfil de quem decide, nunca se essa pessoa era quem tinha enviado.

Agora o banco recusa: quem enviou não pode decidir, ponto — a mensagem explica isso na hora, e a tela nem mostra os botões Aprovar/Recusar para essa pessoa (mostra um aviso no lugar). É a mesma regra nos dois lugares: o app é cortesia, o banco é a garantia real.

**Isso não é um capricho.** É a única forma de a aprovação significar alguma coisa: sem uma segunda pessoa decidindo, "enviar para aprovação" e "aprovar" viram o mesmo clique.

## 3. O aprovador agora vê os números de verdade

Cavando o item 2, apareceu outro problema: o card de aprovação sempre disse *"confira preço de venda, CMV e margem de contribuição acima antes de decidir"* — mas CMV e margem só são **gravados no fechamento** (Decisão D7), e a aprovação acontece **antes** do fechamento. Ou seja: quem aprovava via só o preço. Exatamente o que "o papel na pasta" já mostrava.

Corrigido sem mudar o banco: a tela agora calcula a cascata (receita, impostos, CMV, margem) com os **custos vigentes**, na hora, só para exibir — nada é gravado, e os valores podem mudar até o fechamento de verdade. Aparece em qualquer pedido ainda em cotação, não só nos pendentes de aprovação, porque é a mesma pergunta ("quanto está essa cotação hoje?") em qualquer estágio.

## 4. Tela de Aprovações

Pedido do cliente: *"criar uma tela de APROVAÇÕES... facilitará a visualização e deixará o processo mais ágil."*

Existe agora em **`/aprovacoes`**, listando quem está esperando decisão, com um selo de contagem no menu (atualiza sozinho a cada minuto).

**Uma escolha que vale explicar**: o pedido original foi "visível apenas para admins". Implementei diferente, e por um motivo específico — quem aprova de verdade **já é configurável por perfil** em Configurações (hoje Administrador e Financeiro, mas pode incluir outros). Se a tela fosse fixa para Administrador, um Financeiro marcado como aprovador ficaria sem acesso à própria fila de trabalho. Por isso a tela segue a **mesma regra** que já libera o botão Aprovar/Recusar dentro do pedido — uma permissão só, não duas que podem se desalinhar. Se a intenção real era outra (só Administrador, mesmo que Financeiro também aprove), é uma linha para trocar.

## 5. Rastreabilidade do kit

*"Rastrear a origem do kit é muito importante. Tudo deve ser rastreável."*

`kits.created_by` e `created_at` já existiam no banco, mas nenhuma tela mostrava, e faltava a informação mais importante: **de qual pedido o kit nasceu**. Agora:

- `kits.source_order_id` — nulo quando o kit foi cadastrado manualmente na tela de Kits; preenchido com o pedido cujo fechamento materializou o kit (Decisão da reunião 16/07/2026: o código oficial só nasce quando o pedido é ganho).
- Tela **Kits**: cada linha mostra um selo — "de um pedido" ou "cadastro manual".
- Abrindo um kit: card com quem criou, quando, e (se veio de pedido) link direto para o orçamento de origem.

O nome de quem criou exigiu uma função própria no banco (`get_kit_origin`): o perfil de outra pessoa só é legível por um Administrador (regra da sprint de acesso, 30/07/2026), então sem essa função Financeiro, Comercial e Produção abririam um kit e não veriam quem criou — a rastreabilidade ficaria pela metade para 3 dos 4 perfis. A função devolve só essa pergunta pontual, para um kit específico que a pessoa já pode ver.

## 6. Pedidos de demonstração com várias versões

A pedido do cliente, para ver a funcionar na prática — dois pedidos, cada um com 3 versões, para abrir em `/pedidos` e ver a seção "Versões da cotação":

| Orçamento | Cliente | O que muda entre as versões |
|---|---|---|
| ORC-2026-0036 | [DEMO] Clínica Nova Visão | v1: 1 item. v2: quantidade sobe e entra um segundo item (cliente pediu mais). v3: desconto negociado no primeiro item. |
| ORC-2026-0037 | [DEMO] Hospital Belo Horizonte | v1: 1 item. v2: entra um segundo item. v3: quantidade do primeiro item sobe. |

Os números de receita e margem de cada versão são ilustrativos (calculados à mão para o exemplo, não pelo motor) — servem para ver a tela funcionando, não como cálculo de referência. Continuam em cotação (não fechados), então dá para editar, enviar para aprovação, ou excluir livremente.

## 7. Segunda rodada (mesmo dia)

### 7.1 Selo de margem na fila de Aprovações

Pedido do cliente, olhando a própria tela de Aprovações: *"é legal ter um alerta visual, baseado nas margens, se o pedido está com margem boa, média ou ruim... para diminuir erro de aprovação de pedido com margem abaixo do esperado."*

Cada linha da fila agora mostra um selo colorido — a mesma régua de cor de Configurações e do simulador (Boa/Atenção/Crítica/Negativa), calculada com os custos vigentes (ninguém aprova sem ver a saúde da margem, mesmo sem abrir o pedido). Financeiro e Administrador veem o percentual junto; se um perfil Comercial um dia for marcado como aprovador, vê só a cor — mesma regra de `hide_margin_numbers_from_sales` que já vale em todo o resto do sistema.

Calcular margem de vários pedidos ao mesmo tempo tem um cuidado técnico: carregar produtos, kits e alíquotas é uma consulta pesada, e repeti-la pedido por pedido multiplicaria o custo por N. `avaliarMargensPendentes` (`app/lib/db/aprovacao.ts`) carrega esse contexto **uma vez** e reaproveita para toda a fila.

### 7.2 Explicação de erro conhecido na tela de Integridade

Pedido do cliente, depois de eu explicar por que um erro específico ("Failed to fetch dynamically imported module") aparecia na lista mas não era uma pendência real: *"seria interessante ter essa pequena explicação lá na tela para os usuários."*

Agora está lá: um parágrafo explica que, depois de cada publicação, uma aba antiga pode tentar buscar uma versão de tela que não existe mais — e que o próprio sistema já resolve isso sozinho, recarregando a página sem a pessoa notar. Cada linha da lista que corresponde a esse padrão específico ganha o selo **"resolvido sozinho"** e aparece em cinza, não em vermelho — o vermelho fica só para o que precisa mesmo de atenção.

### 7.3 DRE mensal saiu do menu lateral

Decisão do cliente em 30/07/2026: **DRE mensal não aparece mais no menu**. A rota `/dre` continua existindo e protegida por perfil (Administrador e Financeiro) — só o link sumiu da navegação. Mecanismo novo e reutilizável: `ItemMenu.oculto` em `app/lib/roles.ts` — um item pode ficar fora do menu sem deixar de estar liberado para quem já tinha acesso, útil se outra tela precisar do mesmo tratamento no futuro.

### 7.4 Editar um pedido, e o aviso da autoaprovação em linguagem simples (05/08/2026)

Dois pedidos do cliente testando o sistema:

1. *"Essa mensagem [explicando por que não pode aprovar a própria cotação] não deve aparecer. Pode ter um aviso tipo 'pedido enviado para aprovação', já que a vendedora também precisará imprimir o pedido e levá-lo até a admin no primeiro momento."*
2. *"Verifique se realmente é possível editar um pedido duplicado. Não encontrei o botão de editar."*

**O segundo pedido revelou um buraco maior do que parecia.** Não era só o botão de editar que faltava no pedido duplicado — **não existia botão de editar em lugar nenhum do sistema**, para nenhum pedido. `Duplicar como nova simulação` criava a linha no banco e mandava para a tela de detalhe, mas o Simulador nunca aprendeu a reabrir um pedido já existente: sempre partia em branco. Uma vez que se saía do Simulador, o pedido ficava congelado como estava, mesmo em rascunho.

**Corrigido com uma rota nova: `/simulador/:id`.** A mesma tela do Simulador passa a aceitar um pedido existente e pré-carrega tudo — cliente, itens (inclusive kit montado na hora, ainda sem código de catálogo), frete, comissão, DIFAL, transportadora, condições. Salvar empilha mais uma versão, como sempre (Seção 6). O botão **Editar** aparece no detalhe do pedido só quando faz sentido usá-lo: rascunho ou recusado.

**Por que não em qualquer estado — o achado que evitou um problema maior.** Antes de liberar o botão, testei o que `save_quote_revision` faria com um pedido **aguardando aprovação** ou **já aprovado**. A função só checava se o pedido estava em aberto (`simulation`), nunca o estado da aprovação — ia aceitar a edição calada. Isso teria aberto exatamente a brecha que a Seção 2 desta página existe para fechar: aprovar um número e, por baixo, trocá-lo depois. `save_quote_revision` agora recusa editar pedido `pendente` ou `aprovado`, com mensagem explicando o porquê. Editar um pedido **recusado** funciona e devolve ele para `rascunho` automaticamente, limpando quem decidiu e quando — a recusa valia para os números antigos, não para os novos, então tem que passar pela aprovação de novo. Testado contra Postgres real nos quatro estados antes de publicar.

**O primeiro pedido simplificou o aviso, sem tocar na regra.** A trava de "quem enviou não aprova a própria cotação" (Seção 2) continua idêntica — o cliente foi claro que a regra está certa, só o texto que incomodava. Antes, o aviso só aparecia para quem **também era aprovador** e explicava por que o botão de aprovar tinha sumido — o que deixava a vendedora comum (que normalmente não é aprovadora) sem indicação nenhuma de que o pedido dela estava esperando alguém. Agora aparece para **quem enviou**, aprovador ou não, com status neutro e o lembrete prático do primeiro momento da operação: *"Pedido enviado para aprovação — imprima a ficha e leve até quem aprova."*, com atalho direto para a ficha.

## 8. Onde cada coisa mora

| Peça | Arquivo |
|---|---|
| Migração (autoaprovação, origem do kit, correção da auditoria) | `supabase/migrations/20260730000100_confiabilidade_aprovacao_e_origem_kit.sql` |
| Cascata ao vivo (pré-visualização, sem gravar) | `app/lib/db/fechamento.ts` (`calcularCascataVigente`) |
| Bloqueio de autoaprovação na tela | `app/pages/PedidoDetalhePage.tsx` |
| Fila de aprovação | `app/pages/AprovacoesPage.tsx`, `app/lib/db/aprovacao.ts` |
| Selo de contagem no menu | `app/pages/ShellLayout.tsx` |
| Origem do kit (dados) | `app/lib/db/kits.ts` (`obterOrigemKit`) |
| Origem do kit (telas) | `app/pages/KitsPage.tsx`, `app/pages/KitFormPage.tsx` |
| Selo de margem na fila | `app/lib/db/aprovacao.ts` (`avaliarMargensPendentes`), `app/pages/AprovacoesPage.tsx` |
| Erro conhecido explicado | `app/pages/IntegridadePage.tsx` |
| Item de menu oculto (DRE) | `app/lib/roles.ts` (`ItemMenu.oculto`, `menuDoPerfil`) |
| Editar pedido (trava de rascunho/pendente/aprovado/recusado) | `supabase/migrations/20260805200000_editar_pedido_em_aberto.sql` |
| Editar pedido (carregar no Simulador) | `app/pages/SimuladorPage.tsx`, `app/lib/db/fechamento.ts` |
| Status simplificado para quem enviou | `app/pages/PedidoDetalhePage.tsx` |
