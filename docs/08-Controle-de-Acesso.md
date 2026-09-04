# 08 — Controle de acesso: usuários, perfis e área restrita

> **Versão:** 1.0 — 30/07/2026
> Decisão do cliente em 30/07/2026: *"A tela de usuários não faz sentido. Nada deve ser feito pelo banco de dados."*

## 1. O que estava errado

A tela de Usuários pedia que o Administrador convidasse a pessoa pelo painel do Supabase e só depois voltasse ao sistema para escolher o perfil. Era um cadastro pela metade: metade no sistema, metade num painel técnico que não é lugar de trabalho de ninguém na Intertech.

Além disso, telas que mexem em regra de cálculo e em acesso — Configurações, Cadastros, Usuários, Integridade — estavam no mesmo bloco de menu do trabalho do dia a dia, e três delas eram visíveis também ao Financeiro.

## 2. Como funciona agora

### 2.1 Cadastro de usuário, do começo ao fim, na tela

Na tela **Usuários**, o Administrador clica em *Novo usuário* e informa nome, e-mail, perfil e uma senha provisória (a tela já sugere uma senha sorteada). O acesso nasce pronto e liberado.

Na mesma tela o Administrador também: muda nome e perfil, desativa e reativa acesso, redefine senha de quem esqueceu, e exclui acesso.

O painel do Supabase deixou de ser necessário para qualquer uma dessas operações.

### 2.1.1 Senha provisória tem de ser trocada

A senha que o Administrador entrega passou por conversa, papel ou mensagem — não é segredo de ninguém. Então ela vale uma vez: no primeiro acesso, o sistema mostra **só** a tela de definir senha, e nenhuma outra, até a pessoa escolher uma senha que só ela conheça. O mesmo vale depois de uma redefinição pelo Administrador.

Enquanto isso não acontece, a tela de Usuários mostra a marca *senha provisória pendente* ao lado da pessoa — o Administrador sabe quem ainda não entrou.

Uma honestidade sobre o alcance disso: é uma trava de bom uso, não uma fechadura. Quem soubesse mexer na API poderia desligar a marca sem trocar a senha — e não ganharia nada, porque o acesso seria o dele mesmo, que já tem. O que a trava garante é que ninguém **esqueça** de trocar.

### 2.2 Desativar ≠ excluir

Quem já fechou pedido, montou kit ou alterou preço **não pode** ser excluído: o histórico precisa continuar mostrando quem fez cada coisa. Para essas pessoas existe *desativar* — o login continua existindo, mas não enxerga dado nenhum. O sistema descobre isso sozinho e explica na hora, em vez de deixar o Administrador tentar e receber um erro técnico.

Exclusão de verdade fica disponível só para quem nunca registrou nada (um cadastro feito com o e-mail errado, por exemplo).

### 2.3 Duas travas que evitam o pior

- Ninguém remove o próprio acesso.
- A Intertech não pode ficar sem nenhum Administrador ativo: rebaixar ou remover o último é bloqueado, com a mensagem dizendo o que fazer antes.

### 2.4 Área restrita no menu

O menu tem dois blocos. **Operação** é o trabalho do dia a dia. **Administração** (com cadeado) reúne o que muda regra, parâmetro ou acesso, e existe **só** para o Administrador:

| Tela | Por que é restrita |
|---|---|
| Usuários | Controla quem entra no sistema |
| Cadastros | Listas que classificam cliente e motivo de perda, e prefixo de categoria |
| Configurações | Alíquotas, DIFAL, frete, comissão, faixas de margem — muda o resultado de **todo** pedido |
| Integridade dos dados | Expõe a saúde da base inteira |

Quem não é Administrador não vê nem o título do bloco.

O Financeiro **continua** com DRE, Vendas do ERP, Insumos, Produtos e Pedidos: são as telas de trabalho dele. O que ele perdeu foi a escrita nas listas de referência — ler continua liberado, porque Clientes e Pedidos mostram esses nomes.

Esconder no menu não é a proteção; é a cortesia. A proteção é no banco: as políticas de segurança das tabelas de parâmetro e de lista de referência agora só aceitam gravação de Administrador, e as funções de gravação recusam qualquer outro perfil.

### 2.5 Super Administrador (dono do sistema)

`vinicius@avgestaofinanceira.com.br` é o Super Administrador: a conta de quem construiu o sistema.

- Faz tudo o que um Administrador faz.
- **Não aparece** na lista de usuários dos Administradores da Intertech — nem na tela, nem consultando a API direto.
- **Não pode** ser alterado, desativado ou removido por nenhum Administrador.
- Nem a mensagem de erro revela que ele existe: para um Administrador da Intertech, tentar mexer nessa conta responde "Usuário não encontrado", igual a um endereço inexistente.

Ele **não** é um quinto perfil. É um Administrador com uma marca a mais (`profiles.is_super_admin`). O motivo é prático: a segurança do banco está escrita em dezenas de políticas que comparam o perfil com `admin`. Criar um perfil novo obrigaria a reescrever todas elas, e uma única esquecida deixaria o dono do sistema sem acesso a uma tabela — ou deixaria uma porta aberta.

A marca só é dada por migração, na instalação. Nenhuma tela promove ninguém a dono do sistema: é o tipo de poder que não deve ter botão.

### 2.6 Inativar kit no catálogo: Administrador e Financeiro (04/09/2026)

Pergunta da Patricia: *"eu consigo inativar um kit?"*. Pela tela, não dava — a coluna existia desde o primeiro dia e o sistema já a respeitava, mas faltava onde clicar. Enquanto faltou, quatro kits foram inativados por comando manual no banco, sem registro de quem fez. É a mesma coisa que a decisão de 30/07/2026 quis acabar: *"nada deve ser feito pelo banco de dados."*

O botão passa a existir na tela do kit, e a permissão é de **Administrador e Financeiro**. A escolha não é a mesma do RLS da tabela `kits`, que deixa o Comercial escrever — e continua certa para o que ele faz, que é montar kit dentro de um pedido. Tirar um item do catálogo é outra coisa: muda o que a equipe **inteira** consegue vender. Por isso a trava por perfil mora dentro de `set_kit_status`, e não na política da tabela.

Toda ativação e inativação grava em `audit_logs` com o `auth.uid()` de quem clicou — a função é `security invoker` justamente para isso: quem responde pela mudança é a pessoa, não o sistema.

Inativar não é excluir, pela mesma razão da §2.2: kit usado em pedido fechado não pode sumir do histórico. Excluir kit continua não existindo.

## 3. Por que criar usuário precisa de um serviço no servidor

Criar credencial, trocar a senha de outra pessoa e apagar acesso são operações que só a **chave de administração** do projeto pode fazer. Essa chave não pode ficar no navegador — o código de uma página é público, e qualquer visitante passaria a ter poder total sobre a base.

Então ela mora numa Edge Function (`supabase/functions/gestao-usuarios`), do lado do servidor. E ela não decide nada sozinha: antes de agir, repassa o pedido ao banco com o crachá de quem está pedindo e pergunta "esta pessoa pode?" (`assert_can_manage_user`). Quem responde é o banco, com a mesma regra usada em todos os outros caminhos. A chave só entra em cena depois do "pode".

## 4. Dois defeitos encontrados no caminho

### 4.1 Ninguém além do Administrador conseguiria usar o sistema

Ao testar cada perfil contra o banco real, apareceu um defeito grave e **anterior** a esta sprint: um usuário que não fosse Administrador não conseguia ler nada. Qualquer consulta simples — contar produtos, listar motivos de perda — derrubava a operação com `stack depth limit exceeded`.

A causa era um ciclo: a política de segurança de qualquer tabela pergunta "de que tenant você é?", isso lê a tabela de perfis, ler a tabela de perfis aciona a política de perfis, e a política de perfis fazia a mesma pergunta — de volta ao começo, até estourar a pilha.

Só não tinha aparecido porque, até agora, a única conta que chegou a entrar no sistema foi a de Administrador (as contas Financeiro, Comercial e Produção nunca tinham feito login).

A correção (migração `20260729001500`) é uma regra simples: a política da tabela de perfis não pode chamar nenhuma função que leia perfis obedecendo à segurança — só funções que leem "por dentro". A migração deixa uma verificação automática que falha se alguém desfizer isso.

### 4.2 Duas implementações do mesmo pedido no mesmo banco

Enquanto esta sprint era feita, **outra sessão de trabalho implementou o mesmo pedido no mesmo projeto do Supabase**, com o mesmo desenho e nomes diferentes (`is_superadmin` em vez de `is_super_admin`, `is_superadmin()` em vez de `current_user_is_super_admin()`), e sobrescreveu a função de gravação de perfil.

Duas marcas para a mesma coisa é um desastre esperando acontecer: bastaria uma tela gravar numa coluna e a política ler a outra para o dono do sistema aparecer na lista, ou ficar editável.

A migração `20260729001600` convergiu isso sem apagar trabalho de ninguém: `is_super_admin` passou a ser a única fonte da verdade (a marca que só existia na outra coluna foi copiada para ela), o nome antigo continuou respondendo como espelho automático, e a gravação de perfil voltou à versão mais restritiva.

**Decisão do cliente em 30/07/2026:** ficar só com esta implementação. A migração `20260729001700` remove os espelhos — a coluna `is_superadmin` e a função `is_superadmin()` não existem mais. Uma coisa, um nome.

## 5. Onde cada coisa mora

| Peça | Arquivo |
|---|---|
| Matriz de perfis, áreas do menu | `app/lib/roles.ts` |
| Testes da matriz de acesso | `tests/acesso.test.ts` |
| Regras de senha (mínimo, sorteio) | `app/lib/senha.ts` · testes em `tests/senha.test.ts` |
| Tela de Usuários | `app/pages/UsuariosPage.tsx` |
| Formulário de troca de senha | `app/auth/FormularioTrocarSenha.tsx` |
| Tela de troca obrigatória no 1º acesso | `app/auth/TrocaSenhaObrigatoria.tsx` |
| Chamadas de gestão de acesso | `app/lib/db/usuarios.ts` |
| Serviço com a chave de administração | `supabase/functions/gestao-usuarios/index.ts` |
| Marca, políticas e guardas | `supabase/migrations/20260729001400_super_admin_e_area_restrita.sql` |
| Correção do ciclo infinito | `supabase/migrations/20260729001500_profiles_sem_recursao.sql` |
| Convergência das duas implementações | `supabase/migrations/20260729001600_convergencia_super_admin.sql` |
| Fim dos espelhos + senha provisória | `supabase/migrations/20260729001700_remove_espelho_e_senha_provisoria.sql` |

A senha provisória do Super Administrador **não** está no repositório, de propósito — foi entregue fora dele, e o sistema pede a troca no primeiro acesso.

## 6. Uma configuração que só o cliente pode ligar

No painel do Supabase, em **Authentication → Policies → Password security**, existe a *proteção contra senhas vazadas*: o Supabase confere a senha escolhida contra a base pública do HaveIBeenPwned e recusa senhas que já apareceram em vazamentos. Está **desligada** neste projeto.

Vale ligar, agora que as pessoas escolhem as próprias senhas. É um clique, e não exige mudança de código — mas depende de acesso ao painel, então fica registrado aqui em vez de feito.
