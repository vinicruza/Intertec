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
      "id, closed_at, cancelled_at, gross_revenue_snapshot, net_revenue_snapshot, contribution_margin_snapshot, customers(id, name), sellers(id, name)"
    )
    .eq("status", "closed");
  if (mes) {
    const { inicio, fim } = limitesMesSaoPaulo(mes);
    q = q.or(`and(closed_at.gte.${inicio},closed_at.lt.${fim}),and(cancelled_at.gte.${inicio},cancelled_at.lt.${fim})`);
  }
  const { data: pedidos, error } = await q;
  if (error) throw error;

  const limites = mes ? limitesMesSaoPaulo(mes) : null;
  const eventosPorPedido = new Map<string, Array<1 | -1>>();
  for (const p of pedidos ?? []) {
    const eventos: Array<1 | -1> = [];
    const fechadoEm = p.closed_at as string | null;
    const canceladoEm = p.cancelled_at as string | null;
    if (!limites || (fechadoEm && fechadoEm >= limites.inicio && fechadoEm < limites.fim)) eventos.push(1);
    if (canceladoEm && (!limites || (canceladoEm >= limites.inicio && canceladoEm < limites.fim))) eventos.push(-1);
    eventosPorPedido.set(p.id as string, eventos);
  }
  const ids = [...eventosPorPedido.keys()];
  let itens: ItemDash[] = [];
  if (ids.length > 0) {
    const { data: rows, error: e2 } = await supabase
      .from("order_items")
      .select("order_id, product_id, kit_id, quantity, unit_price, products(name), kits(name)")
      .in("order_id", ids);
    if (e2) throw e2;
    itens = (rows ?? []).flatMap((i) => {
      const produto = (i.products as unknown as { name: string } | null)?.name;
      const kit = (i.kits as unknown as { name: string } | null)?.name;
      return (eventosPorPedido.get(i.order_id as string) ?? []).map((sinal) => ({
        id: (i.product_id ?? i.kit_id) as string,
        tipo: i.product_id ? "produto" as const : "kit" as const,
        nome: produto ?? (kit ? `[Kit] ${kit}` : "—"),
        // Dinheiro nunca em float — mesmo num ranking (regra do CLAUDE.md).
        receita: dec(String(i.unit_price)).times(dec(String(i.quantity))).toString(),
        quantidade: String(i.quantity),
        sinal,
      }));
    });
  }

  const { data: regras, error: e3 } = await supabase
    .from("margin_rules")
    .select("label, min_rate, max_rate, color, sort_order");
  if (e3) throw e3;

  return {
    pedidos: (pedidos ?? []).flatMap((p) => {
      const cliente = p.customers as unknown as { id: string; name: string } | null;
      const vendedor = p.sellers as unknown as { id: string; name: string } | null;
      return (eventosPorPedido.get(p.id as string) ?? []).map((sinal) => ({
      gross_revenue_snapshot: String(p.gross_revenue_snapshot ?? 0),
      net_revenue_snapshot: String(p.net_revenue_snapshot ?? 0),
      contribution_margin_snapshot: String(p.contribution_margin_snapshot ?? 0),
      clienteId: cliente?.id ?? "sem-cliente",
      cliente: cliente?.name ?? "—",
      vendedorId: vendedor?.id ?? "sem-vendedor",
      vendedor: vendedor?.name ?? "—",
      sinal,
    }));}),
    itens,
    regras: (regras ?? []) as RegraMargem[],
  };
}
