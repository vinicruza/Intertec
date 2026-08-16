# CMV da Ordem de Produção

Calcula o CMV dos pedidos da planilha **Ordem de Produção** usando o catálogo de
custos da planilha **Rentabilidade 2026**. Explicação completa das regras e das
pendências em [`docs/15-CMV-da-Ordem-de-Producao.md`](../../docs/15-CMV-da-Ordem-de-Producao.md).

Análise avulsa, fora do aplicativo: não toca em `lib/calculations/` nem em tela.

## Como rodar

```sh
pip install openpyxl

RENTABILIDADE_XLSX=/caminho/Rentabilidade_2026.xlsx \
ORDEM_PRODUCAO_XLSX=/caminho/Ordem_de_producao.xlsx \
python3 scripts/ordem-producao/gerar_planilha.py
```

Sai um `CMV_Ordem_de_Producao_jul_ago_2026.xlsx` no diretório atual, com as abas
Resumo, Itens, Pedidos, Kits — composição, Dicionário e Pendências.

Para o de-para que vai ao cliente conferir, com as mesmas variáveis de ambiente:

```sh
python3 scripts/ordem-producao/gerar_depara.py
```

Sai um `De-Para_Abreviacoes_Ordem_de_Producao.xlsx` com as abas Como preencher,
1. Dúvidas, 2. Kits sem composição, 3. De-para completo e 4. Regras de leitura —
as colunas de resposta ficam em branco, com lista Sim/Não onde faz sentido.

Para rodar outros meses, troque as abas em `gerar_planilha.py::coleta` (hoje
`jul26` e `ago26`).

## Os arquivos

| Arquivo | O que faz |
|---|---|
| `catalogo.py` | lê a aba Alocação Despesa e indexa por nome-base + estéril/gramatura/origem |
| `resolver.py` | o dicionário: traduz `catarata CH não` no produto do catálogo |
| `pedidos.py` | separa a Ordem de Produção em pedidos (blocos entre linhas vazias) |
| `gerar_planilha.py` | junta tudo e escreve a planilha de CMV |
| `gerar_depara.py` | escreve o de-para de conferência para o cliente |
