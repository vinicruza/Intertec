# 13 — Cadastros

Listas de referência que alimentam o resto do sistema: tipos de cliente, áreas de atuação, motivos
de perda e categorias de produto. **Quem pode usar:** somente Administrador (bloco
"Administração" 🔒). O Financeiro perdeu a permissão de editar essas listas — continua lendo os
nomes normalmente em Clientes e Pedidos, mas quem cria e altera é só o Administrador.

A tela tem quatro abas.

## Aba "Tipos de cliente"

Lista os tipos usados na categorização de clientes (ex.: Hospital, Clínica, Veterinário) — o
**primeiro campo** do código do cliente. Para cada item já cadastrado você pode alterar **Nome**,
**Ordem** de exibição e a caixa **Ativo**, e clicar em **Salvar** (o botão só habilita quando algo
muda). Um link **Excluir** remove o item — só funciona se nenhum cliente estiver usando aquele
tipo.

Para adicionar um novo, preencha no cartão no fim da lista: **Nome**, **Prefixo** (exatamente 2
dígitos, ex.: `60`) e **Ordem**, depois clique em **Adicionar**. O prefixo entra no código dos
clientes e **não pode ser alterado depois de criado** — mudar o prefixo faria o código de clientes
já categorizados passar a indicar o segmento errado.

## Aba "Áreas de atuação"

Funciona exatamente como "Tipos de cliente", mas para a área de atuação (ex.: Oftalmologia,
Ginecologia, Ortopedia) — o **segundo campo** do código do cliente.

## Aba "Motivos de perda"

Lista os motivos que aparecem quando alguém marca uma cotação como perdida (é o que responde
depois "por que a gente não vendeu?"). Cada item tem **Motivo**, **Ordem** e **Ativo**, editáveis
com o mesmo padrão Salvar/Excluir (excluir só funciona se nenhuma cotação tiver usado aquele
motivo). Para adicionar, digite o texto no campo **Novo motivo** e clique em **Adicionar**.

## Aba "Categorias de produto"

Lista as categorias de produto já existentes, cada uma com seu **prefixo** de código atual (não
editável, mostrado como referência) e um campo **Prefixo no ERP** — o começo numérico do código
que será enviado ao sistema de faturamento, quando essa funcionalidade for ligada em
[Configurações](14-configuracoes.md). Edite o campo e clique em **Salvar**.
