import { supabase } from "../supabase";
import type { ItemParaDRE, PedidoParaDRE } from "../sim/dre";
import { limitesMesSaoPaulo } from "../periodo";

// Pedidos FECHADOS no mês, com seus snapshots (custos do momento da venda).
export async function dadosDREDoMes(mes: string): Promise<{ pedidos: PedidoParaDRE[]; itens: ItemParaDRE[] }> {
  const { inicio, fim } = limitesMesSaoPaulo(mes);
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, gross_revenue_snapshot, tax_snapshot, freight_tax_snapshot, difal_snapshot, commission_amount_snapshot, cmv_total_snapshot, expense_total_snapshot, contribution_margin_snapshot, customers(id, name), sellers(id, name), channels(id, name), order_items(id, order_id, product_id, kit_id, quantity, unit_price, cmv_unit_snapshot, item_name_snapshot, item_category_snapshot)"
    )
    .eq("status", "closed")
    .gte("closed_at", inicio)
    .lt("closed_at", fim);
  if (error) throw error;
  const pedidos: PedidoParaDRE[] = [];
  const itens: ItemParaDRE[] = [];
  for (const p of data ?? []) {
    const cliente = p.customers as unknown as { id: string; name: string } | null;
    const vendedor = p.sellers as unknown as { id: string; name: string } | null;
    const canal = p.channels as unknown as { id: string; name: string } | null;
    pedidos.push({
      id: p.id as string,
      gross_revenue_snapshot: String(p.gross_revenue_snapshot ?? 0),
      tax_snapshot: String(p.tax_snapshot ?? 0),
      freight_tax_snapshot: String(p.freight_tax_snapshot ?? 0),
      difal_snapshot: String(p.difal_snapshot ?? 0),
      commission_amount_snapshot: String(p.commission_amount_snapshot ?? 0),
      cmv_total_snapshot: String(p.cmv_total_snapshot ?? 0),
      expense_total_snapshot: String(p.expense_total_snapshot ?? 0),
      contribution_margin_snapshot: String(p.contribution_margin_snapshot ?? 0),
      clienteId: cliente?.id ?? "sem-cliente",
      cliente: cliente?.name ?? "—",
      vendedorId: vendedor?.id ?? "sem-vendedor",
      vendedor: vendedor?.name ?? "—",
      canalId: canal?.id ?? "sem-canal",
      canal: canal?.name ?? "—",
    });
    const linhas = p.order_items as unknown as Array<{
      id: string; order_id: string; product_id: string | null; kit_id: string | null;
      quantity: string | number; unit_price: string | number; cmv_unit_snapshot: string | number | null;
      item_name_snapshot: string | null; item_category_snapshot: string | null;
    }>;
    for (const item of linhas ?? []) itens.push({
      id: (item.product_id ?? item.kit_id) as string,
      orderId: item.order_id,
      tipo: item.product_id ? "produto" : "kit",
      nome: item.item_name_snapshot ?? "—",
      categoria: item.item_category_snapshot ?? "Sem categoria",
      quantidade: String(item.quantity),
      precoUnitario: String(item.unit_price),
      cmvUnitario: String(item.cmv_unit_snapshot ?? 0),
    });
  }
  return { pedidos, itens };
}

// Despesa fixa REAL do mês (digitada pelo Financeiro — D3).
export async function obterDespesaReal(mes: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("real_monthly_expenses")
    .select("amount")
    .eq("period", `${mes}-01`)
    .maybeSingle();
  if (error) throw error;
  return (data?.amount as string | undefined) ?? null;
}

export async function salvarDespesaReal(mes: string, valor: string): Promise<void> {
  const { error } = await supabase.rpc("save_real_monthly_expense", {
    p_period: `${mes}-01`,
    p_amount: valor.trim().replace(",", "."),
  });
  if (error) throw error;
}
