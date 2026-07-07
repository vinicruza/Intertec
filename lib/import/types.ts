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
