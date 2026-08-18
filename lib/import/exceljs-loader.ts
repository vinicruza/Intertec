import ExcelJS from "exceljs";
import type { Planilha } from "./types";

// Carrega um arquivo .xlsx e o expõe pela interface `Planilha` (leitura pura).
// Isola o exceljs num único ponto — o resto do importador não o conhece.
export async function carregarXlsx(caminho: string): Promise<Planilha> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(caminho);
  return planilhaDeWorkbook(wb);
}

// Envolve um workbook já carregado. Separado do `carregarXlsx` para que a
// leitura de célula possa ser testada com um workbook montado em memória, sem
// depender de arquivo em disco (nem do arquivo do cliente, que não vai ao Git).
export function planilhaDeWorkbook(wb: ExcelJS.Workbook): Planilha {
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
      const celula = ws.getRow(linha).getCell(coluna);

      // Numa célula de fórmula, lemos `cell.result` em vez de `cell.value`.
      //
      // Motivo (achado em 18/08/2026, conferindo a aba Edmilson): o getter
      // `value` do exceljs monta o objeto com um `if (value)` — um teste de
      // veracidade, não de existência. Resultado em cache igual a ZERO é
      // falsy e some do objeto, e a célula chega aqui como se nunca tivesse
      // sido calculada. O arquivo tem `<v>0</v>` gravado; era o leitor que o
      // descartava.
      //
      // Consequência prática: "Imposto = R$ 0,00" virava "linha ausente" no
      // relatório — a diferença entre um imposto zerado de propósito e um
      // campo que ninguém preencheu, que é exatamente o que a conferência
      // precisa distinguir. `cell.result` lê o mesmo dado sem o filtro.
      //
      // Fórmula sem valor em cache continua devolvendo null: o leitor nunca
      // inventa um zero que a planilha não tem (regra do "zero silencioso").
      if (celula.type === ExcelJS.ValueType.Formula) {
        return desembrulhar(celula.result);
      }
      return desembrulhar(celula.value);
    },
  };
}
