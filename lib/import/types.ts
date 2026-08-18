import { Decimal } from "../calculations/decimal";

// ============================================================
// Importação da planilha "Rentabilidade 2026" (PRD §6.10)
// ------------------------------------------------------------
// A lógica de extração e reconciliação é PURA: opera sobre a interface
// `Planilha` abaixo, não sobre um arquivo. Isso a torna testável com dados
// sintéticos (sem depender do arquivo real do cliente, que não vai para o Git).
// A leitura do .xlsx fica isolada em exceljs-loader.ts.
// ============================================================

// Uma planilha lida, abstraída: só o que a extração precisa perguntar.
export interface Planilha {
  abas(): string[];
  dimensoes(aba: string): { linhas: number; colunas: number };
  // 1-indexado (linha 1, coluna 1 = A1), como no Excel.
  valor(aba: string, linha: number, coluna: number): string | number | null;
}

export type InsumoImportado = {
  linha: number;
  nome: string;
  icms: Decimal;
  pisCofins: Decimal;
  precoComImposto: Decimal;
  precoSemImpostoPlanilha: Decimal | null; // coluna G da planilha (para conferência)
};

export type ConsumoInsumo = {
  linhaInsumo: number;
  quantidade: Decimal;
  // Custo do componente na própria planilha (2ª coluna do bloco). Nas fichas
  // com fórmula especial, é a ÚNICA verdade do custo — a carga usa este valor.
  custoPlanilha: Decimal | null;
};

export type ProdutoImportado = {
  coluna: number; // coluna do bloco no Input Preço
  nome: string;
  consumos: ConsumoInsumo[];
  // Soma da coluna "Custo" do bloco na própria planilha — é o CMV que a planilha
  // de fato calcula. Serve de verdade-base: algumas fichas usam fórmulas de custo
  // não-uniformes (custo já embutido na célula de quantidade, ex.: 3M Flexform),
  // que o modelo simples "preço × quantidade" não reproduz.
  cmvPlanilhaCusto: Decimal;
};

export type AlocacaoImportada = {
  nome: string;
  cmvPlanilha: Decimal | null; // coluna "Input" — o CMV que as abas de vendedor buscam
  producao: Decimal | null;
  fator: Decimal | null;
  participacao: Decimal | null;
  despesaAlocada: Decimal | null;
};

export type ParametroUF = {
  uf: string;
  valores: (Decimal | null)[]; // colunas numéricas da linha, na ordem
};

// ------------------------------------------------------------
// Abas de vendedor (Camada 4 — Calculations.md §6 e §8)
// ------------------------------------------------------------
// As 12 abas de pedido são cópias que divergiram entre si: mudam a linha do
// total, a presença do DIFAL, a base da comissão e até a fonte da alíquota.
// Por isso a extração é guiada por RÓTULO (coluna M), nunca por linha fixa —
// uma aba sem a linha "Difal" empurra todas as de baixo para cima.

export type ItemPedidoImportado = {
  linha: number;
  nome: string;
  precoVenda: Decimal | null;
  quantidade: Decimal | null;
  receitaPlanilha: Decimal | null; // coluna F
  cmvUnitario: Decimal | null;     // coluna H (SUMIF na Alocação)
  despesaUnitaria: Decimal | null; // coluna J (idem)
};

// O bloco de deduções do pedido, lido por rótulo.
export type DeducoesImportadas = {
  frete: Decimal | null;
  impostoFrete: Decimal | null;
  imposto: Decimal | null;
  difal: Decimal | null;          // null quando a aba não tem a linha
  comissao: Decimal | null;
  percentualComissao: Decimal | null; // só nas abas com % editável (Externos)
  aliquotaSimples: Decimal | null;    // só no Descpro (alíquota própria, fora da ICSM)
  freteCliente: boolean;              // flag "X"/"x" marcada
  receitaLiquida: Decimal | null;
  margemContribuicao: Decimal | null; // fração já calculada pela planilha
};

export type PedidoImportado = {
  aba: string;
  cliente: string | null;
  uf: string | null;              // como está na planilha (pode vir minúsculo)
  vendedor: string | null;
  linhaTotal: number;             // linha do "Total do Pedido"
  itens: ItemPedidoImportado[];
  receitaPlanilha: Decimal | null; // coluna F da linha de total
  cmvPlanilha: Decimal | null;     // coluna J da linha de total
  despesaPlanilha: Decimal | null; // coluna K da linha de total
  deducoes: DeducoesImportadas;
};

// Uma linha das tabelas de parâmetro (ICSM, DIFAL, Portal).
export type LinhaTabelaFiscal = {
  uf: string;
  valores: (Decimal | null)[]; // colunas numéricas da linha, na ordem
};

export type TabelasFiscais = {
  icsm: LinhaTabelaFiscal[];   // [PIS/COFINS, alíquota ICMS, soma]
  difal: LinhaTabelaFiscal[];  // [pobreza/FCP, alíquota, DIFAL final]
  portal: LinhaTabelaFiscal[]; // [% de frete sobre a receita]
};
