import type { PedidoResumo } from "../db/fechamento";

export async function exportarHistoricoPedidos(pedidos: PedidoResumo[]): Promise<void> {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = "Intertech Surgical";
  const sheet = workbook.addWorksheet("Pedidos");
  sheet.columns = [
    { header: "Criado em", key: "criado", width: 14 },
    { header: "Fechado em", key: "fechado", width: 14 },
    { header: "Cancelado em", key: "cancelado", width: 14 },
    { header: "Status", key: "status", width: 14 },
    { header: "Cliente", key: "cliente", width: 32 },
    { header: "Vendedor", key: "vendedor", width: 24 },
    { header: "Canal", key: "canal", width: 20 },
    { header: "UF", key: "uf", width: 8 },
    { header: "Itens", key: "itens", width: 50 },
    { header: "Receita líquida (R$)", key: "receita", width: 22 },
    { header: "Margem contribuição (R$)", key: "margem", width: 28 },
    { header: "Motivo cancelamento", key: "motivo", width: 42 },
  ];
  for (const p of pedidos) sheet.addRow({
    criado: p.created_at.slice(0, 10),
    fechado: p.closed_at?.slice(0, 10) ?? "",
    cancelado: p.cancelled_at?.slice(0, 10) ?? "",
    status: p.cancelled_at ? "Cancelado" : p.status === "closed" ? "Fechado" : "Simulação",
    cliente: p.customers?.name ?? "",
    vendedor: p.sellers?.name ?? "",
    canal: p.channels?.name ?? "",
    uf: p.uf ?? "",
    itens: p.order_items.map((i) => `${i.item_code_snapshot ?? i.products?.code ?? i.kits?.code ?? ""} ${i.item_name_snapshot ?? i.products?.name ?? (i.kits ? `[Kit] ${i.kits.name}` : "")}`.trim()).join("; "),
    receita: p.net_revenue_snapshot == null ? null : Number(p.net_revenue_snapshot),
    margem: p.contribution_margin_snapshot == null ? null : Number(p.contribution_margin_snapshot),
    motivo: p.cancellation_reason ?? "",
  });
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getColumn("receita").numFmt = '#,##0.00';
  sheet.getColumn("margem").numFmt = '#,##0.00';
  sheet.autoFilter = { from: "A1", to: "L1" };
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(buffer as ArrayBuffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "historico-pedidos-intertech.xlsx";
  link.click();
  URL.revokeObjectURL(url);
}
