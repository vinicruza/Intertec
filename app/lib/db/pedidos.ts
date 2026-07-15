import { Decimal, calcularAlocacao, custoKit, somaDosPesos, type EntradaDecimal } from "@calc";
import { supabase } from "../supabase";
import type { CanalRegras, RegraMargem, TabelasUF } from "../sim/params";

// ---------- Contexto do simulador (tudo que a tela precisa) ----------

export type VendedorOpcao = {
  id: string;
  name: string;
  channel_id: string;
  canalNome: string;
  regras: CanalRegras;
};

export type ItemVendavel = {
  tipo: "produto" | "kit";
  id: string;
  nome: string;
  codigo: string;
  cmvUnitario: string | null; // null = sem custo vigente (erro bloqueante ao usar)
  despesaUnitaria: string | null;
};

export type ContextoSimulador = {
  vendedores: VendedorOpcao[];
  clientes: Array<{ id: string; name: string; uf: string | null }>;
  ufs: string[]; // UFs com alíquota ICSM cadastrada
  tabelaPorUF: Map<string, TabelasUF>;
  itens: ItemVendavel[];
  regrasMargem: RegraMargem[];
};

export async function carregarContextoSimulador(): Promise<ContextoSimulador> {
  const [vend, cli, icsm, difal, portal, regras, prods, custos, kits, periodo] = await Promise.all([
    supabase.from("sellers").select("id, name, channel_id, channels(name, applies_difal, default_commission_rate, freight_model)").eq("active", true).order("name"),
    supabase.from("customers").select("id, name, uf").eq("active", true).order("name"),
    supabase.from("icsm_rates").select("uf, icms_rate, pis_cofins_rate"),
    supabase.from("difal_rates").select("uf, final_rate"),
    supabase.from("portal_freight_rates").select("uf, freight_percent"),
    supabase.from("margin_rules").select("label, min_rate, max_rate, color, sort_order"),
    supabase.from("products").select("id, code, name").eq("status", "active").order("name"),
    supabase.from("product_costs").select("product_id, cmv"),
    supabase.from("kits").select("id, code, name, kit_items(product_id, quantity)").eq("status", "active").order("name"),
    supabase.from("expense_allocation_periods").select("id, total_expense").eq("status", "open").order("period", { ascending: false }).limit(1),
  ]);
  for (const r of [vend, cli, icsm, difal, portal, regras, prods, custos, kits, periodo]) {
    if (r.error) throw r.error;
  }

  // Despesa unitária vigente: período de alocação ABERTO mais recente (D3).
  const despesaPorProduto = new Map<string, string>();
  const periodoAberto = periodo.data?.[0];
  if (periodoAberto) {
    const { data: alocs, error } = await supabase
      .from("expense_allocations")
      .select("product_id, estimated_production, complexity_factor")
      .eq("period_id", periodoAberto.id);
    if (error) throw error;
    const linhas = alocs ?? [];
    const pesos = somaDosPesos(
      linhas.map((l) => ({ producaoEstimada: l.estimated_production as string, fatorComplexidade: l.complexity_factor as string }))
    );
    if (pesos.gt(0)) {
      for (const l of linhas) {
        const r = calcularAlocacao({
          producaoEstimada: l.estimated_production as string,
          fatorComplexidade: l.complexity_factor as string,
          totalDespesa: periodoAberto.total_expense as string,
          somaPesos: pesos,
        });
        despesaPorProduto.set(l.product_id as string, r.despesaUnitaria.toString());
      }
    }
  }

  const cmvPorProduto = new Map<string, string>((custos.data ?? []).map((c) => [c.product_id as string, c.cmv as string]));

  const itensProdutos: ItemVendavel[] = (prods.data ?? []).map((p) => ({
    tipo: "produto",
    id: p.id as string,
    nome: p.name as string,
    codigo: p.code as string,
    cmvUnitario: cmvPorProduto.get(p.id as string) ?? null,
    despesaUnitaria: despesaPorProduto.get(p.id as string) ?? null,
  }));

  // Kit: CMV e despesa = soma ponderada dos produtos (Calculations.md §4).
  const itensKits: ItemVendavel[] = (kits.data ?? []).map((k) => {
    const composicao = (k.kit_items as Array<{ product_id: string; quantity: string }>).map((i) => ({
      produtoId: i.product_id,
      quantidade: i.quantity,
    }));
    let cmv: string | null = null;
    let despesa: string | null = null;
    try {
      cmv = custoKit(composicao, cmvPorProduto as Map<string, EntradaDecimal>).toString();
    } catch {
      cmv = null;
    }
    try {
      despesa = custoKit(composicao, despesaPorProduto as Map<string, EntradaDecimal>).toString();
    } catch {
      despesa = null;
    }
    return { tipo: "kit", id: k.id as string, codigo: k.code as string, nome: `[Kit] ${k.name as string}`, cmvUnitario: cmv, despesaUnitaria: despesa };
  });

  const tabelaPorUF = new Map<string, TabelasUF>();
  const difalPorUF = new Map((difal.data ?? []).map((d) => [d.uf as string, d.final_rate as string]));
  const portalPorUF = new Map((portal.data ?? []).map((p) => [p.uf as string, p.freight_percent as string]));
  for (const r of icsm.data ?? []) {
    const uf = r.uf as string;
    const aliquota = new Decimal(r.icms_rate as string).plus(r.pis_cofins_rate as string).toString();
    tabelaPorUF.set(uf, {
      aliquotaIcsm: aliquota,
      difalFinal: difalPorUF.get(uf) ?? "0",
      fretePortalPct: portalPorUF.get(uf) ?? null,
    });
  }

  return {
    vendedores: (vend.data ?? []).map((v) => {
      const c = v.channels as unknown as { name: string; applies_difal: boolean; default_commission_rate: string; freight_model: "manual" | "uf_percent" } | null;
      return {
        id: v.id as string,
        name: v.name as string,
        channel_id: v.channel_id as string,
        canalNome: c?.name ?? "—",
        regras: {
          aplicaDifal: c?.applies_difal ?? true,
          comissaoPadrao: c?.default_commission_rate ?? "0.025",
          modeloFrete: c?.freight_model ?? "manual",
        },
      };
    }),
    clientes: (cli.data ?? []) as Array<{ id: string; name: string; uf: string | null }>,
    ufs: [...tabelaPorUF.keys()].sort(),
    tabelaPorUF,
    itens: [...itensProdutos, ...itensKits],
    regrasMargem: (regras.data ?? []) as RegraMargem[],
  };
}

// ---------- Gravação da simulação ----------

export type ItemSimulacao = {
  tipo: "produto" | "kit";
  refId: string;
  quantidade: string;
  precoVenda: string;
};

export type DadosSimulacao = {
  clienteId: string | null;
  clienteNovoNome: string | null;
  uf: string;
  vendedorId: string;
  channelId: string;
  frete: string;
  fretePorContaCliente: boolean;
  comissao: string; // fração efetivamente usada
  itens: ItemSimulacao[];
};

// Salva a simulação (status = simulation). Snapshots NÃO são gravados aqui —
// o congelamento acontece só no fechamento do pedido (D7, Sprint 11).
export async function salvarSimulacao(d: DadosSimulacao): Promise<string> {
  const { data, error } = await supabase.rpc("create_order_with_items", {
    p_order: {
      customer_id: d.clienteId,
      customer_name: d.clienteNovoNome?.trim() || null,
      uf: d.uf,
      seller_id: d.vendedorId,
      channel_id: d.channelId,
      freight: d.frete.trim().replace(",", "."),
      freight_paid_by_customer: d.fretePorContaCliente,
      commission_rate: d.comissao,
    },
    p_items: d.itens.map((i) => ({
      product_id: i.tipo === "produto" ? i.refId : null,
      kit_id: i.tipo === "kit" ? i.refId : null,
      quantity: i.quantidade.trim().replace(",", "."),
      unit_price: i.precoVenda.trim().replace(",", "."),
    })),
  });
  if (error) throw error;
  return data as string;
}
