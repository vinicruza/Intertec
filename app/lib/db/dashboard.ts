import { dec } from "@calc";
import { supabase } from "../supabase";
import type { ItemDash, PedidoDash } from "../sim/dashboard";
import type { RegraMargem } from "../sim/params";
import { limitesMesSaoPaulo } from "../periodo";

// Dados do dashboard: pedidos FECHADOS (com snapshots) e seus itens.
// `mes` = "YYYY-MM" ou null (todos os períodos).
export async function carregarDadosDashboard(mes: string | null): Promise<{
  pedidos: PedidoDash[];
  itens: ItemDash[];
  regras: RegraMargem[];
}> {
  let q = supabase
    .from("orders")
    .select(
      "id, gross_revenue_snapshot, net_revenue_snapshot, contribution_margin_snapshot, customers(id, name), sellers(id, name)"
    )
    .eq("status", "closed");
  if (mes) {
    const { inicio, fim } = limitesMesSaoPaulo(mes);
    q = q.gte("closed_at", inicio).lt("closed_at", fim);
  }
  const { data: pedidos, error } = await q;
  if (error) throw error;

  const ids = (pedidos ?? []).map((p) => p.id as string);
  let itens: ItemDash[] = [];
  if (ids.length > 0) {
    const { data: rows, error: e2 } = await supabase
      .from("order_items")
      .select("order_id, product_id, kit_id, quantity, unit_price, products(name), kits(name)")
      .in("order_id", ids);
    if (e2) throw e2;
    itens = (rows ?? []).map((i) => {
      const produto = (i.products as unknown as { name: string } | null)?.name;
      const kit = (i.kits as unknown as { name: string } | null)?.name;
      return {
        id: (i.product_id ?? i.kit_id) as string,
        tipo: i.product_id ? "produto" as const : "kit" as const,
        nome: produto ?? (kit ? `[Kit] ${kit}` : "—"),
        // Dinheiro nunca em float — mesmo num ranking (regra do CLAUDE.md).
        receita: dec(i.unit_price as string).times(dec(i.quantity as string)).toString(),
        quantidade: i.quantity as string,
      };
    });
  }

  const { data: regras, error: e3 } = await supabase
    .from("margin_rules")
    .select("label, min_rate, max_rate, color, sort_order");
  if (e3) throw e3;

  return {
    pedidos: (pedidos ?? []).map((p) => {
      const cliente = p.customers as unknown as { id: string; name: string } | null;
      const vendedor = p.sellers as unknown as { id: string; name: string } | null;
      return {
      gross_revenue_snapshot: (p.gross_revenue_snapshot as string) ?? "0",
      net_revenue_snapshot: (p.net_revenue_snapshot as string) ?? "0",
      contribution_margin_snapshot: (p.contribution_margin_snapshot as string) ?? "0",
      clienteId: cliente?.id ?? "sem-cliente",
      cliente: cliente?.name ?? "—",
      vendedorId: vendedor?.id ?? "sem-vendedor",
      vendedor: vendedor?.name ?? "—",
    };}),
    itens,
    regras: (regras ?? []) as RegraMargem[],
  };
}
