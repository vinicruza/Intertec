import ExcelJS from "exceljs";
import type { Planilha } from "./types";

// Carrega um arquivo .xlsx e o expõe pela interface `Planilha` (leitura pura).
// Isola o exceljs num único ponto — o resto do importador não o conhece.
export async function carregarXlsx(caminho: string): Promise<Planilha> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(caminho);

  // Célula de fórmula no exceljs vem como { formula, result }. Precisamos do
  // valor calculado (result) — nunca da fórmula em si.
  function desembrulhar(v: unknown): string | number | null {
    if (v === null || v === undefined) return null;
    if (typeof v === "number" || typeof v === "string") return v;
    if (typeof v === "object") {
      const obj = v as { result?: unknown; text?: unknown };
      if (obj.result !== undefined) return desembrulhar(obj.result);
      if (obj.text !== undefined) return desembrulhar(obj.text);
      return null;
    }
    return null;
  }

  return {
    abas: () => wb.worksheets.map((ws) => ws.name),
    dimensoes: (aba) => {
      const ws = wb.getWorksheet(aba);
      if (!ws) return { linhas: 0, colunas: 0 };
      return { linhas: ws.rowCount, colunas: ws.columnCount };
    },
    valor: (aba, linha, coluna) => {
      const ws = wb.getWorksheet(aba);
      if (!ws) return null;
      return desembrulhar(ws.getRow(linha).getCell(coluna).value);
    },
  };
}
