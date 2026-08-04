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

## Nomenclatura NF

O nome que sai na **nota fiscal**, por família de produto. O nome do catálogo não muda — é ele
que sustenta CMV, ficha técnica e histórico; aqui você define o nome paralelo, o fiscal.

Cada linha é uma família: **Começa com** (o começo do nome no catálogo, ex.: `Campo de Mesa`),
**Nome na nota fiscal** (ex.: `Campo Cirúrgico com Reforço`) e **Ordem**. As famílias são
testadas de cima para baixo e a primeira que casar vence — por isso a genérica (`Campo`,
`Avental`) precisa ficar **embaixo** das específicas, senão ela engole todas. Produto que não
casa com nenhuma família sai na nota com o próprio nome do catálogo.

As caixinhas **Apagar do nome** tiram do nome fiscal o que não pode variar a nota: gramatura
(`GR30`, `30g`), `TNT`, `SMS` e origem (`China`). Elas são por família de propósito — nos campos
somem TNT e SMS, nos aventais some só o TNT porque o SMS continua aparecendo na nota.

As **trocas de palavra** substituem um termo por outro dentro do nome (`Tag` vira `Toalha`,
`Grande` vira `G`). Deixe o segundo campo vazio para simplesmente apagar a palavra.

**Salvar não muda o catálogo.** Salvar guarda a regra. No alto da aba fica a **prévia**: quantos
produtos mudariam de nome, quantos já estão certos e quantos estão protegidos por ajuste manual —
com um "Ver o que mudaria" que lista produto por produto o antes e o depois. Só o botão **Aplicar
ao catálogo** grava. Mexer numa linha reescreve dezenas de produtos de uma vez; a prévia existe
para você ver isso antes, e não depois de a nota sair.

Produtos com a descrição **ajustada à mão** (marcados assim na lista de Produtos) nunca são
tocados, por mais que a regra tenha opinião diferente.
