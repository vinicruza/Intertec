import { type ItemPedido } from "@calc";
import { supabase } from "../supabase";
import { simular, type Simulacao } from "../sim/params";
import { montarSnapshot, type ItemParaSnapshot, type SnapshotPedido } from "../sim/snapshot";
import { carregarContextoSimulador, type ContextoSimulador } from "./pedidos";

// ---------- Histórico ----------

export type PedidoResumo = {
  id: string;
  status: "simulation" | "closed" | "lost";
  quote_number: string | null;
  uf: string | null;
  created_at: string;
  closed_at: string | null;
  lost_at: string | null;
  loss_notes: string | null;
  loss_reasons: { id: string; label: string } | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  revised_from_order_id: string | null;
  revision_reason: string | null;
  totals_display: Record<string, string> | null;
  contribution_margin_snapshot: string | null;
  net_revenue_snapshot: string | null;
  customers: {
    id: string;
    name: string;
    // Segmento do cliente — é por aqui que se responde "quantas cotações
    // foram para veterinário?" (reunião 16/07/2026).
    customer_types: { id: string; name: string } | null;
    customer_specialties: { id: string; name: string } | null;
  } | null;
  sellers: { id: string; name: string } | null;
  channels: { id: string; name: string } | null;
  order_items: Array<{
    item_name_snapshot: string | null;
    item_code_snapshot: string | null;
    products: { name: string; code: string } | null;
    kits: { name: string; code: string } | null;
  }>;
};

export async function listarPedidos(): Promise<PedidoResumo[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, status, quote_number, uf, created_at, closed_at, lost_at, loss_notes, cancelled_at, cancellation_reason, revised_from_order_id, revision_reason, totals_display, contribution_margin_snapshot, net_revenue_snapshot, customers(id, name, customer_types(id, name), customer_specialties(id, name)), sellers(id, name), channels(id, name), loss_reasons(id, label), order_items(item_name_snapshot, item_code_snapshot, products(name,code), kits(name,code))"
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as PedidoResumo[];
}

export type PedidoCompleto = {
  id: string;
  status: "simulation" | "closed" | "lost";
  approval_status: "rascunho" | "pendente" | "aprovado" | "recusado";
  approved_at: string | null;
  approval_notes: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  quote_number: string | null;
  uf: string | null;
  freight: string | null;
  freight_paid_by_customer: boolean;
  commission_rate: string | null;
  channel_id: string | null;
  seller_id: string | null;
  created_at: string;
  closed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  revised_from_order_id: string | null;
  revision_reason: string | null;
  totals_display: Record<string, string> | null;
  customers: { name: string } | null;
  sellers: { name: string } | null;
  revisoes: Array<{ id: string; status: "simulation" | "closed"; cancelled_at: string | null; created_at: string }>;
  itens: Array<{
    id: string;
    product_id: string | null;
    kit_id: string | null;
    quantity: string;
    unit_price: string;
    cmv_unit_snapshot: string | null;
    expense_unit_snapshot: string | null;
    kit_composition_snapshot: unknown | null;
    item_code_snapshot: string | null;
    products: { name: string; code: string } | null;
    kits: { name: string; code: string } | null;
  }>;
};

export async function obterPedidoCompleto(id: string): Promise<PedidoCompleto | null> {
  const { data: pedido, error } = await supabase
    .from("orders")
    .select(
      "id, status, approval_status, approved_at, approval_notes, submitted_by, submitted_at, quote_number, uf, freight, freight_paid_by_customer, commission_rate, channel_id, seller_id, created_at, closed_at, cancelled_at, cancellation_reason, revised_from_order_id, revision_reason, totals_display, customers(name), sellers(name)"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!pedido) return null;
  const { data: itens, error: e2 } = await supabase
    .from("order_items")
    .select(
      "id, product_id, kit_id, quantity, unit_price, cmv_unit_snapshot, expense_unit_snapshot, kit_composition_snapshot, item_code_snapshot, products(name,code), kits(name,code)"
    )
    .eq("order_id", id);
  if (e2) throw e2;
  const { data: revisoes, error: e3 } = await supabase
    .from("orders")
    .select("id, status, cancelled_at, created_at")
    .eq("revised_from_order_id", id)
    .order("created_at", { ascending: false });
  if (e3) throw e3;
  const itensNormalizados = (itens ?? []).map((item) => ({
    ...item,
    quantity: String(item.quantity),
    unit_price: String(item.unit_price),
    cmv_unit_snapshot: item.cmv_unit_snapshot == null ? null : String(item.cmv_unit_snapshot),
    expense_unit_snapshot: item.expense_unit_snapshot == null ? null : String(item.expense_unit_snapshot),
  }));
  return {
    ...(pedido as unknown as Omit<PedidoCompleto, "itens" | "revisoes">),
    itens: itensNormalizados as unknown as PedidoCompleto["itens"],
    revisoes: (revisoes ?? []) as PedidoCompleto["revisoes"],
  };
}

// ---------- Fechamento (D7) ----------

// Fecha o pedido: calcula com os custos VIGENTES, grava o snapshot nos itens
// e no pedido e muda o status. A partir daí o banco impede qualquer alteração
// (trigger da Sprint 2). Reabrir: só Admin, gera trilha de auditoria.
// Monta a cascata (preço, CMV, margem) com os custos VIGENTES agora — os
// mesmos que o fechamento usaria se fosse fechado neste instante. Reaproveitada
// em dois lugares: no fechamento de verdade (que grava o snapshot) e na
// pré-visualização de quem aprova (que só EXIBE, sem gravar nada — o snapshot
// nasce só no fechamento, Decisão D7).
async function simularPedidoComCustosVigentes(
  pedido: PedidoCompleto,
  ctx: ContextoSimulador
): Promise<{ sim: Simulacao; snap: SnapshotPedido }> {
  const tabela = ctx.tabelaPorUF.get(pedido.uf ?? "");
  if (!tabela) throw new Error(`UF ${pedido.uf ?? "—"} sem alíquotas cadastradas.`);
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

  return { sim, snap: montarSnapshot(sim, tabela.aliquotaIcsm, itensSnapshot) };
}

export async function fecharPedido(orderId: string): Promise<void> {
  // O código oficial do kit só nasce agora (reunião 16/07/2026). Os kits
  // montados dentro do pedido viram kits de catálogo aqui — reaproveitando o
  // código quando a mesma composição já existe. Precisa vir ANTES de ler o
  // pedido, porque a materialização preenche o kit_id dos itens.
  // Aprovação vem antes de tudo: se o Administrador exigir, pedido não
  // aprovado não fecha (reunião 16/07/2026 — o papel que ia para a mesa da
  // conferência agora é um estado no sistema).
  const { error: erroAprovacao } = await supabase.rpc("assert_order_approved", { p_order_id: orderId });
  if (erroAprovacao) throw erroAprovacao;

  const { error: erroKits } = await supabase.rpc("materialize_ad_hoc_kits", { p_order_id: orderId });
  if (erroKits) throw erroKits;

  const pedido = await obterPedidoCompleto(orderId);
  if (!pedido) throw new Error("Pedido não encontrado.");
  if (pedido.status === "closed") throw new Error("Pedido já está fechado.");
  if (pedido.status === "lost") throw new Error("Cotação marcada como perdida — reabra antes de fechar.");
  if (pedido.cancelled_at) throw new Error("Pedido cancelado não pode ser fechado.");
  if (!pedido.uf) throw new Error("Fechamento exige UF definida.");

  const ctx = await carregarContextoSimulador();
  const { sim, snap } = await simularPedidoComCustosVigentes(pedido, ctx);

  // Snapshot dos itens e do pedido são persistidos na mesma transação.
  const { error } = await supabase.rpc("close_order_with_snapshots", {
    p_order_id: orderId,
    p_order_snapshot: snap.pedido,
    p_item_snapshots: snap.itens,
    p_freight: sim.freteUsado.toString(),
    p_commission_rate: sim.comissaoUsada.toString(),
  });
  if (error) throw error;
}

// ---------- Pré-visualização para quem aprova (nada é gravado) ----------
//
// O pedido pendente de aprovação ainda está em simulação: CMV, margem e a
// cascata inteira só são gravados no FECHAMENTO (Decisão D7), então
// `pedido.totals_display` está vazio enquanto aprova. Sem isto, o card de
// aprovação pedia para "conferir CMV e margem" sem mostrar nenhum dos dois.
export type CascataVigente =
  | { ok: true; totals: Record<string, string>; cmvPorItem: Map<string, string> }
  | { ok: false; erro: string };

export async function calcularCascataVigente(orderId: string): Promise<CascataVigente> {
  const pedido = await obterPedidoCompleto(orderId);
  if (!pedido) return { ok: false, erro: "Pedido não encontrado." };
  if (!pedido.uf) return { ok: false, erro: "Pedido sem UF definida." };
  if (pedido.itens.length === 0) return { ok: false, erro: "Pedido sem itens." };

  try {
    const ctx = await carregarContextoSimulador();
    const { snap } = await simularPedidoComCustosVigentes(pedido, ctx);
    return {
      ok: true,
      totals: snap.pedido.totals_display,
      cmvPorItem: new Map(snap.itens.map((i) => [i.orderItemId, i.cmv_unit_snapshot])),
    };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não foi possível calcular a cascata." };
  }
}

// Pedido fechado permanece imutável; a revisão é uma nova simulação vinculada.
export async function reabrirPedido(orderId: string): Promise<string> {
  const { data, error } = await supabase.rpc("copy_order_as_simulation", {
    p_order_id: orderId,
    p_reason: "revision",
  });
  if (error) throw error;
  return data as string;
}

// Duplicar como nova simulação (PRD §6.7): copia dados e itens, sem snapshots.
export async function duplicarPedido(orderId: string): Promise<string> {
  const { data, error } = await supabase.rpc("copy_order_as_simulation", {
    p_order_id: orderId,
    p_reason: "duplicate",
  });
  if (error) throw error;
  return data as string;
}

export async function cancelarPedido(orderId: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_order", { p_order_id: orderId, p_reason: motivo });
  if (error) throw error;
}
