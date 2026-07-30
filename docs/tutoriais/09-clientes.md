# 09 — Clientes

Lista de clientes do sistema, com a categorização de cada um por tipo e área de atuação — é essa
categorização que permite depois analisar vendas por segmento (hospital, clínica, veterinário
etc.). **Quem pode usar:** Administrador, Financeiro e Comercial.

## Por que categorizar o cliente (não o kit)

O mesmo kit pode ser vendido para um hospital, uma clínica veterinária ou uma clínica de
oftalmologia — por isso o segmento fica registrado no **cliente**, não no kit. É a partir daqui
que o sistema sabe quantas cotações foram para cada tipo de cliente.

## A tela

Ao abrir **Clientes**, o filtro padrão mostra **"Só os sem categoria"** — porque a empresa começou
com muitos clientes sem tipo/área definidos. Um aviso amarelo no topo mostra quantos clientes
ainda faltam categorizar, e quantos deles já têm pedido registrado (comece por esses — é o que dá
resultado mais rápido nas análises).

Você pode trocar o filtro para **"Todos os clientes"** e buscar por código ou nome no campo de
busca.

## Como categorizar um cliente

A tabela mostra código (ou um selo "sem código", para clientes que ainda não têm), nome, UF, e
duas colunas editáveis diretamente na linha:

1. **Tipo** — escolha na lista suspensa (ex.: Hospital, Clínica, Veterinário — a lista vem de
   [Cadastros](13-cadastros.md)).
2. **Área** — escolha a área de atuação (ex.: Oftalmologia, Ginecologia, Ortopedia).

Assim que você escolhe um valor em qualquer uma das duas colunas, a mudança é salva
automaticamente — não existe um botão "Salvar" separado nesta tela.

## Sobre o código do cliente

O código do cliente é gerado automaticamente **quando tipo e área já estiverem preenchidos**, no
formato: prefixo do tipo (2 dígitos) + prefixo da área (2 dígitos) + número sequencial. Depois de
gerado, o código **não muda** mesmo que você recategorize o cliente depois — ele pode já ter ido
para um documento ou planilha, e mudar quebraria essa referência.
