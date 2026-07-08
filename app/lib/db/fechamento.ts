import { type ItemPedido } from "@calc";
import { supabase } from "../supabase";
import { simular } from "../sim/params";
import { montarSnapshot, type ItemParaSnapshot } from "../sim/snapshot";
import { carregarContextoSimulador } from "./pedidos";

const TENANT_FIXO = "00000000-0000-0000-0000-000000000001";

// ---------- Histórico ----------

export type PedidoResumo = {
  id: string;
  status: "simulation" | "closed";
  uf: string | null;
  created_at: string;
  closed_at: string | null;
  totals_display: Record<string, string> | null;
  contribution_margin_snapshot: string | null;
  net_revenue_snapshot: string | null;
  customers: { name: string } | null;
  sellers: { name: string } | null;
};

export async function listarPedidos(filtroStatus: "todos" | "simulation" | "closed"): Promise<PedidoResumo[]> {
  let q = supabase
    .from("orders")
    .select(
      "id, status, uf, created_at, closed_at, totals_display, contribution_margin_snapshot, net_revenue_snapshot, customers(name), sellers(name)"
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (filtroStatus !== "todos") q = q.eq("status", filtroStatus);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as PedidoResumo[];
}

export type PedidoCompleto = {
  id: string;
  status: "simulation" | "closed";
  uf: string | null;
  freight: string | null;
  freight_paid_by_customer: boolean;
  commission_rate: string | null;
  channel_id: string | null;
  seller_id: string | null;
  created_at: string;
  closed_at: string | null;
  totals_display: Record<string, string> | null;
  customers: { name: string } | null;
  sellers: { name: string } | null;
  itens: Array<{
    id: string;
    product_id: string | null;
    kit_id: string | null;
    quantity: string;
    unit_price: string;
    cmv_unit_snapshot: string | null;
    expense_unit_snapshot: string | null;
    kit_composition_snapshot: unknown | null;
    products: { name: string } | null;
    kits: { name: string } | null;
  }>;
};

export async function obterPedidoCompleto(id: string): Promise<PedidoCompleto | null> {
  const { data: pedido, error } = await supabase
    .from("orders")
    .select(
      "id, status, uf, freight, freight_paid_by_customer, commission_rate, channel_id, seller_id, created_at, closed_at, totals_display, customers(name), sellers(name)"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!pedido) return null;
  const { data: itens, error: e2 } = await supabase
    .from("order_items")
    .select(
      "id, product_id, kit_id, quantity, unit_price, cmv_unit_snapshot, expense_unit_snapshot, kit_composition_snapshot, products(name), kits(name)"
    )
    .eq("order_id", id);
  if (e2) throw e2;
  return { ...(pedido as unknown as Omit<PedidoCompleto, "itens">), itens: (itens ?? []) as unknown as PedidoCompleto["itens"] };
}

// ---------- Fechamento (D7) ----------

// Fecha o pedido: calcula com os custos VIGENTES, grava o snapshot nos itens
// e no pedido e muda o status. A partir daí o banco impede qualquer alteração
// (trigger da Sprint 2). Reabrir: só Admin, gera trilha de auditoria.
export async function fecharPedido(orderId: string): Promise<void> {
  const pedido = await obterPedidoCompleto(orderId);
  if (!pedido) throw new Error("Pedido não encontrado.");
  if (pedido.status === "closed") throw new Error("Pedido já está fechado.");
  if (!pedido.uf) throw new Error("Fechamento exige UF definida.");

  const ctx = await carregarContextoSimulador();
  const tabela = ctx.tabelaPorUF.get(pedido.uf);
  if (!tabela) throw new Error(`UF ${pedido.uf} sem alíquotas cadastradas.`);
  const vendedor = ctx.vendedores.find((v) => v.id === pedido.seller_id);
  if (!vendedor) throw new Error("Pedido sem vendedor/canal definido.");

  const custoPorItemVendavel = new Map(ctx.itens.map((i) => [i.id, i]));

  // Composição expandida dos kits do pedido (D7): produto, quantidade e CMV do momento.
  const kitIds = pedido.itens.filter((i) => i.kit_id).map((i) => i.kit_id as string);
  const composicaoPorKit = new Map<string, Array<{ produtoId: string; nome: string; quantidade: string; cmvUnitario: string }>>();
  if (kitIds.length > 0) {
    const [{ data: kitItems, error: e1 }, { data: custos, error: e2 }] = await Promise.all([
      supabase.from("kit_items").select("kit_id, product_id, quantity, products(name)").in("kit_id", kitIds),
      supabase.from("product_costs").select("product_id, cmv"),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const cmvPorProduto = new Map((custos ?? []).map((c) => [c.product_id as string, c.cmv as string]));
    for (const ki of kitItems ?? []) {
      const lista = composicaoPorKit.get(ki.kit_id as string) ?? [];
      lista.push({
        produtoId: ki.product_id as string,
        nome: (ki.products as unknown as { name: string } | null)?.name ?? "?",
        quantidade: ki.quantity as string,
        cmvUnitario: cmvPorProduto.get(ki.product_id as string) ?? "0",
      });
      composicaoPorKit.set(ki.kit_id as string, lista);
    }
  }

  // Monta itens do motor e do snapshot com os custos vigentes.
  const itensMotor: ItemPedido[] = [];
  const itensSnapshot: ItemParaSnapshot[] = [];
  for (const item of pedido.itens) {
    const refId = (item.product_id ?? item.kit_id) as string;
    const vendavel = custoPorItemVendavel.get(refId);
    const cmv = vendavel?.cmvUnitario ?? "0"; // 0 → erro bloqueante no motor
    const despesa = vendavel?.despesaUnitaria ?? "0";
    itensMotor.push({
      nome: vendavel?.nome ?? refId,
      precoVenda: item.unit_price,
      quantidade: item.quantity,
      cmvUnitario: cmv,
      despesaUnitaria: despesa,
    });
    itensSnapshot.push({
      orderItemId: item.id,
      precoVenda: item.unit_price,
      quantidade: item.quantity,
      cmvUnitario: cmv,
      despesaUnitaria: despesa,
      composicaoKit: item.kit_id ? composicaoPorKit.get(item.kit_id) ?? null : null,
    });
  }

  // Lança ErroCalculoBloqueante se algum item tiver CMV zerado (T9).
  const sim = simular({
    itens: itensMotor,
    freteManual: pedido.freight ?? "0",
    fretePorContaCliente: pedido.freight_paid_by_customer,
    comissao: pedido.commission_rate,
    canal: vendedor.regras,
    uf: tabela,
  });

  const snap = montarSnapshot(sim, tabela.aliquotaIcsm, itensSnapshot);

  // 1) Snapshot nos itens (pedido ainda em simulação: updates permitidos).
  for (const item of snap.itens) {
    const { orderItemId, ...campos } = item;
    const { error } = await supabase.from("order_items").update(campos).eq("id", orderItemId);
    if (error) throw error;
  }

  // 2) Snapshot no pedido + fechamento (trigger valida UF/comissão/frete e CMVs).
  const { error } = await supabase
    .from("orders")
    .update({ ...snap.pedido, freight: sim.freteUsado.toString(), commission_rate: sim.comissaoUsada.toString(), status: "closed" })
    .eq("id", orderId);
  if (error) throw error;
}

// Reabrir: o RLS só deixa o Admin; o trigger grava a auditoria.
export async function reabrirPedido(orderId: string): Promise<void> {
  const { error } = await supabase.from("orders").update({ status: "simulation" }).eq("id", orderId);
  if (error) throw error;
}

// Duplicar como nova simulação (PRD §6.7): copia dados e itens, sem snapshots.
export async function duplicarPedido(orderId: string): Promise<string> {
  const pedido = await obterPedidoCompleto(orderId);
  if (!pedido) throw new Error("Pedido não encontrado.");

  const { data: novo, error } = await supabase
    .from("orders")
    .insert({
      tenant_id: TENANT_FIXO,
      status: "simulation",
      uf: pedido.uf,
      seller_id: pedido.seller_id,
      channel_id: pedido.channel_id,
      freight: pedido.freight,
      freight_paid_by_customer: pedido.freight_paid_by_customer,
      commission_rate: pedido.commission_rate,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: eItens } = await supabase.from("order_items").insert(
    pedido.itens.map((i) => ({
      tenant_id: TENANT_FIXO,
      order_id: novo.id as string,
      product_id: i.product_id,
      kit_id: i.kit_id,
      quantity: i.quantity,
      unit_price: i.unit_price,
    }))
  );
  if (eItens) throw eItens;
  return novo.id as string;
}
