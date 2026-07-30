# 12 — Usuários

Tela onde o Administrador cria, edita, desativa e exclui o acesso de cada pessoa ao sistema — do
início ao fim, sem precisar mexer em nenhum painel técnico. **Quem pode usar:** somente
Administrador (é uma das quatro telas do bloco "Administração" 🔒, invisível para os demais
perfis).

## Criando um novo acesso

Clique em **＋ Novo usuário**. Preencha:

1. **Nome** — o nome de quem vai usar o sistema.
2. **E-mail** — o e-mail que a pessoa vai usar para entrar.
3. **Perfil** — Administrador, Financeiro, Comercial ou Produção. Uma descrição de uma linha
   aparece embaixo do campo, lembrando o que aquele perfil enxerga.
4. **Senha provisória** — o sistema já sugere uma senha sorteada; clique em **Sortear** se quiser
   gerar outra, ou digite a sua própria (mínimo de 8 caracteres para o botão de criar ficar
   liberado).

Clique em **Criar acesso**. O acesso nasce pronto e liberado. **Copie a senha provisória e entregue
à pessoa** (por conversa, mensagem — não precisa ser um canal secreto). No primeiro login, o
sistema obriga a pessoa a definir a própria senha antes de ver qualquer outra tela (veja o
tutorial [01 — Login e Meu perfil](01-login-e-meu-perfil.md)).

## A lista "Quem tem acesso"

Cada pessoa aparece num cartão com:

- **Nome** (editável) e e-mail (fixo).
- **Perfil** (editável, exceto para o Super Administrador).
- Caixa **Ativo** (editável, exceto para o Super Administrador).
- Selos informativos: "Super Administrador" (se for o caso), "você" (se for a sua própria conta),
  o último acesso (ou "nunca acessou", ou "acesso desativado"), e "senha provisória pendente" se a
  pessoa ainda não trocou a senha que você entregou.

Depois de mudar nome, perfil ou o status Ativo, um botão **Salvar** fica habilitado no cartão.

## Redefinir a senha de alguém

Clique em **Redefinir senha** no cartão da pessoa. Um painel se abre com uma nova senha sorteada
(clique em **Sortear** para gerar outra, ou edite manualmente). Clique em **Confirmar** para
gravar. Entregue a nova senha provisória à pessoa — no próximo login, o sistema pede que ela
defina a própria senha de novo.

## Desativar × Excluir

- **Desativar** (desmarcando a caixa **Ativo** e clicando em Salvar): o login continua existindo,
  mas a pessoa não enxerga mais nenhum dado. Use isso para quem **já registrou algo** no sistema
  (fechou pedido, montou kit, alterou preço) — o histórico precisa continuar mostrando quem fez
  cada coisa.
- **Excluir acesso**: remove o acesso de verdade. Só funciona para quem **nunca registrou nada**
  (por exemplo, um cadastro feito com o e-mail errado). O botão pede confirmação em duas etapas
  ("Sim, excluir" / "Não"). Você não pode excluir o próprio acesso — o botão de excluir não aparece
  no seu próprio cartão.

## Duas travas de segurança

- Ninguém consegue remover o próprio acesso.
- A Intertech não pode ficar sem nenhum Administrador ativo: rebaixar de perfil ou desativar o
  último Administrador é bloqueado, com uma mensagem explicando o que fazer antes.

## Sobre o Super Administrador

A conta de dono do sistema (`vinicius@avgestaofinanceira.com.br`) não aparece na lista de usuários
comuns e não pode ser alterada, desativada ou excluída por nenhum Administrador da Intertech —
mesmo tentando pela API diretamente, a resposta é "usuário não encontrado".
