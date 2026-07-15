import type { AberturaDRE, DRE, LinhaDRE } from "../sim/dre";

const numero = (linha: LinhaDRE | null) => linha ? Number(linha.valor.toFixed(2)) : null;

export async function exportarDREExcel(dre: DRE, mes: string): Promise<void> {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = "Intertec";
  workbook.created = new Date();

  const resumo = workbook.addWorksheet("DRE");
  resumo.columns = [{ header: "Linha", key: "linha", width: 42 }, { header: "Valor (R$)", key: "valor", width: 18 }];
  [
    ["Receita bruta", numero(dre.receitaBruta)],
    ["Impostos + DIFAL", numero(dre.impostosEDifal)],
    ["Receita líquida", numero(dre.receitaLiquida)],
    ["CMV", numero(dre.cmv)],
    ["Lucro bruto", numero(dre.lucroBruto)],
    ["Frete + comissões", numero(dre.freteEComissoes)],
    ["Margem de contribuição", numero(dre.margemContribuicao)],
    ["Despesa fixa real", numero(dre.despesaFixaReal)],
    ["Resultado operacional", numero(dre.resultadoOperacional)],
    ["Variação de absorção", dre.variacaoAbsorcao ? Number(dre.variacaoAbsorcao.toFixed(2)) : null],
  ].forEach(([linha, valor]) => resumo.addRow({ linha, valor }));

  const adicionarAbertura = (nome: string, linhas: AberturaDRE[]) => {
    const sheet = workbook.addWorksheet(nome.slice(0, 31));
    sheet.columns = [
      { header: "Nome", key: "nome", width: 42 },
      { header: "Receita bruta (R$)", key: "receita", width: 20 },
      { header: "Margem de contribuição (R$)", key: "margem", width: 28 },
    ];
    linhas.forEach((l) => sheet.addRow({
      nome: l.nome,
      receita: Number(l.receitaBruta.toFixed(2)),
      margem: Number(l.margemContribuicao.toFixed(2)),
    }));
  };
  adicionarAbertura("Por vendedor", dre.aberturas.porVendedor);
  adicionarAbertura("Por canal", dre.aberturas.porCanal);
  adicionarAbertura("Por cliente", dre.aberturas.porCliente);
  adicionarAbertura("Por categoria", dre.aberturas.porCategoria);
  adicionarAbertura("Por produto e kit", dre.aberturas.porItem);

  for (const sheet of workbook.worksheets) {
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.getColumn(2).numFmt = '#,##0.00';
    if (sheet.columnCount >= 3) sheet.getColumn(3).numFmt = '#,##0.00';
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(buffer as ArrayBuffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dre-intertec-${mes}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
