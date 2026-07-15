import { supabase } from "../supabase";
import type { PedidoParaDRE } from "../sim/dre";
import { limitesMesSaoPaulo } from "../periodo";

// Pedidos FECHADOS no mês, com seus snapshots (custos do momento da venda).
export async function pedidosFechadosDoMes(mes: string): Promise<PedidoParaDRE[]> {
  const { inicio, fim } = limitesMesSaoPaulo(mes);
  const { data, error } = await supabase
    .from("orders")
    .select(
      "gross_revenue_snapshot, tax_snapshot, freight_tax_snapshot, difal_snapshot, commission_amount_snapshot, cmv_total_snapshot, expense_total_snapshot, contribution_margin_snapshot, sellers(id, name), channels(id, name)"
    )
    .eq("status", "closed")
    .gte("closed_at", inicio)
    .lt("closed_at", fim);
  if (error) throw error;
  return (data ?? []).map((p) => {
    const vendedor = p.sellers as unknown as { id: string; name: string } | null;
    const canal = p.channels as unknown as { id: string; name: string } | null;
    return {
    gross_revenue_snapshot: (p.gross_revenue_snapshot as string) ?? "0",
    tax_snapshot: (p.tax_snapshot as string) ?? "0",
    freight_tax_snapshot: (p.freight_tax_snapshot as string) ?? "0",
    difal_snapshot: (p.difal_snapshot as string) ?? "0",
    commission_amount_snapshot: (p.commission_amount_snapshot as string) ?? "0",
    cmv_total_snapshot: (p.cmv_total_snapshot as string) ?? "0",
    expense_total_snapshot: (p.expense_total_snapshot as string) ?? "0",
    contribution_margin_snapshot: (p.contribution_margin_snapshot as string) ?? "0",
    vendedorId: vendedor?.id ?? "sem-vendedor",
    vendedor: vendedor?.name ?? "—",
    canalId: canal?.id ?? "sem-canal",
    canal: canal?.name ?? "—",
  };});
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
